import * as fs     from 'fs/promises';
import * as path   from 'path';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('hook');

const HOOK_VERSION = 2;
const pillStr = '(pp)';

const script = 

`#!/bin/sh
# token, do not remove: git-poison ${HOOK_VERSION}
# Git Poison: block commit if staged content contains "PILL"
set -eu

PILL='${pillStr}'
msgdir=".git/git-poison"
mkdir -p "$msgdir"

# Search staged (index) content for matches (just filenames)
matches=$(git grep -I --cached -l -e "$PILL" -- . || true)

if [ -n "$matches" ]; then
  # Stdout message (single header line, then one file per line)
  printf 'Poison: The Git commit is blocked because file(s) contain the pill "%s".\n%s\n' "$PILL" "$matches"

  # Log only when blocked: timestamp header then one file per line
  {
    printf '[%s] Commit blocked because file(s) contain "%s":\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$PILL"
    printf '%s\n' "$matches"
  } >> "$msgdir/hook.log"

  exit 1
fi

exit 0
`;

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
    log('pre-commit hook installed');
  } catch (e: any) {
    log('infoerr', 'Git Poison: Extension not activated. ' +
                   'Failed to install Git hook: ' + (e?.message ?? e));
    return false;
  }
  return true;
}
