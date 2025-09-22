import * as fs     from 'fs/promises';
import * as path   from 'path';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('hook');

const HOOK_VERSION = 8;

const script = [
  '#!/bin/sh',
  `# token, do not remove: git-poison V${HOOK_VERSION}`,
  'set -eu',
  '',
  'msgdir=".git/git-poison"',
  'mkdir -p "$msgdir"',
  '',
  '# Tiny logger (timestamp + message) -> .git/git-poison/hook.log',
  'log() {',
  '  printf "[%s.%03d] %s\\n" "$(date \'+%m-%d %H:%M:%S\')" ' +
                         '"$(( $(date +%N) / 1000000 ))" "$1" >> "$msgdir/hook.log"',
  '}',  
  '',
  '# Unique id: epoch.PID.rand16 (dash-compatible, no $RANDOM)',
  'rid="$(date +%s).$$.$(od -An -N2 -tu2 < /dev/urandom | tr -d \' \\t\')"',
  'req="$msgdir/req.$rid.json"',
  'res="$msgdir/res.$rid.json"',
  '',
  '# A little context (keep it light)',
  'branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"',
  'author="$(git config user.name 2>/dev/null || echo unknown)"',
  'now="$(date \'+%Y-%m-%d %H:%M:%S\')"',
  '',
  '# Write request JSON',
  'printf \'{ "id": "%s", "ts": "%s", "branch": "%s", "author": "%s" }\\n\' "$rid" "$now" "$branch" "$author" > "$req"',
  'log "req $rid written; waiting for decision..."',
  '',
  'decision="block"',  // default block
  'reason="timeout/no response"',
  'tries=120   # 120 × 0.25s = 30 secs max wait',
  '',
  'while [ "$tries" -gt 0 ]; do',
  '  if [ -f "$res" ]; then',
  '    # parse tiny JSON with sed (no jq)',
  '    dval="$(sed -n \'s/.*"decision":"\\([^"]*\\)".*/\\1/p\' "$res" | head -n1)"',
  '    rval="$(sed -n \'s/.*"reason":"\\([^"]*\\)".*/\\1/p\' "$res" | head -n1)"',
  '    [ -n "$dval" ] && decision="$dval"',
  '    [ -n "$rval" ] && reason="$rval"',
  '    break',
  '  fi',
  '  tries=$((tries-1))',
  '  sleep 0.25',
  'done',
  '',
  '# act on decision',
  'if [ "$decision" = "block" ]; then',
  '  echo "Git Poison: blocked commit ($reason)" >> "$msgdir/hook.log"',
  '  exit 1',
  'fi',
  'echo "Git Poison: allowed commit ($reason)" >> "$msgdir/hook.log"',
  'exit 0',
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
    log('pre-commit hook installed');
  } catch (e: any) {
    log('infoerr', 'Git Poison: Extension not activated. ' +
                   'Failed to install Git hook: ' + (e?.message ?? e));
    return false;
  }
  return true;
}
