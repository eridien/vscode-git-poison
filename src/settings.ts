import * as vscode from 'vscode';
import * as hook   from './hook';
import * as utils  from './utils';
const {log, start, end} = utils.getLog('settings');

interface GitPoisonSettings {
  overrideSecs:     number;
  poisonPillString: string;
}

export let settings: GitPoisonSettings = {
  overrideSecs:     300,
  poisonPillString: '//❌',
};

export function loadSettings() {
  const config = vscode.workspace.getConfiguration('git-poison');
  settings = {
    overrideSecs:     config.get('overrideSecs',        300),
    poisonPillString: config.get('poisonPillString', '//❌'),
  };
}
