import * as vscode from 'vscode';

export type Occ = { uri: vscode.Uri; pos: vscode.Position };

export async function reveal(occ: Occ) {
  const doc = await vscode.workspace.openTextDocument(occ.uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  const sel = new vscode.Selection(occ.pos, occ.pos);
  editor.selection = sel;
  editor.revealRange(new vscode.Range(occ.pos, occ.pos), vscode.TextEditorRevealType.InCenter);
}

export function sortOccurrences(a: Occ, b: Occ): number {
  return a.uri.fsPath === b.uri.fsPath
    ? (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
    : a.uri.fsPath.localeCompare(b.uri.fsPath);
}

export function findIndexForPosition(all: Occ[], uri: vscode.Uri, pos: vscode.Position, dir: 'next' | 'prev'): number {
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
