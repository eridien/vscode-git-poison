import * as vscode from 'vscode';
import { getExcludeGlobs, getPill } from './config';
import { gitChangedPaths } from './gitHelpers';
import { Occ } from './jump';

export class PillIndexer {
    private filesWithPills = new Set<string>();           // fsPath
    private occsByFile = new Map<string, Occ[]>();        // fsPath -> occurrences
    private debounceTimer?: ReturnType<typeof setTimeout>; // This works everywhere
  
  // Events for UI (e.g., status bar)
  private _onCountsChanged = new vscode.EventEmitter<{ files: number; occs: number }>();
  public readonly onCountsChanged = this._onCountsChanged.event;

  // ---------- PUBLIC ----------

  /**
   * Full scan across the workspace (ripgrep). Kept for manual invocation,
   * but NOT called at activation anymore (lazy startup).
   */
  async fullScan() {
    this.filesWithPills.clear();
    this.occsByFile.clear();

    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) return;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Scanning for pills…' },
      async () => {
        await Promise.all(folders.map(f => this.scanFolderForPills(f)));
      }
    );
    this.emitCounts();
  }

  /**
   * Incremental refresh using Git (changed + staged + untracked).
   * This is cheap and is used both after startup and on-demand.
   */
  async rescanIncremental() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) return;
    const paths = new Set<string>();

    for (const folder of folders) {
      const changed = await gitChangedPaths(folder);
      changed.forEach(rel => paths.add(vscode.Uri.joinPath(folder.uri, rel).fsPath));
    }
    await this.rescanMany([...paths]);
    this.emitCounts();
  }

  /**
   * Lazy warming for startup & first use:
   * - index the current editor (if any),
   * - index all visible editors,
   * - do a cheap incremental refresh via Git.
   * Avoids a full tree scan unless explicitly requested.
   */
  async lazyWarm(contextEditor?: vscode.TextEditor) {
    if (contextEditor?.document?.uri?.scheme === 'file') {
      this.updateFromDoc(contextEditor.document);
    }
    this.warmOpenEditors();
    await this.rescanIncremental();
  }

  /**
   * Scan all currently visible text editors (fast, in-memory).
   */
  warmOpenEditors() {
    const editors = vscode.window.visibleTextEditors;
    for (const ed of editors) {
      if (ed.document.uri.scheme !== 'file') continue;
      this.updateFromDoc(ed.document);
    }
    this.emitCounts();
  }

  /**
   * Watchers to keep the cache fresh going forward.
   */
  activateWatchers() {
    vscode.workspace.onDidChangeTextDocument(ev => {
      if (ev.document.uri.scheme !== 'file') return;
      this.updateFromDoc(ev.document);
      this.emitCounts();
    });
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme !== 'file') return;
      this.updateFromDoc(doc);
      this.emitCounts();
    });
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    watcher.onDidCreate(uri => this.rescanOne(uri.fsPath).then(() => this.emitCounts()));
    watcher.onDidChange(uri => this.rescanOne(uri.fsPath).then(() => this.emitCounts()));
    watcher.onDidDelete(uri => {
      this.filesWithPills.delete(uri.fsPath);
      this.occsByFile.delete(uri.fsPath);
      this.emitCounts();
    });
  }

  getAllOccurrences(): Occ[] {
    const entries: Occ[] = [];
    for (const occs of this.occsByFile.values()) entries.push(...occs);
    entries.sort((a, b) =>
      a.uri.fsPath === b.uri.fsPath
        ? (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
        : a.uri.fsPath.localeCompare(b.uri.fsPath)
    );
    return entries;
  }

  getFilesWithPills(): string[] { return [...this.filesWithPills]; }

  // NEW: return occurrences for a specific file, sorted by position
  getOccurrencesForUri(uri: vscode.Uri): Occ[] {
    const arr = this.occsByFile.get(uri.fsPath) ?? [];
    return arr.slice().sort((a, b) =>
      (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
    );
  }

  /**
   * Whether we’ve indexed anything yet (helps decide if we should lazily warm).
   */
  hasAnyIndex(): boolean {
    return this.filesWithPills.size > 0 || this.occsByFile.size > 0;
  }

  // ---------- INTERNAL ----------

  private async scanFolderForPills(folder: vscode.WorkspaceFolder) {
    const include = new vscode.RelativePattern(folder, '**/*');
    const exclude = getExcludeGlobs();
  
    // Find all files
    const files = await vscode.workspace.findFiles(include, exclude);
    
    // Process files in batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const tasks = batch.map(uri => this.processFileForPills(uri));
      await Promise.all(tasks);
    }
  }
  
  private async processFileForPills(uri: vscode.Uri): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      this.updateFromDoc(doc);
    } catch {
      // Ignore files that can't be opened
    }
  }
  private async rescanMany(paths: string[]) {
    if (!paths.length) return;
    clearTimeout(this.debounceTimer as any);
    await new Promise<void>(resolve => {
      this.debounceTimer = setTimeout(async () => {
        await Promise.all(paths.map(p => this.rescanOne(p)));
        resolve();
      }, 60);
    });
  }

  private async rescanOne(fsPath: string) {
    const uri = vscode.Uri.file(fsPath);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      this.updateFromDoc(doc);
    } catch { /* ignore */ }
  }

  private updateFromDoc(doc: vscode.TextDocument) {
    const pill = getPill();
    const text = doc.getText();
    const occs: Occ[] = [];
    let idx = 0;
    while (true) {
      idx = text.indexOf(pill, idx);
      if (idx === -1) break;
      const pos = doc.positionAt(idx);
      occs.push({ uri: doc.uri, pos });
      idx += pill.length || 1;
    }
    this.occsByFile.set(doc.uri.fsPath, occs);
    if (occs.length) this.filesWithPills.add(doc.uri.fsPath);
    else this.filesWithPills.delete(doc.uri.fsPath);
  }

  private indexDocumentHits(uri: vscode.Uri, ranges: readonly vscode.Range[]) {
    const occs: Occ[] = ranges.map(r => ({ uri, pos: r.start }));
    this.occsByFile.set(uri.fsPath, occs);
    if (occs.length) this.filesWithPills.add(uri.fsPath);
    else this.filesWithPills.delete(uri.fsPath);
  }

  private emitCounts() {
    let occs = 0;
    for (const v of this.occsByFile.values()) occs += v.length;
    this._onCountsChanged.fire({ files: this.filesWithPills.size, occs });
  }
}
