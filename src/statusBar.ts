import * as vscode          from 'vscode';
import { PillIndexer }      from './pillIndexer';
import { getShowStatusBar } from './config';

export class PillStatusBar {
  private item: vscode.StatusBarItem | undefined;
  private scanTimer?: ReturnType<typeof setInterval>;
  private scanStartTime?: number;
  private minScanDuration = 1000; // Minimum 1 second of scanning animation

  constructor(private enabled: boolean) {
    if (enabled) {
      this.item = vscode.window.createStatusBarItem('gitPoison.pillCount', vscode.StatusBarAlignment.Left, 100);
      this.item.tooltip = 'Files containing pills';
      this.item.command = 'vscode-git-poison.rescanIncremental';
      this.item.show();
      
      // Always start with scanning animation
      this.showScanning();
    }
  }
  
  // Add getter to check if currently scanning
  get isScanning(): boolean {
    return this.scanTimer !== undefined;
  }

  update(countFiles: number, countOccs: number) {
    if (!this.item) return;
    this.item.text = `$(stop-circle) Pills: ${countOccs} in ${countFiles}`;
  }

  showScanning() {
    if (!this.item) return;

    this.scanStartTime = Date.now();
    
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
    
    // Ensure minimum scan duration
    const elapsed = this.scanStartTime ? (Date.now() - this.scanStartTime) : 0;
    const remainingTime = Math.max(0, this.minScanDuration - elapsed);
    
    if (remainingTime > 0) {
      setTimeout(() => this.completeNow(countFiles, countOccs), remainingTime);
    } else {
      this.completeNow(countFiles, countOccs);
    }
  }

  private completeNow(countFiles: number, countOccs: number) {
    // Stop animation
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    this.scanStartTime = undefined;
    this.update(countFiles, countOccs);
  }

  dispose() { 
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
    }
    this.item?.dispose(); 
  }
}

let status: PillStatusBar | undefined;

export function activate(context: vscode.ExtensionContext, indexer: PillIndexer): PillStatusBar | undefined {
  // Create status bar that can be dynamically shown/hidden
  status = new PillStatusBar(true);
  
  // Pass status bar reference to indexer
  indexer.setStatusBar(status);
  
  // Update status bar when counts change (only if it exists)
  indexer.onCountsChanged(({ files, occs }) => {
    if (status) { 
      // Always use showComplete to stop animation and update with real counts
      status.showComplete(files, occs);
    }
  });
  
  // Listen for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('git-poison.showStatusBar')) {
      updateStatusBar(indexer);
      // Update the reference when status bar is recreated
      indexer.setStatusBar(status);
    }
  });
  
  context.subscriptions.push(
    configWatcher,
    { dispose: () => status?.dispose() }
  );

  return status;
}

export function updateStatusBar(indexer: PillIndexer) {
  const shouldShow = getShowStatusBar();
  if (shouldShow && !status) {
    // Create status bar when it should be shown but doesn't exist
    status = new PillStatusBar(true);
    // Update the indexer reference
    indexer.setStatusBar(status);
  } else if (!shouldShow && status) {
    // Dispose status bar when it should be hidden
    status.dispose();
    status = undefined;
    // Clear the indexer reference
    indexer.setStatusBar(undefined);
  }
}

// Export function to get current status bar instance
export function getStatusBar(): PillStatusBar | undefined {
  return status;
}