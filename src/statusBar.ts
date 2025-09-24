import * as vscode from 'vscode';

export class PillStatusBar {
  private item: vscode.StatusBarItem | undefined;

  constructor(private enabled: boolean) {
    if (enabled) {
      this.item = vscode.window.createStatusBarItem('gitPoison.pillCount', vscode.StatusBarAlignment.Left, 100);
      this.item.tooltip = 'Files containing pills';
      this.item.command = 'gitPoison.pills.rescanIncremental';
      this.item.show();
    }
  }

  update(countFiles: number, countOccs: number) {
    if (!this.item) return;
    this.item.text = `$(warning) Pills: ${countOccs} in ${countFiles}`;
  }

  dispose() { this.item?.dispose(); }
}
