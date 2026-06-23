/**
 * Status Bar for Workspai extension
 */

import * as vscode from 'vscode';

export class WorkspaiStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private projectCount: number = 0;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'workspai.showWelcome';
    this.updateStatus('ready');
    this.statusBarItem.show();
  }

  public updateProjectCount(count: number): void {
    this.projectCount = count;
    this.updateStatus('ready');
  }

  public updateStatus(status: 'ready' | 'working' | 'error', message?: string): void {
    switch (status) {
      case 'ready': {
        const projectText =
          this.projectCount > 0
            ? ` | ${this.projectCount} Project${this.projectCount > 1 ? 's' : ''}`
            : '';
        this.statusBarItem.text = `🚀 Workspai${projectText} | Ready`;
        this.statusBarItem.tooltip = 'Open Workspai dashboard and workspace intelligence';
        this.statusBarItem.backgroundColor = undefined;
        break;
      }
      case 'working':
        this.statusBarItem.text = `$(sync~spin) Workspai: ${message || 'Working...'}`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'error':
        this.statusBarItem.text = '$(error) Workspai';
        this.statusBarItem.tooltip = message || 'Error occurred';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
