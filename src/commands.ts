import * as vscode from 'vscode';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('cmds');

let poisonDirUri:     vscode.Uri;
let overrideStartUri: vscode.Uri;

export function activate(repoRootUri: vscode.Uri) {
  poisonDirUri     = vscode.Uri.joinPath(repoRootUri, '.git', 'git-poison');
  overrideStartUri = vscode.Uri.joinPath(poisonDirUri, 'override-start');
}

export  function viewPreviousPill() {
  log('viewPreviousPill');

}

export  function viewNextPill() {
  log('viewNextPill');

}

export  async function overrideCommitBlocking() {
  log('overrideCommitBlocking');
  try {
    await vscode.workspace.fs.createDirectory(poisonDirUri);
    await vscode.workspace.fs.writeFile(overrideStartUri,
                            Buffer.from(String(Math.floor(Date.now()/1000))));
  }
  catch (err: any) {
    log(`Git Poison: Override Commit Blocking Command failed: ${err.message}`);
  }
}

export  function insertPill() {
  log('insertPill');


}

