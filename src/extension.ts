import * as vscode   from 'vscode';
import * as fs       from 'fs/promises';
import * as path     from 'path';
import * as cmds     from './commands';
import * as hook     from './hook';
import * as settings from './settings';
import * as utils    from './utils';
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
  cmds .activate(repoRootUri);
  hook .activate(repoRootUri);
  settings.loadSettings();
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
  const status = await hook.hookAlreadyInstalled();
  if (status !== "ours") {
    if (status === "other") {
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
    if(!await hook.installHook(status)) return;
  }

  const viewPreviousPill = vscode.commands.registerCommand(
    'vscode-git-poison.viewPreviousPill', () => {
       cmds.viewPreviousPill();
    }
  );
  
  const viewNextPill = vscode.commands.registerCommand(
    'vscode-git-poison.viewNextPill', () => {
       cmds.viewNextPill();
    }
  );
  
  const overrideCommitBlocking = vscode.commands.registerCommand(
    'vscode-git-poison.overrideCommitBlocking', async () => {
       await cmds.overrideCommitBlocking();
    }
  );
  
  const insertPill = vscode.commands.registerCommand(
    'vscode-git-poison.insertPill', () => {
       cmds.insertPill();
    }
  );

  const loadSettings = vscode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('git-poison')) {
      settings.loadSettings();
      await hook.installHook();
    }
  });

  context.subscriptions.push(viewPreviousPill, viewNextPill,
                             overrideCommitBlocking, insertPill, loadSettings);

  end('activate');
}

export function deactivate() {}
