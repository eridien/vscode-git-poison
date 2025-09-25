import * as vscode     from 'vscode';
import { PillIndexer } from './pillIndexer';
import * as config     from './config';

export type Occ = { uri: vscode.Uri; pos: vscode.Position };

export function insertPill() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  ed.edit(editBuilder => {
    editBuilder.insert(ed.selection.active, config.getPill());
  }); 
  vscode.window.showInformationMessage('Inserted poison pill.');
}

export async function jump(indexer: PillIndexer, dir: 'next' | 'prev') {
  // If we have no index yet (first use), lazily warm before attempting a jump.
  if (!indexer.hasAnyIndex()) {
    await indexer.lazyWarm(vscode.window.activeTextEditor);
  }

  let all = indexer.getAllOccurrences();
  if (!all.length) {
    await indexer.fullScan();
    all = indexer.getAllOccurrences();
  }

  if (!all.length) {
    vscode.window.showInformationMessage('No poison pill found.');
    return;
  }

  const ed = vscode.window.activeTextEditor;
  
  // Always look for next/prev pill from current caret position
  const occ = pickGlobalOccurrence(all, ed, dir);
  await reveal(occ);
}

// Helper: choose global next/prev from caret position, else wrap
function pickGlobalOccurrence(
  all: { uri: vscode.Uri; pos: vscode.Position }[],
  ed: vscode.TextEditor | undefined,
  dir: 'next' | 'prev'
) {
  if (ed) {
    const idx = findIndexForPosition(all, ed.document.uri, ed.selection.active, dir);
    return all[(idx + all.length) % all.length];
  }

  // No editor: wrap from ends
  return all[dir === 'next' ? 0 : (all.length - 1)];
}

async function reveal(occ: Occ) {
  const doc = await vscode.workspace.openTextDocument(occ.uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  const sel = new vscode.Selection(occ.pos, occ.pos);
  editor.selection = sel;
  editor.revealRange(new vscode.Range(occ.pos, occ.pos), vscode.TextEditorRevealType.InCenter);
}

function sortOccurrences(a: Occ, b: Occ): number {
  return a.uri.fsPath === b.uri.fsPath
    ? (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
    : a.uri.fsPath.localeCompare(b.uri.fsPath);
}

function findIndexForPosition(all: Occ[], uri: vscode.Uri, pos: vscode.Position, dir: 'next' | 'prev'): number {
  const sorted = all.slice().sort(sortOccurrences);
  const idx = sorted.findIndex(o =>
    o.uri.fsPath === uri.fsPath &&
    (dir === 'next'
      ? (o.pos.line > pos.line || (o.pos.line === pos.line && o.pos.character > pos.character))
      : (o.pos.line < pos.line || (o.pos.line === pos.line && o.pos.character < pos.character)))
  );
  if (idx === -1) return dir === 'next' ? 0 : (sorted.length - 1);
  const occ = sorted[idx];
  return all.findIndex(o => o.uri.fsPath === occ.uri.fsPath && o.pos.isEqual(occ.pos));
}
