import * as vscode                  from 'vscode';
import { getExcludeGlobs, getPill } from './config';
import { gitChangedPaths }          from './gitHelpers';
import { Occ }                      from './jump';

//​​​​‌======= PILL INDEXER =======

export class PillIndexer {
  private filesWithPills = new Set<string>();            // fsPath
  private occsByFile     = new Map<string, Occ[]>();     // fsPath -> occurrences
  private debounceTimer?: ReturnType<typeof setTimeout>; // This works everywhere
  private statusBar?: any; // Reference to status bar
  
  // Events for UI (e.g., status bar)
  private _onCountsChanged = new vscode.EventEmitter<{ total: number; staged: number }>();
  public readonly onCountsChanged = this._onCountsChanged.event;

  // Add method to set status bar reference
  setStatusBar(statusBar: any) {
    this.statusBar = statusBar;
  }

  /**
   * Get count of pills in staged files
   */
  async getStagedPillCount(): Promise<number> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) return 0;
    
    const stagedPaths = new Set<string>();
    
    // Get all staged files from git
    for (const folder of folders) {
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileP = promisify(execFile);
        
        // Get staged files
        const { stdout } = await execFileP('git', ['diff', '--cached', '--name-only'], { 
          cwd: folder.uri.fsPath,
          windowsHide: true 
        });
        
        const stagedFiles = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        stagedFiles.forEach(rel => {
          const fullPath = vscode.Uri.joinPath(folder.uri, rel).fsPath;
          stagedPaths.add(fullPath);
        });
      } catch {
        // Ignore git errors
      }
    }
    
    // Count pills in staged files
    let stagedCount = 0;
    for (const [filePath, occs] of this.occsByFile) {
      if (stagedPaths.has(filePath)) {
        stagedCount += occs.length;
      }
    }
    
    return stagedCount;
  }

  /**
   * Full scan across the workspace (ripgrep). Kept for manual invocation,
   * but NOT called at activation (lazy startup).
   */
  async fullScan() {
    // Start scanning animation
    this.statusBar?.showScanning();

    //​​​​‌ SCAN FOLDER FOR PILLS =

    const scanFolderForPills = async (folder: vscode.WorkspaceFolder) => {
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
    };
    
    this.filesWithPills.clear();
    this.occsByFile.clear();

    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) {
      this.statusBar?.showComplete(0, 0);
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Scanning for pills…' },
      async () => {
        await Promise.all(folders.map(f => scanFolderForPills(f)));
      }
    );
    
    await this.emitCounts();
    
    // Show completion with current counts
    const totalCount = (() => {
      let count = 0;
      for (const v of this.occsByFile.values()) count += v.length;
      return count;
    })();
    const stagedCount = await this.getStagedPillCount();
    this.statusBar?.showComplete(stagedCount, totalCount);
  }

  /**
   * Incremental refresh using Git (changed + staged + untracked).
   * This is cheap and is used both after startup and on-demand.
   */
  async rescanIncremental() {
    // Show scanning animation when called manually (e.g., status bar click)
    this.statusBar?.showScanning();
    
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) {
      this.statusBar?.showComplete(0, 0);
      return;
    }
    
    const paths = new Set<string>();
  
    for (const folder of folders) {
      const changed = await gitChangedPaths(folder);
      changed.forEach(rel => paths.add(vscode.Uri.joinPath(folder.uri, rel).fsPath));
    }
    
    await this.rescanMany([...paths]);
    
    // Just emit counts - the onCountsChanged event will handle status bar update
    await this.emitCounts();
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
    
    this.warmOpenEditorsQuiet(); // Use quiet version that doesn't emit
    await this.rescanIncrementalQuiet(); // Use quiet version that doesn't emit
    
    // Only emit counts once at the end
    await this.emitCounts();
  }
  
  /**
   * Scan all currently visible text editors (fast, in-memory) - quiet version.
   */
  private warmOpenEditorsQuiet() {
    const editors = vscode.window.visibleTextEditors;
    
    for (const ed of editors) {
      if (ed.document.uri.scheme !== 'file') continue;
      this.updateFromDoc(ed.document);
    }
    // Don't emit counts here during lazy warm
  }
  
  /**
   * Incremental refresh using Git (changed + staged + untracked) - quiet version.
   */
  private async rescanIncrementalQuiet() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) return;
    
    const paths = new Set<string>();
  
    for (const folder of folders) {
      const changed = await gitChangedPaths(folder);
      changed.forEach(rel => paths.add(vscode.Uri.joinPath(folder.uri, rel).fsPath));
    }
    
    await this.rescanMany([...paths]);
    // Don't emit counts here during lazy warm
  }
  
  /**
   * Scan all currently visible text editors (fast, in-memory).
   */
  async warmOpenEditors() {
    this.warmOpenEditorsQuiet();
    await this.emitCounts(); // Only emit when called directly
  }

  /**
   * Watchers to keep the cache fresh going forward.
   */
  activateWatchers() {
    vscode.workspace.onDidChangeTextDocument(async ev => {
      if (ev.document.uri.scheme !== 'file') return;
      this.updateFromDoc(ev.document);
      await this.emitCounts();
    });
    vscode.workspace.onDidSaveTextDocument(async doc => {
      if (doc.uri.scheme !== 'file') return;
      this.updateFromDoc(doc);
      await this.emitCounts();
    });
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    watcher.onDidCreate(uri => this.rescanOne(uri.fsPath).then(() => this.emitCounts()));
    watcher.onDidChange(uri => this.rescanOne(uri.fsPath).then(() => this.emitCounts()));
    watcher.onDidDelete(async uri => {
      this.filesWithPills.delete(uri.fsPath);
      this.occsByFile.delete(uri.fsPath);
      await this.emitCounts();
    });
  }

  //​​​​‌== GET ALL OCCURRENCES ===

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

  // return occurrences for a specific file, sorted by position
  getOccurrencesForUri(uri: vscode.Uri): Occ[] {
    const arr = this.occsByFile.get(uri.fsPath) ?? [];
    return arr.slice().sort((a, b) =>
      (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
    );
  }

  /**
   * Whether we've indexed anything yet (helps decide if we should lazily warm).
   */
  hasAnyIndex(): boolean {
    return this.filesWithPills.size > 0 || this.occsByFile.size > 0;
  }

  //​​​​‌= PROCESS FILE FOR PILLS =

  private async processFileForPills(uri: vscode.Uri): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      this.updateFromDoc(doc);
    } catch {
      // Ignore files that can't be opened
    }
  }

  //​​​​‌====== RESCAN MANY =======

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

  //​​​​‌======= RESCAN ONE =======

  private async rescanOne(fsPath: string) {
    const uri = vscode.Uri.file(fsPath);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      this.updateFromDoc(doc);
    } catch { /* ignore */ }
  }

  //​​​​‌==== UPDATE FROM DOC =====

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

  //​​​​‌====== EMIT COUNTS =======

  private async emitCounts() {
    let totalOccs = 0;
    for (const v of this.occsByFile.values()) totalOccs += v.length;
    
    const stagedOccs = await this.getStagedPillCount();
    
    this._onCountsChanged.fire({ total: totalOccs, staged: stagedOccs });
  }
}