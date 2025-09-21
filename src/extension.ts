import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

async function hookAlreadyInstalled(repoRoot: string): Promise<"ours" | "other" | "none"> {
  const hookPath = path.join(repoRoot, '.git', 'hooks', 'pre-commit');
  try {
    const content = await fs.readFile(hookPath, 'utf8');
    if (content.includes('git-poison')) {
      return "ours";   // already our hook
    } else {
      return "other";  // some other hook exists
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return "none";   // no pre-commit hook at all
    }
    throw err; // unexpected error, bubble up
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }
  const repoRoot = folder.uri.fsPath;
  const gitDir = path.join(repoRoot, '.git');
  try {
    await fs.access(gitDir);
  } catch {
    vscode.window.showErrorMessage('No .git directory found in the first workspace folder.');
    return;
  }
  const status = await hookAlreadyInstalled(repoRoot);
  if (status === "ours") {
    vscode.window.showInformationMessage("Git Poison hook is already installed.");
    return;
  }
  if (status === "other") {
    const choice = await vscode.window.showWarningMessage(
      "Another pre-commit hook already exists. Overwrite it?",
      { modal: true },
      "Yes", "No"
    );
    if (choice !== "Yes") {
      vscode.window.showInformationMessage("Hook installation cancelled.");
      return;
    }
  }
  const choice = await vscode.window.showInformationMessage(
    `Install or overwrite the Git pre-commit hook in ${folder.name}?`,
    { modal: true }, // makes it a blocking dialog
    'Yes', 'No'
  );
  if (choice !== 'Yes') {
    vscode.window.showInformationMessage('Git Poison: hook installation cancelled.');
    return;
  }

  try {
    const hooksDir = path.join(gitDir, 'hooks');
    await fs.mkdir(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, 'pre-commit');

    const script = [
      '#!/bin/sh',
      'set -eu',
      'msgdir=".git/git-poison"',
      'mkdir -p "$msgdir"',
      'write_status() { printf \'{ "status": "%s", "reason": "%s" }\\n\' "$1" "$2" > "$msgdir/hook.json"; }',
      'if ! git diff --cached --check --no-color --diff-filter=AM -- . >/dev/null 2>&1; then',
      '  echo "❌ Commit blocked: whitespace errors in staged changes." 1>&2',
      '  write_status "blocked" "whitespace errors"',
      '  exit 1',
      'fi',
      'write_status "ok" "checks passed"',
      'exit 0',
      ''
    ].join('\n');

    await fs.writeFile(hookPath, script.replace(/\r\n/g, '\n'), { mode: 0o755 });
    if (process.platform !== 'win32') {
      await fs.chmod(hookPath, 0o755);
    }

    vscode.window.showInformationMessage('Git Poison: pre-commit hook installed.');
  } catch (e: any) {
    vscode.window.showErrorMessage('Failed to install hook: ' + (e?.message ?? e));
  }
}

export function deactivate() {}
