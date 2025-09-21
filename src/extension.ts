import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  // Hello command
  context.subscriptions.push(
    vscode.commands.registerCommand('gitPoison.hello', async () => {
      vscode.window.showInformationMessage('Git Poison says hello!');
    })
  );

  // Optional: install a simple Git pre-commit hook in the current workspace
  // context.subscriptions.push(
  //   vscode.commands.registerCommand('gitPoison.installHook', async () => {
  //     try {
  //       const folder = vscode.workspace.workspaceFolders?.[0];
  //       if (!folder) {
  //         vscode.window.showErrorMessage('Open a workspace folder first.');
  //         return;
  //       }
  //       const repoRoot = folder.uri.fsPath;
  //       const gitDir = path.join(repoRoot, '.git');
  //       try {
  //         await fs.access(gitDir);
  //       } catch {
  //         vscode.window.showErrorMessage('No .git directory found in the first workspace folder.');
  //         return;
  //       }
  //       const hooksDir = path.join(gitDir, 'hooks');
  //       await fs.mkdir(hooksDir, { recursive: true });
  //       const hookPath = path.join(hooksDir, 'pre-commit');
  //       const script = [
  //         '#!/bin/sh',
  //         'set -eu',
  //         'msgdir=".git/git-poison"', 
  //         'mkdir -p "$msgdir"',
  //         'write_status() { printf '{ "status": "%s", "reason": "%s" }\n' "$1" "$2" > "$msgdir/hook.json"; }',
  //         'if ! git diff --cached --check --no-color --diff-filter=AM -- . >/dev/null 2>&1; then',
  //         '  echo "❌ Commit blocked: whitespace errors in staged changes." 1>&2',
  //         '  write_status "blocked" "whitespace errors"',
  //         '  exit 1',
  //         'fi',
  //         'write_status "ok" "checks passed"',
  //         'exit 0',
  //         ''
  //       ].join('\n');
  //       // Force LF endings
  //       await fs.writeFile(hookPath, script.replace(/\r\n/g, '\n'), { mode: 0o755 });
  //       if (process.platform !== 'win32') {
  //         await fs.chmod(hookPath, 0o755);
  //       }
  //       vscode.window.showInformationMessage('Git Poison: pre-commit hook installed.');
  //     } catch (e: any) {
  //       vscode.window.showErrorMessage('Failed to install hook: ' + (e?.message ?? e));
  //     }
  //   })
  // );
}

export function deactivate() {}
