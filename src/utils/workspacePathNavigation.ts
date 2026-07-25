import * as fs from 'fs-extra';
import * as vscode from 'vscode';

import {
  inferWorkspacePathOpenMode,
  type WorkspacePathOpenMode,
} from './workspacePathNavigationPolicy';
import {
  isPathWithinWorkspaceRoot,
  resolveBoundedWorkspaceAbsolutePath,
} from './workspacePathBoundary';

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
  allowedRootPaths?: string[];
}): Promise<void> {
  const workspacePath = input.workspacePath.trim();
  const relativeOrAbsolutePath = input.path.trim();

  if (!relativeOrAbsolutePath || !workspacePath) {
    throw new Error('Workspace path is not available.');
  }

  let resolvedPath: string;
  try {
    resolvedPath = resolveBoundedWorkspaceAbsolutePath(workspacePath, relativeOrAbsolutePath);
  } catch (error) {
    const allowedRoots = (input.allowedRootPaths ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const alternateRoot = allowedRoots.find((rootPath) =>
      isPathWithinWorkspaceRoot(rootPath, relativeOrAbsolutePath)
    );
    if (!alternateRoot) {
      throw error;
    }
    resolvedPath = resolveBoundedWorkspaceAbsolutePath(alternateRoot, relativeOrAbsolutePath);
  }
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
