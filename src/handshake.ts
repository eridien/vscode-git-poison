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
  log(`Processing Git Poison request ${id}`);
  const resPath  = path.join(dir, `res.${id}.json`);
  let details = '';
  try { 
    details = (await fs.readFile(reqPath, 'utf8')).trim(); 
    log(`Request details: ${details}`);
  } catch {}

  const pick = await vscode.window.showErrorMessage(
    "Git Poison is blocking this commit because poison pill(s) exist. " +
    "Press block. You will see a notification \"Failed to execute git\", press cancel. " +
    "Then use the command ‘Git Poison: View Poison Pills’. " +
    "\n\nWarning: Selecting ignore will commit pills to the repository (a bad thing). " +
    "\n\nAfter 30 secs this will default to blocking the commit.",
    { modal: true },
    "Block", "Ignore"
  );
  const decision = pick     === "Ignore" ? "allow" : "block";
  const reason   = decision === "block"  ? "user-blocked" : "user-allowed";

  // write response AFTER the user decides
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  await fs.writeFile(resPath, JSON.stringify({ id, decision, reason, ts }), "utf8");
  
  // optional: open details
  // if (decision === "block") {
  //   vscode.commands.executeCommand("gitPoison.viewPoisonPills");
  // }
}

/*

You can’t programmatically close a standard toast created by showInformationMessage / showWarningMessage / showErrorMessage. Those APIs don’t expose a handle to dismiss.

What to use instead (abortable UI)
Option A — Progress notification (dismissable programmatically)

Use window.withProgress(ProgressLocation.Notification, …). You control when it appears/disappears, and you can cancel it on timeout or on user decision.

import * as vscode from 'vscode';

function showAwaitingDecision(title = 'Git Poison: awaiting decision…') {
  let finish!: () => void;                 // call to close the notification
  const done = new Promise<void>(resolve => (finish = resolve));

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (_progress, token) => {
      token.onCancellationRequested(() => finish()); // user clicked the “x” or Cancel
      await done;                                    // we keep it open until finish() is called
    }
  );

  return { close: () => finish() };
}


Usage with your timeout/decision flow:

const notif = showAwaitingDecision();

// race: user decides vs timeout
const timeoutMs = 30000;
const timer = setTimeout(async () => {
  // timeout: close the notification, show your final message, write allow/block file
  notif.close();
  await fs.writeFile(resPath, JSON.stringify({ id, decision: "allow", reason: "timeout" }), "utf8");
  vscode.window.showWarningMessage("Git Poison timed out — commit allowed.");
}, timeoutMs);

// when user decides:
function onUserDecision(decision: "allow" | "block", reason: string) {
  clearTimeout(timer);
  notif.close(); // close the progress notification immediately
  if (decision === "block") {
    vscode.window.showErrorMessage("Git Poison has blocked the commit. Use “Git Poison: View Poison Pills”.");
  }
  fs.writeFile(resPath, JSON.stringify({ id, decision, reason }), "utf8");
}

Option B — Status bar message (fully controllable)

setStatusBarMessage returns a Disposable you can dispose() at any time.

const disposable = vscode.window.setStatusBarMessage("$(shield) Git Poison: awaiting decision…");
… // later on decision or timeout:
disposable.dispose();


You can use this alongside a smaller toast once the final decision is known.

Option C — Quick pick (cancelable)

A window.showQuickPick can be canceled programmatically by disposing the UI you created (when using the createQuickPick() API). This gives you full control, but it’s more UI code.

Practical pattern for your flow

Show a progress notification immediately when the hook writes req.*.json.

When the user decides (Allow/Block), close the progress notification, then:

If Block: show your error toast now (will appear before Git’s).

Write res.*.json so the hook exits.

If timeout occurs first:

Close the progress notification.

Write res.*.json with your timeout policy (allow or block).

Show your own timeout message.

This way you never leave a stale toast up, and you control exactly what’s visible and when.
*/
