import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

import { adoptProjectCommand } from './adoptProject';
import { createProjectCommand } from './createProject';

function resolveFolderPath(input?: string | vscode.Uri): string | undefined {
  if (typeof input === 'string' && input.trim().length > 0) {
    return path.resolve(input);
  }
  if (input instanceof vscode.Uri) {
    return path.resolve(input.fsPath);
  }
  return undefined;
}

export async function scaffoldProjectHereCommand(folder?: string | vscode.Uri): Promise<void> {
  const folderPath = resolveFolderPath(folder);
  if (!folderPath) {
    vscode.window.showWarningMessage('Select a folder in the Explorer to scaffold a project.');
    return;
  }

  if (!(await fs.pathExists(folderPath))) {
    vscode.window.showErrorMessage(`Folder does not exist: ${folderPath}`);
    return;
  }

  await createProjectCommand(undefined, undefined, undefined, undefined, {
    explorerFolderPath: folderPath,
  });
}

export async function adoptWithRapidkitCommand(
  folder?: string | vscode.Uri,
  options?: {
    workspacePath?: string;
    projectName?: string;
    projectType?: string;
    enableModules?: boolean;
    useDefaultWorkspace?: boolean;
  }
): Promise<void> {
  const folderPath = resolveFolderPath(folder);
  if (!folderPath) {
    vscode.window.showWarningMessage('Select a folder in the Explorer to adopt with RapidKit.');
    return;
  }

  if (!(await fs.pathExists(folderPath))) {
    vscode.window.showErrorMessage(`Folder does not exist: ${folderPath}`);
    return;
  }

  await adoptProjectCommand({
    projectPath: folderPath,
    projectName: options?.projectName ?? path.basename(folderPath),
    projectType: options?.projectType,
    workspacePath: options?.workspacePath,
    enableModules: options?.enableModules,
    useDefaultWorkspace: options?.useDefaultWorkspace ?? !options?.workspacePath,
  });
}

export async function promptAdoptProjectFromPicker(
  workspacePath?: string,
  enableModules?: boolean,
  useDefaultWorkspace?: boolean
): Promise<void> {
  const folders = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Adopt with RapidKit',
  });
  if (!folders?.[0]) {
    return;
  }
  await adoptWithRapidkitCommand(folders[0], {
    workspacePath,
    enableModules,
    useDefaultWorkspace: useDefaultWorkspace ?? !workspacePath,
  });
}

export function registerExplorerFolderCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('workspai.scaffoldProjectHere', scaffoldProjectHereCommand),
    vscode.commands.registerCommand('workspai.adoptWithRapidkit', adoptWithRapidkitCommand),
    vscode.commands.registerCommand(
      'workspai.adoptProject',
      async (seed?: {
        workspacePath?: string;
        path?: string;
        enableModules?: boolean;
        useDefaultWorkspace?: boolean;
      }) => {
        await promptAdoptProjectFromPicker(
          seed?.useDefaultWorkspace ? undefined : (seed?.workspacePath ?? seed?.path),
          seed?.enableModules,
          seed?.useDefaultWorkspace ?? !(seed?.workspacePath ?? seed?.path)
        );
      }
    ),
  ];
}
