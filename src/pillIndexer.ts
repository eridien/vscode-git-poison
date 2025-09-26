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
   * Get all non-ignored files in the workspace using Git
   */
  private async getAllTrackedAndUntrackedFiles(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileP = promisify(execFile);
      
      // Get tracked files and untracked files (but not ignored)
      const { stdout: tracked } = await execFileP('git', ['ls-files'], {
        cwd: folder.uri.fsPath,
        windowsHide: true
      });
      
      const { stdout: untracked } = await execFileP('git', ['ls-files', '--others', '--exclude-standard'], {
        cwd: folder.uri.fsPath,
        windowsHide: true
      });
      
      const allFiles = [
        ...tracked.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        ...untracked.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      ];
      
      // Convert to URIs - Git already handled .gitignore
      // Now we just need to filter by our exclude globs
      const allUris = allFiles.map(relativePath => vscode.Uri.joinPath(folder.uri, relativePath));
      
      // Filter by exclude pattern
      const excludePattern = getExcludeGlobs();
      const filteredUris = [];
      
      for (const uri of allUris) {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        if (!this.shouldExcludeByPattern(relativePath, excludePattern)) {
          filteredUris.push(uri);
        }
      }
      
      return filteredUris;
        
    } catch {
      // Fallback to VS Code file search if Git fails
      const include = new vscode.RelativePattern(folder, '**/*');
      const excludePattern = getExcludeGlobs();
      const exclude = new vscode.RelativePattern(folder, excludePattern);
      return await vscode.workspace.findFiles(include, exclude);
    }
  }

  /**
   * Simple pattern matching for common exclude patterns
   */
  private shouldExcludeByPattern(relativePath: string, excludePattern: string): boolean {
    // Handle the common case: **/{.git,node_modules,dist,build,.cache,out,tmp,temp,coverage}/**
    if (excludePattern.includes('{') && excludePattern.includes('}')) {
      const braceStart = excludePattern.indexOf('{');
      const braceEnd = excludePattern.indexOf('}');
      const folders = excludePattern.substring(braceStart + 1, braceEnd).split(',');
      
      for (const folder of folders) {
        const folderName = folder.trim();
        if (relativePath.includes(`/${folderName}/`) || relativePath.startsWith(`${folderName}/`)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Full scan across the workspace (ripgrep). Kept for manual invocation,
   * but NOT called at activation (lazy startup).
   */
  async fullScan() {
    // Start scanning animation
    this.statusBar?.showScanning();

    const scanFolderForPills = async (folder: vscode.WorkspaceFolder) => {
      // Get all files respecting both gitignore and exclude globs
      const files = await this.getAllTrackedAndUntrackedFiles(folder);
      
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
      // Filter out excluded files from Git changes
      for (const rel of changed) {
        if (!this.shouldExcludeByPattern(rel, getExcludeGlobs())) {
          paths.add(vscode.Uri.joinPath(folder.uri, rel).fsPath);
        }
      }
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
      // Check if the current editor should be excluded
      const relativePath = vscode.workspace.asRelativePath(contextEditor.document.uri, false);
      if (!this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) {
        this.updateFromDoc(contextEditor.document);
      }
    }
    
    this.warmOpenEditorsQuiet(); // Use quiet version that doesn't emit
    await this.rescanIncrementalQuiet(); // Use quiet version that doesn't emit
    
    // Only emit counts once at the end
    await this.emitCounts();
  }
  
  /**
   * Scan all currently visible text editors (fast, in-memory) - quiet version.
   */
  private  warmOpenEditorsQuiet() {
    const editors = vscode.window.visibleTextEditors;
    
    for (const ed of editors) {
      if (ed.document.uri.scheme !== 'file') continue;
      
      // Check if file should be excluded
      const relativePath = vscode.workspace.asRelativePath(ed.document.uri, false);
      if (this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) {
        continue;
      }
      
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
      // Filter out excluded files from Git changes
      for (const rel of changed) {
        if (!this.shouldExcludeByPattern(rel, getExcludeGlobs())) {
          paths.add(vscode.Uri.joinPath(folder.uri, rel).fsPath);
        }
      }
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
      
      // Check if file should be excluded
      const relativePath = vscode.workspace.asRelativePath(ev.document.uri, false);
      if (this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) {
        return;
      }
      
      this.updateFromDoc(ev.document);
      await this.emitCounts();
    });
    
    vscode.workspace.onDidSaveTextDocument(async doc => {
      if (doc.uri.scheme !== 'file') return;
      
      // Check if file should be excluded
      const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
      if (this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) {
        return;
      }
      
      this.updateFromDoc(doc);
      await this.emitCounts();
    });
    
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    
    watcher.onDidCreate(async uri => {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      if (this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) return;
      await this.rescanOne(uri.fsPath);
      await this.emitCounts();
    });
    
    watcher.onDidChange(async uri => {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      if (this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) return;
      await this.rescanOne(uri.fsPath);
      await this.emitCounts();
    });
    
    watcher.onDidDelete(async uri => {
      // Always remove from index when deleted (even if it was excluded)
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
  

  // Replace the getAllOccurrencesIncludingExcluded method with this improved version:

  /**
   * Get all occurrences including those in excluded files (for jump navigation)
   */
  async getAllOccurrencesIncludingExcluded(): Promise<Occ[]> {
    const entries: Occ[] = [];
    
    // First, add all currently indexed occurrences
    for (const occs of this.occsByFile.values()) {
      entries.push(...occs);
    }
    
    // Then scan excluded files for additional occurrences
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileP = promisify(execFile);
        
        // Get ALL files (including those that would be excluded)
        const { stdout: tracked } = await execFileP('git', ['ls-files'], {
          cwd: folder.uri.fsPath,
          windowsHide: true
        });
        
        const { stdout: untracked } = await execFileP('git', ['ls-files', '--others', '--exclude-standard'], {
          cwd: folder.uri.fsPath,
          windowsHide: true
        });
        
        const allFiles = [
          ...tracked.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
          ...untracked.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        ];
        
        // Process files that are excluded by our pattern (not already indexed)
        const excludePattern = getExcludeGlobs();
        const excludedFiles = allFiles.filter(relativePath => {
          const uri = vscode.Uri.joinPath(folder.uri, relativePath);
          // Only process if it's excluded by pattern AND not already indexed
          return this.shouldExcludeByPattern(relativePath, excludePattern) && 
                 !this.occsByFile.has(uri.fsPath);
        });
        
        // Scan excluded files for pills with better error handling
        for (const relativePath of excludedFiles) {
          try {
            const uri = vscode.Uri.joinPath(folder.uri, relativePath);
            
            // Check if file actually exists and is readable
            try {
              await vscode.workspace.fs.stat(uri);
            } catch {
              continue; // Skip files that don't exist or can't be accessed
            }
            
            const doc = await vscode.workspace.openTextDocument(uri);
            const pill = getPill();
            const text = doc.getText();
            let idx = 0;
            while (true) {
              idx = text.indexOf(pill, idx);
              if (idx === -1) break;
              const pos = doc.positionAt(idx);
              entries.push({ uri: doc.uri, pos });
              idx += pill.length || 1;
            }
          } catch (error) {
            // Skip files that can't be opened - this is expected for some excluded files
            console.log(`Skipping excluded file ${relativePath}: ${error}`);
          }
        }
      } catch (gitError) {
        // Fallback if Git commands fail - use VS Code findFiles without exclude pattern
        try {
          const include = new vscode.RelativePattern(folder, '**/*');
          const allFiles = await vscode.workspace.findFiles(include, null); // No exclusions
          
          // Process files not already in our index
          for (const uri of allFiles) {
            if (!this.occsByFile.has(uri.fsPath)) {
              try {
                // Check if file should be excluded by pattern
                const relativePath = vscode.workspace.asRelativePath(uri, false);
                if (this.shouldExcludeByPattern(relativePath, getExcludeGlobs())) {
                  // This is an excluded file, scan it for pills
                  const doc = await vscode.workspace.openTextDocument(uri);
                  const pill = getPill();
                  const text = doc.getText();
                  let idx = 0;
                  while (true) {
                    idx = text.indexOf(pill, idx);
                    if (idx === -1) break;
                    const pos = doc.positionAt(idx);
                    entries.push({ uri: doc.uri, pos });
                    idx += pill.length || 1;
                  }
                }
              } catch (error) {
                // Skip files that can't be opened
                console.log(`Skipping file ${uri.fsPath}: ${error}`);
              }
            }
          }
        } catch (fallbackError) {
          console.log(`Fallback search failed for folder ${folder.uri.fsPath}: ${fallbackError}`);
        }
      }
    }
    
    entries.sort((a, b) =>
      a.uri.fsPath === b.uri.fsPath
        ? (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
        : a.uri.fsPath.localeCompare(b.uri.fsPath)
    );
    return entries;
  }
  
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