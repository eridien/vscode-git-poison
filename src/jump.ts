import * as vscode     from 'vscode';
import { PillIndexer } from './pillIndexer';
import * as config     from './config';
import * as utils      from './utils';
const {log} = utils.getLog('jump');

export type Occ = { uri: vscode.Uri; pos: vscode.Position };

//​​​​‌======= INSERT PILL ========

export async function insertPill() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  
  // Check if current file should be excluded
  const relativePath = vscode.workspace.asRelativePath(ed.document.uri, false);
  if (shouldExcludeByPattern(relativePath, config.getExcludeGlobs())) {
    log (';info', 'Cannot insert pill: file is in excluded folders.');
    return;
  }
  
  // Check if file is in gitignore
  await checkIfInGitignore(ed.document.uri).then(isIgnored => {
    if (isIgnored) {
      vscode.window.showWarningMessage('Cannot insert pill: file is in .gitignore.');
      return;
    }
    
    // Insert the pill
    ed.edit(editBuilder => {
      editBuilder.insert(ed.selection.active, config.getPill());
    }); 
  });
}

/**
 * Check if a file is in gitignore
 */
async function checkIfInGitignore(uri: vscode.Uri): Promise<boolean> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) return false;
  
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileP = promisify(execFile);
    
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    
    // Use git check-ignore to see if file should be ignored
    await execFileP('git', ['check-ignore', relativePath], {
      cwd: workspaceFolder.uri.fsPath,
      windowsHide: true
    });
    
    // If git check-ignore exits with 0, the file is ignored
    return true;
  } catch {
    // If git check-ignore exits with non-zero, file is not ignored
    return false;
  }
}

/**
 * Simple pattern matching for common exclude patterns
 */
function shouldExcludeByPattern(relativePath: string, excludePattern: string): boolean {
  // Handle the common case: **/{.git,node_modules,dist,build,.cache,out,tmp,temp,coverage}/**
  if (excludePattern.includes('{') && excludePattern.includes('}')) {
    const braceStart = excludePattern.indexOf('{');
    const braceEnd = excludePattern.indexOf('}');
    const folders = excludePattern.substring(braceStart + 1, braceEnd).split(',');
    
    for (const folder of folders) {
      const folderName = folder.trim();
      if (relativePath.includes(`/${folderName}/`) || relativePath.startsWith(`${folderName}/`)) {
        return true;
      }
    }
  }
  
  return false;
}


// Replace the jump function with this updated version:

//​​​​‌=========== JUMP ===========

export async function jump(indexer: PillIndexer, dir: 'next' | 'prev') {
  // If we have no index yet (first use), lazily warm before attempting a jump.
  if (!indexer.hasAnyIndex()) {
    await indexer.lazyWarm(vscode.window.activeTextEditor);
  }

  // Use the new method that includes excluded files
  let all = await indexer.getAllOccurrencesIncludingExcluded();
  if (!all.length) {
    await indexer.fullScan();
    all = await indexer.getAllOccurrencesIncludingExcluded();
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
  try {
    const doc = await vscode.workspace.openTextDocument(occ.uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
    const sel = new vscode.Selection(occ.pos, occ.pos);
    editor.selection = sel;
    editor.revealRange(new vscode.Range(occ.pos, occ.pos), vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    const relativePath = vscode.workspace.asRelativePath(occ.uri, false);
    vscode.window.showErrorMessage(`Could not open file: ${relativePath}. ${error}`);
    console.error(`Error revealing file ${occ.uri.fsPath}:`, error);
  }
}

//​​​​‌===== SORT OCCURRENCES =====

function sortOccurrences(a: Occ, b: Occ): number {
  return a.uri.fsPath === b.uri.fsPath
    ? (a.pos.line - b.pos.line) || (a.pos.character - b.pos.character)
    : a.uri.fsPath.localeCompare(b.uri.fsPath);
}