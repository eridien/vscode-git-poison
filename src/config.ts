import * as vscode from 'vscode';

export const EXT_ID = 'git-poison';

export function getPill(): string {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<string>('pillString') ?? '//❌';
}

export function getOverrideSecs(): number {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<number>('overrideSecs') ?? 30;
}

export function getShowStatusBar(): boolean {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<boolean>('showStatusBar') ?? true;
}

export function getExcludeGlobs(): string {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<string>('excludeGlobs') ?? 
          '**/{.git,node_modules,dist,build,.cache,out,tmp,temp,coverage}/**';
}
