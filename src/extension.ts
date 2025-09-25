import * as vscode     from 'vscode';
import { PillIndexer } from './pillIndexer';
import * as statusBar  from './statusBar';
import * as hook       from './hook';
import * as jump       from './jump';
import * as utils      from './utils';

const {log} = utils.getLog('ext');

//​​​​‌========= ACTIVATE =========

export async function activate(context: vscode.ExtensionContext) {
  log('activating Git Poison extension');
  
  // Initialize utils
  utils.activate(context);

  // Find .git directory
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (!folders.length) {
    log('no workspace folders found');
    return;
  }

  // For now, use first workspace folder with .git
  let repoRoot: vscode.Uri | undefined;
  for (const folder of folders) {
    const gitDir = vscode.Uri.joinPath(folder.uri, '.git');
    try {
      const stat = await vscode.workspace.fs.stat(gitDir);
      if (stat.type === vscode.FileType.Directory) {
        repoRoot = folder.uri;
        break;
      }
    } catch {
      // No .git directory in this folder
    }
  }

  if (!repoRoot) {
    log('no .git directory found in workspace');
    return;
  }

  log('found git repo at:', repoRoot.fsPath);

  // Initialize hook system
  hook.activate(repoRoot);
  
  // Check and install hook if needed
  const hookStatus = await hook.hookAlreadyInstalled();
  log('hook status:', hookStatus);
  
  if (hookStatus !== "ours") {
    const success = await hook.installHook(hookStatus);
    if (!success) {
      log('failed to install hook, extension not fully activated');
      return;
    }
  }

  // Create indexer
  const indexer = new PillIndexer();

  // Activate status bar FIRST so it can show scanning
  statusBar.activate(context, indexer);

  // LAZY STARTUP: Don't do expensive scanning at activation, but always do lazy warm
  await indexer.lazyWarm(vscode.window.activeTextEditor);

  // Activate watchers
  indexer.activateWatchers();

  // Register commands
  const viewNextPill = vscode.commands.registerCommand(
    'vscode-git-poison.viewNextPill', () => jump.jump(indexer, 'next'));
  
  const viewPreviousPill = vscode.commands.registerCommand(
    'vscode-git-poison.viewPreviousPill', () => jump.jump(indexer, 'prev'));
  
  const fullScan = vscode.commands.registerCommand(
    'vscode-git-poison.rescanFull', () => indexer.fullScan());
  
  const rescanIncremental = vscode.commands.registerCommand(
    'vscode-git-poison.rescanIncremental', () => indexer.rescanIncremental());
  
  const overrideCommitBlocking = vscode.commands.registerCommand(
    'vscode-git-poison.overrideCommitBlocking', hook.overrideCommitBlocking);
  
  const insertPill = vscode.commands.registerCommand(
    'vscode-git-poison.insertPill', jump.insertPill);

  // Add to subscriptions
  context.subscriptions.push(
    viewNextPill, viewPreviousPill, fullScan, rescanIncremental, overrideCommitBlocking, insertPill
  );

  log('Git Poison extension activated successfully');
}

//​​​​‌======== DEACTIVATE ========

export function deactivate() {
  log('Git Poison extension deactivated');
}