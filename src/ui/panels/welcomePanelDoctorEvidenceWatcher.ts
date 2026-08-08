import * as vscode from 'vscode';

const REPORT_GLOB = '{.workspai,.rapidkit}/reports/**/*.json';
const FOUNDATION_GLOB =
  '{.workspai,.rapidkit}/{archive-manifest.json,workspace.json,workspace.contract.json,toolchain.lock,policies.yml,policies.yaml}';

export type WelcomePanelEvidenceWatcher = vscode.Disposable & {
  watchWorkspace: (workspacePath?: string) => void;
};

export function registerWelcomePanelDoctorEvidenceWatcher(
  disposables: vscode.Disposable[],
  scheduleRefresh: (filePath?: string) => void
): WelcomePanelEvidenceWatcher {
  const ownedDisposables: vscode.Disposable[] = [];
  const scopedDisposables: vscode.Disposable[] = [];
  let watchedWorkspacePath: string | undefined;

  const onFileSystemEvent = (uri?: vscode.Uri) => {
    scheduleRefresh(uri?.fsPath);
  };

  const bindWatcher = (watcher: vscode.FileSystemWatcher, target: vscode.Disposable[]) => {
    target.push(watcher);
    target.push(watcher.onDidCreate(onFileSystemEvent));
    target.push(watcher.onDidChange(onFileSystemEvent));
    target.push(watcher.onDidDelete(onFileSystemEvent));
  };

  bindWatcher(
    vscode.workspace.createFileSystemWatcher(`**/${REPORT_GLOB}`, false, false, false),
    ownedDisposables
  );
  bindWatcher(
    vscode.workspace.createFileSystemWatcher(`**/${FOUNDATION_GLOB}`, false, false, false),
    ownedDisposables
  );

  const controller: WelcomePanelEvidenceWatcher = {
    watchWorkspace(workspacePath?: string) {
      const normalized = workspacePath?.trim();
      if (normalized === watchedWorkspacePath) {
        return;
      }
      for (const disposable of scopedDisposables.splice(0)) {
        disposable.dispose();
      }
      watchedWorkspacePath = normalized;
      if (!normalized) {
        return;
      }
      bindWatcher(
        vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.Uri.file(normalized), REPORT_GLOB),
          false,
          false,
          false
        ),
        scopedDisposables
      );
      bindWatcher(
        vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.Uri.file(normalized), FOUNDATION_GLOB),
          false,
          false,
          false
        ),
        scopedDisposables
      );
    },
    dispose() {
      for (const disposable of scopedDisposables.splice(0)) {
        disposable.dispose();
      }
      for (const disposable of ownedDisposables.splice(0)) {
        disposable.dispose();
      }
      watchedWorkspacePath = undefined;
    },
  };

  disposables.push(controller);
  return controller;
}
