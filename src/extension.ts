import * as vscode    from 'vscode';
import {PillIndexer}  from './pillIndexer';
import * as jump      from './jump';
import * as statusBar from './statusBar';
import * as hook      from './hook';
import * as utils     from './utils';
const {log, start, end} = utils.getLog('extn');

export async function activate(context: vscode.ExtensionContext) {
  start('activate');
  
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    log(';err', 
        'Git Poison: You must have a workspace folder open to install. ' +
        'Extension not activated.');
    return;
  }
  const repoRootUri = folder.uri;  
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

  const indexer = new PillIndexer();

  // LAZY STARTUP:
  indexer.activateWatchers();
  await indexer.lazyWarm(vscode.window.activeTextEditor);

  hook     .activate(repoRootUri);
  statusBar.activate(context, indexer);
  utils    .activate(context);

  const jumpNext = vscode.commands.registerCommand(
         'vscode-git-poison.jumpNext', () => jump.jump(indexer, 'next'));

  const jumpPrev = vscode.commands.registerCommand(
         'vscode-git-poison.jumpPrev', () => jump.jump(indexer, 'prev'));

  const overrideCommitBlocking = vscode.commands.registerCommand(
          'vscode-git-poison.overrideCommitBlocking', async () => {
    await hook.overrideCommitBlocking(); 
  });
  const fullScan = vscode.commands.registerCommand(
                           'vscode-git-poison.fullScan', indexer.fullScan);

  const rescanIncremental = vscode.commands.registerCommand(
         'vscode-git-poison.rescanIncremental', indexer.rescanIncremental);

  const insertPill = vscode.commands.registerCommand(
                          'vscode-git-poison.insertPill', jump.insertPill);

  context.subscriptions.push(
    overrideCommitBlocking, insertPill, 
    fullScan, rescanIncremental,
    jumpNext, jumpPrev
  );

  end('activate');
}

export function deactivate() {}
