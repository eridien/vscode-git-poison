import * as vscode from 'vscode';

export class PillStatusBar {
  private item: vscode.StatusBarItem | undefined;
  private scanTimer?: ReturnType<typeof setInterval>;

  constructor(private enabled: boolean) {
    if (enabled) {
      this.item = vscode.window.createStatusBarItem('gitPoison.pillCount', vscode.StatusBarAlignment.Left, 100);
      this.item.tooltip = 'Number of pills in number of files. Click to rescan.';
      this.item.command = 'vscode-git-poison.rescanIncremental';
      this.item.show();
      
      //this.testLoading(); // Simulate loading for 3 seconds
    }
  }
  
  // TEST METHOD - Remove this after testing
  testLoading() {
    if (!this.item) return;
    this.showScanning();
    setTimeout(() => {
      this.showComplete(2, 5); // Simulate finding 5 pills in 2 files
    }, 3000);
  }

  update(countFiles: number, countOccs: number) {
    if (!this.item) return;
    this.item.text = `$(stop-circle) Pills: ${countOccs} found`;
    this.item.tooltip = 'Pills found in open files and Git changes. Run "Full Rescan" for complete count.';
  }

  showScanning() {
    if (!this.item) return;

    const spinners = ['/', '-', '\\', '|'];
    let i = 0;
    
    this.scanTimer = setInterval(() => {
      if (this.item) {
        this.item.text = `${spinners[i]} Pill Scanning`;
        i = (i + 1) % spinners.length;
      }
    }, 300);
  }

  showComplete(countFiles: number, countOccs: number) {
    if (!this.item) return;

    // Stop animation
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    this.update(countFiles, countOccs);
  }

  dispose() { 
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
    }
    this.item?.dispose(); 
  }
}
