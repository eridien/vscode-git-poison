import * as vscode          from 'vscode';
import { PillIndexer }      from './pillIndexer';
import { getShowStatusBar } from './config';

//​​​​‌===== PILL STATUS BAR ======

export class PillStatusBar {
  private item: vscode.StatusBarItem | undefined;
  private scanTimer?: ReturnType<typeof setInterval>;
  private scanStartTime?: number;
  private minScanDuration = 300; // Minimum 0.3 seconds of scanning animation

  //​​​​‌====== CONSTRUCTOR =======

  constructor(private enabled: boolean) {
    if (enabled) {
      this.item = vscode.window.createStatusBarItem('gitPoison.pillCount', vscode.StatusBarAlignment.Left, 100);
      this.item.tooltip = 'Poison Pills: staged / total (click to rescan)';
      this.item.command = 'vscode-git-poison.rescanFull';
      this.item.show();
      
      // Always start with scanning animation
      this.showScanning();
    }
  }
  
  // Add getter to check if currently scanning
  get isScanning(): boolean {
    return this.scanTimer !== undefined;
  }

  //​​​​‌========= UPDATE =========

  update(stagedCount: number, totalCount: number) {
    if (!this.item) return;
    this.item.text = `$(stop-circle) Pills: ${stagedCount}/${totalCount}`;
  }

  //​​​​‌===== SHOW SCANNING ======

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

  //​​​​‌===== SHOW COMPLETE ======

  showComplete(stagedCount: number, totalCount: number) {
    if (!this.item) return;
    
    // Ensure minimum scan duration
    const elapsed = this.scanStartTime ? (Date.now() - this.scanStartTime) : 0;
    const remainingTime = Math.max(0, this.minScanDuration - elapsed);
    
    if (remainingTime > 0) {
      setTimeout(() => this.completeNow(stagedCount, totalCount), remainingTime);
    } else {
      this.completeNow(stagedCount, totalCount);
    }
  }

  //​​​​‌====== COMPLETE NOW ======

  private completeNow(stagedCount: number, totalCount: number) {
    // Stop animation
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    this.scanStartTime = undefined;
    this.update(stagedCount, totalCount);
  }

  //​​​​‌======== DISPOSE =========

  dispose() { 
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
    }
    this.item?.dispose(); 
  }
}

let status: PillStatusBar | undefined;

//​​​​‌========= ACTIVATE =========

// ...existing code...

export function activate(context: vscode.ExtensionContext, indexer: PillIndexer): PillStatusBar | undefined {
  // Check if status bar should be shown based on user settings
  const shouldShow = getShowStatusBar();
  
  // Create status bar only if it should be shown
  if (shouldShow) {
    status = new PillStatusBar(true);
    
    // Pass status bar reference to indexer
    indexer.setStatusBar(status);
  } else {
    // Don't create status bar if disabled
    status = undefined;
    indexer.setStatusBar(undefined);
  }
  
  // Update status bar when counts change (only if it exists)
  indexer.onCountsChanged(({ staged, total }) => {
    if (status) { 
      // Always use showComplete to stop animation and update with real counts
      status.showComplete(staged, total);
    }
  });
  
  // Listen for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(async e => {
    if (e.affectsConfiguration('git-poison.showStatusBar')) {
      await updateStatusBar(indexer);
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

//​​​​‌==== UPDATE STATUS BAR =====

export async function updateStatusBar(indexer: PillIndexer) {
  const shouldShow = getShowStatusBar();
  if (shouldShow && !status) {
    // Create status bar when it should be shown but doesn't exist
    status = new PillStatusBar(true);
    // Update the indexer reference
    indexer.setStatusBar(status);
    
    // NEW: Immediately emit current counts to stop the scanning animation
    // and show the actual pill counts
    await indexer.emitCounts();
    
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