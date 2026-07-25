import * as path from 'path';

import { WorkspaiCLI } from '../core/rapidkitCLI';
import { WorkspaceManager } from '../core/workspaceManager';
import type { WorkspaiWorkspace } from '../types';
import {
  hasWorkspaceRootMarkers,
  resolveManagedDefaultImportWorkspacePath,
} from './workspacePaths';

export type EnsuredManagedDefaultWorkspace = {
  path: string;
  name: string;
  created: boolean;
};

async function ensureWorkspaceViaNpm(workspacePath: string, workspaceName: string): Promise<void> {
  if (hasWorkspaceRootMarkers(workspacePath)) {
    return;
  }

  const cli = new WorkspaiCLI();
  const result = await cli.createWorkspace({
    name: workspaceName,
    parentPath: path.dirname(workspacePath),
    profile: 'polyglot',
    skipPythonEngine: true,
    skipGit: true,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create workspace "${workspaceName}" via Workspai CLI: ${
        result.stderr || result.stdout || 'unknown error'
      }`
    );
  }
}

export async function ensureWorkspaceSkeletonViaNpm(
  workspacePath: string,
  workspaceName: string
): Promise<void> {
  await ensureWorkspaceViaNpm(workspacePath, workspaceName);
  await registerManagedWorkspacePath(workspacePath);
}

async function ensureWorkspaceRegistration(workspacePath: string): Promise<void> {
  const manager = WorkspaceManager.getInstance();
  await manager.loadWorkspaces();

  const existing = manager
    .getWorkspaces()
    .find((ws: WorkspaiWorkspace) => ws.path === workspacePath);
  if (existing) {
    await manager.touchWorkspace(workspacePath);
    return;
  }

  await manager.addWorkspace(workspacePath);
}

/**
 * Register an existing workspace folder in the extension registry.
 */
export async function registerManagedWorkspacePath(workspacePath: string): Promise<boolean> {
  const manager = WorkspaceManager.getInstance();
  await manager.loadWorkspaces();
  const existing = manager
    .getWorkspaces()
    .find((ws: WorkspaiWorkspace) => ws.path === workspacePath);
  if (existing) {
    await manager.touchWorkspace(workspacePath);
    return true;
  }
  const added = await manager.addWorkspace(workspacePath);
  return Boolean(added);
}

/**
 * Create or reuse the managed default workspace slot (`~/.workspai/workspaces/workspai`).
 * Mirrors the Workspai CLI managed import/adopt workspace.
 */
export async function ensureManagedDefaultWorkspace(): Promise<EnsuredManagedDefaultWorkspace> {
  const workspacePath = resolveManagedDefaultImportWorkspacePath();
  const workspaceName = path.basename(workspacePath);
  const existed = hasWorkspaceRootMarkers(workspacePath);

  await ensureWorkspaceViaNpm(workspacePath, workspaceName);
  await ensureWorkspaceRegistration(workspacePath);

  return {
    path: workspacePath,
    name: workspaceName,
    created: !existed,
  };
}
