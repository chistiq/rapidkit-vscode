import * as vscode from 'vscode';

export function registerWelcomePanelDoctorEvidenceWatcher(
  disposables: vscode.Disposable[],
  scheduleRefresh: (filePath?: string) => void
): void {
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/{.workspai,.rapidkit}/reports/**/*.json',
    false,
    false,
    true
  );

  const onFileSystemEvent = (uri?: vscode.Uri) => {
    scheduleRefresh(uri?.fsPath);
  };

  watcher.onDidCreate(onFileSystemEvent);
  watcher.onDidChange(onFileSystemEvent);
  watcher.onDidDelete(onFileSystemEvent);

  disposables.push(watcher);
}
