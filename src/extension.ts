import * as vscode   from 'vscode';
import * as fs       from 'fs/promises';
import * as path     from 'path';
import { PillIndexer } from './pillIndexer';
import { reveal, findIndexForPosition } from './navigation';
import { PillStatusBar } from './statusBar';
import { getShowStatusBar } from './config';
import * as hook     from './hook';
import * as utils    from './utils';
const {log, start, end} = utils.getLog('extn');

export async function activate(context: vscode.ExtensionContext) {
  start('activate');
  const indexer = new PillIndexer();
  
  // Create status bar that can be dynamically shown/hidden
  let status: PillStatusBar | undefined;
  
  // Function to update status bar based on config
  const updateStatusBar = () => {
    const shouldShow = getShowStatusBar();
    if (shouldShow && !status) {
      // Create status bar when it should be shown but doesn't exist
      status = new PillStatusBar(true);
      // Update it with current counts
      const all = indexer.getAllOccurrences();
      const fileCount = indexer.getFilesWithPills().length;
      status.update(fileCount, all.length);
    } else if (!shouldShow && status) {
      // Dispose status bar when it should be hidden
      status.dispose();
      status = undefined;
    }
  };

  // Update status bar when counts change (only if it exists)
  indexer.onCountsChanged(({ files, occs }) => {
    if (status) {
      status.update(files, occs);
    }
  });
  
  // LAZY STARTUP:
  indexer.activateWatchers();
  await indexer.lazyWarm(vscode.window.activeTextEditor);
  
  // Initialize status bar based on current config AFTER lazy warming  
  updateStatusBar();
  
  // Listen for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('git-poison.showStatusBar')) {
      updateStatusBar();
    }
  });

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    log(';err', 
        'Git Poison: You must have a workspace folder open to install. ' +
        'Extension not activated.');
    return;
  }
  const repoRootUri = folder.uri;
  hook.activate(repoRootUri);
  utils.activate(context);
  
  const gitDirUri = vscode.Uri.joinPath(repoRootUri, '.git');
  try {
    await vscode.workspace.fs.stat(gitDirUri);
  } 
  catch {
    log(';err',
        'Git Poison: No Git directory found in the first workspace folder. ' +
        'Extension not activated.');
    return;
  }
  const installedStatus = await hook.hookAlreadyInstalled();
  if (installedStatus !== "ours") {
    if (installedStatus === "other") {
      const choice = await vscode.window.showWarningMessage(
        "Git Poison: A Git pre-commit hook already exists for another app. " +
        "Overwrite the other one?",
        { modal: true }, "Yes", "No"
      );
      if (choice !== "Yes") {
        log(';info', "Git Poison: Extension not activated " +
                    "because the hook installation was cancelled.");
        return;
      }
    }
    if(!await hook.installHook(installedStatus)) return;
  }
  const rescanFull =  vscode.commands.registerCommand('vscode-git-poison.rescanFull', () => indexer.fullScan());

  const rescanIncremental = vscode.commands.registerCommand('vscode-git-poison.rescanIncremental', () => indexer.incrementalRefresh());

  const jumpNext = vscode.commands.registerCommand('vscode-git-poison.jumpNext', () => jump(indexer, 'next'));
  const jumpPrev = vscode.commands.registerCommand('vscode-git-poison.jumpPrev', () => jump(indexer, 'prev'));

  const poisonDirUri     = vscode.Uri.joinPath(repoRootUri, '.git', 'git-poison');
  const overrideStartUri = vscode.Uri.joinPath(poisonDirUri, 'override-start');

  const overrideCommitBlocking = vscode.commands.registerCommand(
   'vscode-git-poison.overrideCommitBlocking', async () => {
      log('overrideCommitBlocking');
      try {
        await vscode.workspace.fs.createDirectory(poisonDirUri);
        await vscode.workspace.fs.writeFile(overrideStartUri,
                                Buffer.from(String(Math.floor(Date.now()/1000))));
      }
      catch (err: any) {
        log(`Git Poison: Override Commit Blocking Command failed: ${err.message}`);
      }
    }
  );

  const insertPill = vscode.commands.registerCommand(
    'vscode-git-poison.insertPill', () => {

      // TODO

    }
  );

  context.subscriptions.push(
    configWatcher,
    { dispose: () => status?.dispose() },
    overrideCommitBlocking,
    insertPill,
    rescanFull,
    rescanIncremental,
    jumpNext,
    jumpPrev
  );

  end('activate');
}

export function deactivate() {}

async function jump(indexer: PillIndexer, dir: 'next' | 'prev') {
  // If we have no index yet (first use), lazily warm before attempting a jump.
  if (!indexer.hasAnyIndex()) {
    await indexer.lazyWarm(vscode.window.activeTextEditor);
  }

  let all = indexer.getAllOccurrences();
  if (!all.length) {
    // Still nothing found — offer a one-shot full scan (user pressed jump expecting results).
    await indexer.fullScan();
    all = indexer.getAllOccurrences();
  }

  if (!all.length) {
    vscode.window.showInformationMessage('No pills found.');
    return;
  }

  const ed = vscode.window.activeTextEditor;
  
  // Always look for next/prev pill from current caret position
  const occ = pickGlobalOccurrence(all, ed, dir);
  await reveal(occ);
}

// Helper: choose global next/prev from caret position, else wrap
function pickGlobalOccurrence(
  all: { uri: vscode.Uri; pos: vscode.Position }[],
  ed: vscode.TextEditor | undefined,
  dir: 'next' | 'prev'
) {
  if (ed) {
    const idx = findIndexForPosition(all, ed.document.uri, ed.selection.active, dir);
    return all[(idx + all.length) % all.length];
  }

  // No editor: wrap from ends
  return all[dir === 'next' ? 0 : (all.length - 1)];
}