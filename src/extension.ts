import * as vscode from 'vscode';
import * as fs     from 'fs/promises';
import * as path   from 'path';
import * as hook   from './hook';
import * as hand   from './handshake';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('extn');

export async function activate(context: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    log('err', 
        'Git Poison: You must have a workspace folder open to install. ' +
        'Extension not activated.');
    return;
  }
  const repoRoot = folder.uri.fsPath;
  const gitDir = path.join(repoRoot, '.git');
  log(`Extension activated in workspace folder: ${repoRoot}`);
  try {
    await fs.access(gitDir);
  } catch {
    log('err', 
        'Git Poison: No Git directory found in the first workspace folder. ' +
        'Extension not activated.');
    return;
  }
  const status = await hook.hookAlreadyInstalled(repoRoot);
  if (status !== "ours") {
    if (status === "other") {
      const choice = await vscode.window.showWarningMessage(
        "Git Poison: A Git pre-commit hook already exists for another app. " +
        "Overwrite the other one?",
        { modal: true }, "Yes", "No"
      );
      if (choice !== "Yes") {
        log('info', "Git Poison: Extension not activated " +
                    "because the hook installation was cancelled.");
        return;
      }
    }
    if(typeof status !== "number") {
      const choice = await vscode.window.showWarningMessage(
          `Git Poison: Is it ok to install a Git pre-commit hook? ` +
          `It is required to activate the extension. See readme for details.`,
        { modal: true }, 'Yes', 'No'
      );
      if (choice !== 'Yes') {
        log('info', 'Git Poison: Extension not activated ' +
                    'because the hook installation was cancelled.');
        return;
      }
    }
    if(!await hook.installHook(repoRoot, status)) return;
  }
  hand.activate(context);
  utils.activate(context);
}

export function deactivate() {}
