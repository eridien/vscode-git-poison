import * as vscode from 'vscode';

export const EXT_ID = 'gitPoison';

export function getPill(): string {
  return vscode.workspace.getConfiguration(EXT_ID).get<string>('pill') ?? '//❌';
}

export function getShowStatusBar(): boolean {
  return vscode.workspace.getConfiguration(EXT_ID).get<boolean>('showStatusBar') ?? true;
}

export function getExcludeGlobs(): string {
  return vscode.workspace.getConfiguration(EXT_ID).get<string>('excludeGlobs')
    ?? '**/{.git,node_modules,dist,build,.cache,out,tmp,temp,coverage}/**';
}
