import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('hand');

export function activate(context: vscode.ExtensionContext) {
  let queue = Promise.resolve();
  const watcher = vscode.workspace.createFileSystemWatcher('**/.git/git-poison/req.*.json');
  const handleReq = (uri: vscode.Uri) => {
    queue = queue.then(() => processRequest(uri)).catch(() => {/* noop */});
  };
  watcher.onDidCreate(handleReq);
  context.subscriptions.push(watcher);
}

async function processRequest(uri: vscode.Uri) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }
  const reqPath  = uri.fsPath;
  const dir      = path.dirname(reqPath);
  const base     = path.basename(reqPath);              // req.<id>.json
  const id       = base.slice(4, -5);                   // strip "req." and ".json"
  const resPath  = path.join(dir, `res.${id}.json`);
  const hookJson = path.join(dir, 'hook.json');
  const hookLog  = path.join(dir, 'hook.log');

  // Read details (best-effort)
  let details = '';
  try { details = (await fs.readFile(reqPath, 'utf8')).trim(); } catch {}

  // Ask the user
  const choice = await vscode.window.showInformationMessage(
    `Git Poison request ${id}\n${details || ''}\nBlock this commit?`,
    { modal: true },
    'Block', 'Allow'
  );

  const decision = choice === 'Block' ? 'block' : 'allow';
  const reason = choice === 'Block' ? 'user-blocked' : 'user-allowed';
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);

  // Write response for the hook to read
  const payload = JSON.stringify({ id, decision, reason, ts });
  await fs.writeFile(resPath, payload, { encoding: 'utf8' });

  // Optional: open the status file so you can see it update
  // Comment these two lines out if you don't want tabs opening automatically.
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(hookJson));
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  } catch {}
  try {
    await vscode.commands.executeCommand('workbench.action.files.refresh');
  } catch {}
}
