import * as vscode     from 'vscode';
import { PillIndexer } from './pillIndexer';
import * as config     from './config';

export type Occ = { uri: vscode.Uri; pos: vscode.Position };

//​​​​‌======= INSERT PILL ========

export function insertPill() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  ed.edit(editBuilder => {
    editBuilder.insert(ed.selection.active, config.getPill());
  }); 
}

//​​​​‌=========== JUMP ===========

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
  if (!ed) {
    // No editor: wrap from ends
    return all[dir === 'next' ? 0 : (all.length - 1)];
  }

  // Sort all occurrences globally (by file, then position)
  const sorted = all.slice().sort(sortOccurrences);
  
  // Find current position in the globally sorted list
  const currentUri = ed.document.uri;
  const currentPos = ed.selection.active;
  
  let targetIndex = -1;
  
  for (let i = 0; i < sorted.length; i++) {
    const occ = sorted[i];
    
    if (dir === 'next') {
      // For next: find first occurrence after current position
      if (occ.uri.fsPath > currentUri.fsPath || 
         (occ.uri.fsPath === currentUri.fsPath && 
          (occ.pos.line > currentPos.line || 
           (occ.pos.line === currentPos.line && occ.pos.character > currentPos.character)))) {
        targetIndex = i;
        break;
      }
    } else {
      // For prev: find last occurrence before current position
      if (occ.uri.fsPath < currentUri.fsPath || 
         (occ.uri.fsPath === currentUri.fsPath && 
          (occ.pos.line < currentPos.line || 
           (occ.pos.line === currentPos.line && occ.pos.character < currentPos.character)))) {
        targetIndex = i;
        // Don't break - keep looking for the last one before current position
      }
    }
  }
  
  // If no target found, wrap around
  if (targetIndex === -1) {
    targetIndex = dir === 'next' ? 0 : (sorted.length - 1);
  }
  
  return sorted[targetIndex];
}

//​​​​‌========== REVEAL ==========

async function reveal(occ: Occ) {
  const doc = await vscode.workspace.openTextDocument(occ.uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  const sel = new vscode.Selection(occ.pos, occ.pos);
  editor.selection = sel;
  editor.revealRange(new vscode.Range(occ.pos, occ.pos), vscode.TextEditorRevealType.InCenter);
}

//​​​​‌===== SORT OCCURRENCES =====

function sortOccurrences(a: Occ, b: Occ): number {
  return a.uri.fsPath === b.uri.fsPath
    ? (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
    : a.uri.fsPath.localeCompare(b.uri.fsPath);
}