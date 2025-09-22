import * as vscode from 'vscode';
import * as fs     from 'fs/promises';
import * as path   from 'path';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('hook');

const HOOK_VERSION = 2;

const script = [
  '#!/bin/sh',
  `# git-poison V${HOOK_VERSION}`,
  'set -eu',
  '',
  'msgdir=".git/git-poison"',
  '',
  '# Ensure dir exists before logging',
  'mkdir -p "$msgdir"',
  '',
  '# Simple logger (timestamp + message) -> .git/git-poison/hook.log',
  'log() {',
  '  printf "[%s] %s\\n" "$(date \'+%m-%d %H:%M\')" "$1" >> "$msgdir/hook.log"',
  '}',
  '',
  '# Write status JSON -> .git/git-poison/hook.json',
  'write_status() {',
  '  printf \'{ "status": "%s", "reason": "%s", "ts": "%s" }\\n\' \\',
  '    "$1" "$2" "$(date \'+%Y-%m-%d %H:%M:%S\')" > "$msgdir/hook.json"',
  '}',
  '',
  'write_status "ok" "checks passed"',
  'exit 0',
  ''
].join('\n');

export async function hookAlreadyInstalled(repoRoot: string): 
                     Promise<"ours" | "other" | "none" | number> {
  let oldVersion = 0;
  const hookPath = path.join(repoRoot, '.git', 'hooks', 'pre-commit');
  try {
    const content = await fs.readFile(hookPath, 'utf8');
    if (content.includes('git-poison')) {
      const match = content.match(/git-poison V(\d+)/);
      if(match) oldVersion = Number(match[1]);
      if(oldVersion !== HOOK_VERSION) return oldVersion;
      return "ours";
    } else {
      return "other";
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') return "none";
    throw err;
  }
}

export async function installHook(repoRoot: string, 
             status: "ours" | "other" | "none" | number): Promise<boolean> {
  try {
    if(typeof status === "number")
      log(`updating hook version ${status} to ${HOOK_VERSION}`);
    const hooksDir = path.join(repoRoot, '.git', 'hooks');
    await fs.mkdir(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, 'pre-commit');
    await fs.writeFile(hookPath, script.replace(/\r\n/g, '\n'), { mode: 0o755 });
    if (process.platform !== 'win32') {
      await fs.chmod(hookPath, 0o755);
    }
    log('Git Poison: pre-commit hook installed.');
  } catch (e: any) {
    log('err', 'Git Poison: Extension not activated. ' +
               'Failed to install Git hook: ' + (e?.message ?? e));
    return false;
  }
  return true;
}
