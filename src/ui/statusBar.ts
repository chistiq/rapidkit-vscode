/**
 * Status Bar for Workspai extension
 */

import * as vscode from 'vscode';

export type WorkspaiStatusBarTruth = {
  workspaceName?: string;
  topBlocker?: string;
  cliVersion?: string;
};

export class WorkspaiStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private projectCount: number = 0;
  private ambientTruth: WorkspaiStatusBarTruth = {};

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

  public updateAmbientTruth(truth: WorkspaiStatusBarTruth): void {
    this.ambientTruth = {
      workspaceName: compactStatusSegment(truth.workspaceName),
      topBlocker: compactStatusSegment(truth.topBlocker),
      cliVersion: compactStatusSegment(truth.cliVersion),
    };
    this.updateStatus('ready');
  }

  public updateStatus(status: 'ready' | 'working' | 'error', message?: string): void {
    switch (status) {
      case 'ready': {
        const projectText =
          this.projectCount > 0
            ? `${this.projectCount} project${this.projectCount > 1 ? 's' : ''}`
            : undefined;
        const segments = [
          this.ambientTruth.workspaceName ?? 'No workspace',
          this.ambientTruth.topBlocker
            ? `Top: ${this.ambientTruth.topBlocker}`
            : 'Top: none loaded',
          this.ambientTruth.cliVersion ? `CLI ${this.ambientTruth.cliVersion}` : projectText,
        ].filter((segment): segment is string => Boolean(segment));
        this.statusBarItem.text = `$(rocket) Workspai · ${segments.join(' · ')}`;
        this.statusBarItem.tooltip = [
          'Open Workspai dashboard and workspace intelligence',
          this.ambientTruth.workspaceName
            ? `Workspace: ${this.ambientTruth.workspaceName}`
            : undefined,
          this.ambientTruth.topBlocker ? `Top blocker: ${this.ambientTruth.topBlocker}` : undefined,
          this.ambientTruth.cliVersion
            ? `RapidKit CLI: ${this.ambientTruth.cliVersion}`
            : undefined,
        ]
          .filter((segment): segment is string => Boolean(segment))
          .join('\n');
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

function compactStatusSegment(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\s+/g, ' ').slice(0, 48);
}
