import * as vscode from 'vscode';
const {log, start, end} = getLog('util');

let context: vscode.ExtensionContext | undefined;

export function activate(contextIn: vscode.ExtensionContext) {
  context = contextIn;
}

// 'err' 'info' 'nomod' 'errmsg'

const outputChannel = vscode.window.createOutputChannel('Git Poison');

export function getLog(module: string) : {
  log:   (...args: any[]) => void;
  start: (name: string,     hide?: boolean, msg?: string)     => void;
  end:   (name: string, onlySlow?: boolean, msg?: string) => void;
} {
  const timers: Record<string, number> = {};

  const start = function (name: string, hide = false, msg = ''): void {
    const startTime = Date.now();
    timers[name] = startTime;
    if (hide) return;
    const line = `[${module}] ${name} started${msg ? ', ' + msg : ''}`;
    outputChannel.appendLine(line);
    console.log(line);
  };

  const end = function (name: string, onlySlow = false, msg = ''): void {
    if (!timers[name]) {
      const line = `[${module}] ${name} ended${msg ? ', ' + msg : ''}`;
      outputChannel.appendLine(line);
      console.log(line);
      return;
    }
    const endTime = Date.now();
    const duration = endTime - timers[name];
    if (onlySlow && duration < 100) return;
    // const line = `[${module}] ${name} ended, ${timeInSecs(duration)}s,  ${msg}`;
    const line = `[${module}] ${name} ended, ${duration}ms${msg ? ', ' + msg : ''}`;
    outputChannel.appendLine(line);
    console.log(line);
  };

  const log = function (...args: any[]): void {
    let errFlag    = false;
    let errMsgFlag = false;
    let infoFlag   = false;
    let nomodFlag  = false;

    if (typeof args[0] === 'string') {
      errFlag = args[0].includes('err');
      infoFlag = args[0].includes('info');
      nomodFlag = args[0].includes('nomod');
      errMsgFlag = args[0].includes('errmsg');
    }

    if (errFlag || infoFlag || nomodFlag || errMsgFlag) args = args.slice(1);

    let errMsg: string | undefined;
    if (errMsgFlag) {
      errMsg  = args[0]?.message + ' -> ';
      args    = args.slice(1);
      errFlag = true;
    }

    const par = args.map((a) => {
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a, null, 2);
        } catch (e: any) {
          return JSON.stringify(Object.keys(a)) + e.message;
        }
      } else return a;
    });

    const line = (nomodFlag ? '' : '[' + module + '] ') +
                 (errFlag ? ' error, ' : '') +
                 (errMsg !== undefined ? errMsg : '') +
                 par.join(' ');

    const infoLine = par.join(' ').replace('parse: ','');

    outputChannel.appendLine(line);
    if (errFlag) console.error(line);
    else console.log(line);
    if (infoFlag) log('info', infoLine);
  };

  return { log, start, end };
}
