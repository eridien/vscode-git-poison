import * as vscode from 'vscode';

export const EXT_ID = 'git-poison';

//​​​​‌========= GET PILL =========

export function getPill(): string {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<string>('pillString') ?? '//❌';
}

//​​​​‌==== GET OVERRIDE SECS =====

export function getOverrideSecs(): number {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<number>('overrideSecs') ?? 30;
}

//​​​​‌=== GET SHOW STATUS BAR ====

export function getShowStatusBar(): boolean {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<boolean>('showStatusBar') ?? true;
}

//​​​​‌==== GET EXCLUDE GLOBS =====

export function getExcludeGlobs(): string {
  return vscode.workspace
               .getConfiguration(EXT_ID).get<string>('excludeGlobs') ?? 
          "**&#47;{.git,node_modules,dist,build,.cache,out,tmp,temp,coverage}&#47;**";
}
