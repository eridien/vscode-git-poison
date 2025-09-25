import * as vscode          from 'vscode';
import { PillIndexer }      from './pillIndexer';
import { getShowStatusBar } from './config';

export class PillStatusBar {
  private item: vscode.StatusBarItem | undefined;
  private scanTimer?: ReturnType<typeof setInterval>;

  constructor(private enabled: boolean) {
    if (enabled) {
      this.item = vscode.window.createStatusBarItem('gitPoison.pillCount', vscode.StatusBarAlignment.Left, 100);
      this.item.tooltip = 'Files containing pills';
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
    this.item.text = `$(stop-circle) Pills: ${countOccs} in ${countFiles}`;
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

let status:  PillStatusBar | undefined;

export function activate(context: vscode.ExtensionContext, indexer: PillIndexer) {
  // Create status bar that can be dynamically shown/hidden
  status = new PillStatusBar(true);
  updateStatusBar(indexer);
  
  // Update status bar when counts change (only if it exists)
  indexer.onCountsChanged(({ files, occs }) => {
    if (status) { status.update(files, occs); }
  });
  // Listen for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('git-poison.showStatusBar')) {
      updateStatusBar(indexer);
    }
  });
  context.subscriptions.push(
    configWatcher,
    { dispose: () => status?.dispose() }
  );
}

// set status bar visibility based on config and set counts 
export function updateStatusBar(indexer: PillIndexer) {
  const shouldShow = getShowStatusBar();
  if (shouldShow && !status) {
    // Create status bar when it should be shown but doesn't exist
    status = new PillStatusBar(true);
    // Update it with current counts
    const all = indexer.getAllOccurrences();
    const fileCount = indexer.getFilesWithPills().length;
    status.update(fileCount, all.length);
  } else if (!shouldShow && status) {
    // Dispose status bar when it should be hidden
    status.dispose();
    status = undefined;
  }
}

