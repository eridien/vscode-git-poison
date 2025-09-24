import * as vscode from 'vscode';
import { PillIndexer } from './pillIndexer';
import { reveal, findIndexForPosition } from './navigation';
import { PillStatusBar } from './statusBar';
import { getShowStatusBar } from './config';

// Remember the last global jump so we can continue across tab switches if needed
let lastJumpOcc: { uri: vscode.Uri; pos: vscode.Position } | undefined;

export async function activate(ctx: vscode.ExtensionContext) {
  const indexer = new PillIndexer();
  const status = new PillStatusBar(getShowStatusBar());
  ctx.subscriptions.push({ dispose: () => status.dispose() });

  // keep status bar updated
  indexer.onCountsChanged(({ files, occs }) => status.update(files, occs));

  // commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('gitPoison.pills.rescanFull', () => indexer.fullScan()),
    vscode.commands.registerCommand('gitPoison.pills.rescanIncremental', () => indexer.incrementalRefresh()),
    vscode.commands.registerCommand('gitPoison.pills.jumpNext', () => jump(indexer, 'next')),
    vscode.commands.registerCommand('gitPoison.pills.jumpPrev', () => jump(indexer, 'prev')),
  );

  // startup: catch external edits while VS Code was closed
  await indexer.fullScan();
  indexer.activateWatchers();
}

export function deactivate() {}

async function jump(indexer: PillIndexer, dir: 'next' | 'prev') {
  const all = indexer.getAllOccurrences();
  if (!all.length) {
    vscode.window.showInformationMessage('No pills found.');
    return;
  }

  const ed = vscode.window.activeTextEditor;

  // ---- 1) SMART HEURISTIC: try document-local first ----
  if (ed) {
    const caret = ed.selection.active;
    const locals = indexer.getOccurrencesForUri(ed.document.uri);

    // find first strictly after/before caret in this file
    const localIdx = findLocalIndex(locals, caret, dir);
    if (localIdx !== -1) {
      const occ = locals[localIdx];
      await reveal(occ);
      lastJumpOcc = { uri: occ.uri, pos: occ.pos };  // remember globally
      return;
    }
  }

  // ---- 2) FALL BACK TO GLOBAL ----
  const occ = pickGlobalOccurrence(all, ed, dir);
  await reveal(occ);
  lastJumpOcc = { uri: occ.uri, pos: occ.pos };
}

// Helper: in-file next/prev relative to caret (strictly after/before)
function findLocalIndex(locals: { uri: vscode.Uri; pos: vscode.Position }[], caret: vscode.Position, dir: 'next' | 'prev'): number {
  if (!locals.length) return -1;
  if (dir === 'next') {
    for (let i = 0; i < locals.length; i++) {
      const p = locals[i].pos;
      if (p.line > caret.line || (p.line === caret.line && p.character > caret.character)) return i;
    }
    return -1; // none after
  } else {
    for (let i = locals.length - 1; i >= 0; i--) {
      const p = locals[i].pos;
      if (p.line < caret.line || (p.line === caret.line && p.character < caret.character)) return i;
    }
    return -1; // none before
  }
}

// Helper: choose global next/prev from last jump if possible, else from caret/file, else wrap
function pickGlobalOccurrence(
  all: { uri: vscode.Uri; pos: vscode.Position }[],
  ed: vscode.TextEditor | undefined,
  dir: 'next' | 'prev'
) {
  // 1) If we have a remembered occurrence and it still exists, continue from it
  if (lastJumpOcc) {
    const idxFromLast = all.findIndex(o => o.uri.fsPath === lastJumpOcc!.uri.fsPath && o.pos.isEqual(lastJumpOcc!.pos));
    if (idxFromLast >= 0) {
      const nextIdx = (idxFromLast + (dir === 'next' ? 1 : -1) + all.length) % all.length;
      return all[nextIdx];
    }
  }

  // 2) Otherwise, if there is an active editor, start relative to caret globally
  if (ed) {
    const idx = findIndexForPosition(all, ed.document.uri, ed.selection.active, dir);
    return all[(idx + all.length) % all.length];
  }

  // 3) No editor: wrap from ends
  return all[dir === 'next' ? 0 : (all.length - 1)];
}
