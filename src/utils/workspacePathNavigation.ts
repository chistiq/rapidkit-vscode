import * as fs from 'fs-extra';
import * as vscode from 'vscode';

import {
  inferWorkspacePathOpenMode,
  type WorkspacePathOpenMode,
} from './workspacePathNavigationPolicy';
import { resolveBoundedWorkspaceAbsolutePath } from './workspacePathBoundary';

export type { WorkspacePathOpenMode } from './workspacePathNavigationPolicy';
export { inferWorkspacePathOpenMode } from './workspacePathNavigationPolicy';
export {
  resolveBoundedWorkspaceAbsolutePath,
  isPathWithinWorkspaceRoot,
} from './workspacePathBoundary';
export { resolveWorkspaceAbsolutePath } from './workspacePathNavigationPolicy';

export async function openWorkspacePath(input: {
  workspacePath: string;
  path: string;
  mode?: WorkspacePathOpenMode;
}): Promise<void> {
  const workspacePath = input.workspacePath.trim();
  const relativeOrAbsolutePath = input.path.trim();

  if (!relativeOrAbsolutePath || !workspacePath) {
    throw new Error('Workspace path is not available.');
  }

  const resolvedPath = resolveBoundedWorkspaceAbsolutePath(workspacePath, relativeOrAbsolutePath);
  const mode = input.mode ?? inferWorkspacePathOpenMode(resolvedPath);
  const uri = vscode.Uri.file(resolvedPath);

  if (mode === 'reveal') {
    await vscode.commands.executeCommand('revealFileInOS', uri);
    return;
  }

  if (!(await fs.pathExists(resolvedPath))) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const stat = await fs.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Path is not an openable file: ${resolvedPath}`);
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const isReportArtifact = resolvedPath
    .replace(/\\/g, '/')
    .toLowerCase()
    .includes('/.rapidkit/reports/');
  await vscode.window.showTextDocument(document, {
    preview: !isReportArtifact,
    preserveFocus: false,
  });
}
