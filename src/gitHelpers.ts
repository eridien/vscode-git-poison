import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

//​​​​‌==== GIT CHANGED PATHS =====

export async function gitChangedPaths(folder: vscode.WorkspaceFolder): Promise<string[]> {
  const cwd = folder.uri.fsPath;
  const union = new Set<string>();
  for (const p of await safeGit(['diff', '--name-only'], cwd)) union.add(p);                   // unstaged
  for (const p of await safeGit(['diff', '--cached', '--name-only'], cwd)) union.add(p);       // staged
  for (const p of await safeGit(['ls-files', '--others', '--exclude-standard'], cwd)) union.add(p); // new
  return [...union].filter(Boolean);
}

//​​​​‌========= SAFE GIT =========

async function safeGit(args: string[], cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP('git', args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
