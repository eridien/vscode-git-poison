import * as fs     from 'fs/promises';
import * as path   from 'path';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('hook');

const HOOK_VERSION = 5;

// const script = [
//   '#!/bin/sh',
//   `# token, do not remove: git-poison V${HOOK_VERSION}`,
//   'set -eu',
//   '',
//   'msgdir=".git/git-poison"',
//   '',
//   '# Ensure dir exists before logging',
//   'mkdir -p "$msgdir"',
//   '',
//   '# Simple logger (timestamp + message) -> .git/git-poison/hook.log',
//   'log() {',
//   '  printf "[%s] %s\\n" "$(date \'+%m-%d %H:%M\')" "$1" >> "$msgdir/hook.log"',
//   '}',
//   '',
//   '# Write status JSON -> .git/git-poison/hook.json',
//   'write_status() {',
//   '  printf \'{ "status": "%s", "reason": "%s", "ts": "%s" }\\n\' \\',
//   '    "$1" "$2" "$(date \'+%Y-%m-%d %H:%M:%S\')" > "$msgdir/hook.json"',
//   '}',
//   '',
//   `log "git-poison hook V${HOOK_VERSION} started"`,
//   'write_status "ok" "checks passed"',
//   'exit 0',
//   ''
// ].join('\n');

// const script = [
//   '#!/bin/sh',
//   `# token, do not change: git-poison V${HOOK_VERSION}`,
//   'set -eu',
//   '',
//   'msgdir=".git/git-poison"',
//   'mkdir -p "$msgdir"',
//   '',
//   '# Tiny logger (no stdout leakage)',
//   'log() { printf "[%s] %s\\n" "$(date \'+%m-%d %H:%M\')" "$1" >> "$msgdir/hook.log"; }',
//   '',
//   '# Create a unique request/response id',
//   'rid="$(date +%s).$$.$(od -An -N2 -tu2 < /dev/urandom | tr -d \' \')"',
//   'req="$msgdir/req.$rid.json"',
//   'res="$msgdir/res.$rid.json"',
//   '',
//   '# Gather a little context (keep it simple to avoid heavy calls)',
//   'branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"',
//   'author="$(git config user.name 2>/dev/null || echo unknown)"',
//   'now="$(date \'+%Y-%m-%d %H:%M:%S\')"',
//   '',
//   '# Write request JSON (status is unknown until extension replies)',
//   'printf \'{ "id": "%s", "ts": "%s", "branch": "%s", "author": "%s" }\\n\' "$rid" "$now" "$branch" "$author" > "$req"',
//   'log "Handshake request $rid written"',
//   '',
//   '# Notify VS Code (non-blocking); safe if code/CLI missing',
//   'if command -v code-insiders >/dev/null 2>&1; then',
//   `  code-insiders --open-url "vscode://${PUBLISHER}.git-poison/approve?id=$rid" >/dev/null 2>&1 || true`,
//   'elif command -v code >/dev/null 2>&1; then',
//   `  code --open-url "vscode://${PUBLISHER}.git-poison/approve?id=$rid" >/dev/null 2>&1 || true`,
//   'fi',
//   '',
//   '# Wait for response file up to 12 * 0.25s = 3s (tweak as you like)',
//   'tries=12',
//   'decision="allow"',
//   'reason="timeout-default-allow"',
//   'while [ "$tries" -gt 0 ]; do',
//   '  if [ -f "$res" ]; then',
//   '    # parse tiny JSON with grep/cut (no jq dependency)',
//   '    if grep -q \'"decision":"block"\' "$res"; then decision="block"; fi',
//   '    rline="$(grep -o \'"reason":"[^"]*"\' "$res" || true)"',
//   '    reason="${rline#*:\\"}"; reason="${reason%\\"}"',
//   '    break',
//   '  fi',
//   '  tries=$((tries-1))',
//   '  sleep 0.25',
//   'done',
//   '',
//   'log "Handshake $rid decision: $decision reason: $reason "',
//   '',
//   'if [ "$decision" = "block" ]; then',
//   '  # Don\'t print to stdout; only record to log and JSON signal',
//   '  printf \'{ "status": "blocked", "reason": "%s", "ts": "%s" }\\n\' "$reason" "$(date \'+%Y-%m-%d %H:%M:%S\')" > "$msgdir/hook.json"',
//   '  exit 1',
//   'fi',
//   '',
//   '# Allow commit',
//   'printf \'{ "status": "ok", "reason": "approved", "ts": "%s" }\\n\' "$(date \'+%Y-%m-%d %H:%M:%S\')" > "$msgdir/hook.json"',
//   'exit 0',
// ].join('\n');

const script = [
  '#!/bin/sh',
  `# token, do not remove: git-poison V${HOOK_VERSION}`,
  'set -eu',
  '',
  'msgdir=".git/git-poison"',
  'mkdir -p "$msgdir"',
  '',
  '# Tiny logger (timestamp + message) -> .git/git-poison/hook.log',
  'log() { printf "[%s] %s\\n" "$(date \'+%m-%d %H:%M\')" "$1" >> "$msgdir/hook.log"; }',
  '',
  '# Unique id: epoch.PID.rand16 (dash-compatible, no $RANDOM)',
  'rid="$(date +%s).$$.$(od -An -N2 -tu2 < /dev/urandom | tr -d \' \\t\')"',
  'req="$msgdir/req.$rid.json"',
  'res="$msgdir/res.$rid.json"',
  '',
  '# A little context (keep it light)',
  'branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"',
  'author="$(git config user.name 2>/dev/null || echo unknown)""',
  'now="$(date \'+%Y-%m-%d %H:%M:%S\')"',
  '',
  '# Write request JSON',
  'printf \'{ "id": "%s", "ts": "%s", "branch": "%s", "author": "%s" }\\n\' "$rid" "$now" "$branch" "$author" > "$req"',
  'log "req $rid written; waiting for decision..."',
  '',
  '# Wait up to 5s (20 * 0.25s)',
  'tries=20',
  'decision="allow"',
  'reason="timeout-default-allow"',
  'while [ "$tries" -gt 0 ]; do',
  '  if [ -f "$res" ]; then',
  '    # parse tiny JSON with grep/cut (no jq dependency)',
  '    if grep -q \'"decision":"block"\' "$res"; then decision="block"; fi',
  '    rline="$(grep -o \'"reason":"[^"]*"\' "$res" || true)"',
  '    reason="${rline#*\\\"}"',
  '    reason="${reason%\\\"}"',
  '    break',
  '  fi',
  '  tries=$((tries-1))',
  '  sleep 0.25',
  'done',  
  '',
  'log "decision for $rid: $decision ($reason)"',
  '',
  'if [ "$decision" = "block" ]; then',
  '  printf \'{ "status": "blocked", "reason": "%s", "ts": "%s" }\\n\' "$reason" "$(date \'+%Y-%m-%d %H:%M:%S\')" > "$msgdir/hook.json"',
  '  exit 1',
  'fi',
  '',
  'printf \'{ "status": "ok", "reason": "approved", "ts": "%s" }\\n\' "$(date \'+%Y-%m-%d %H:%M:%S\')" > "$msgdir/hook.json"',
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
    log('Git Poison: pre-commit hook installed.');
  } catch (e: any) {
    log('infoerr', 'Git Poison: Extension not activated. ' +
               'Failed to install Git hook: ' + (e?.message ?? e));
    return false;
  }
  return true;
}
