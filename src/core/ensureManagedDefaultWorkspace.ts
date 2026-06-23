import * as path from 'path';

import * as fs from 'fs-extra';

import { WorkspaiCLI } from '../core/rapidkitCLI';
import { WorkspaceManager } from '../core/workspaceManager';
import type { WorkspaiWorkspace } from '../types';
import {
  hasWorkspaceRootMarkers,
  resolveManagedDefaultImportWorkspacePath,
} from './workspacePaths';
import { writeWorkspaceMarker, type WorkspaceMarker } from '../utils/workspaceMarker';

export type EnsuredManagedDefaultWorkspace = {
  path: string;
  name: string;
  created: boolean;
};

async function writeManagedDefaultWorkspaceSkeleton(
  workspacePath: string,
  workspaceName: string
): Promise<void> {
  await fs.ensureDir(path.join(workspacePath, '.rapidkit'));

  const markerPath = path.join(workspacePath, '.rapidkit-workspace');
  if (!(await fs.pathExists(markerPath))) {
    const marker: WorkspaceMarker = {
      signature: 'RAPIDKIT_WORKSPACE',
      createdBy: 'rapidkit-vscode',
      version: '0.0.0',
      createdAt: new Date().toISOString(),
      name: workspaceName,
    };
    await writeWorkspaceMarker(workspacePath, marker);
  }

  const workspaceManifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
  if (!(await fs.pathExists(workspaceManifestPath))) {
    await fs.writeJson(
      workspaceManifestPath,
      {
        name: workspaceName,
        workspace_name: workspaceName,
        profile: 'minimal',
        createdAt: new Date().toISOString(),
        createdBy: 'rapidkit-vscode-managed-default',
      },
      { spaces: 2 }
    );
  }
}

async function ensureWorkspaceViaNpm(workspacePath: string, workspaceName: string): Promise<void> {
  if (hasWorkspaceRootMarkers(workspacePath)) {
    return;
  }

  const cli = new WorkspaiCLI();
  const result = await cli.createWorkspace({
    name: workspaceName,
    parentPath: path.dirname(workspacePath),
    profile: 'minimal',
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create workspace "${workspaceName}" via RapidKit CLI: ${
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
 * Create or reuse the managed default workspace slot (`~/rapidkit/workspaces/workspai`).
 * Mirrors npm `ensureManagedDefaultImportWorkspace` used by `rapidkit import` / `adopt`.
 */
export async function ensureManagedDefaultWorkspace(): Promise<EnsuredManagedDefaultWorkspace> {
  const workspacePath = resolveManagedDefaultImportWorkspacePath();
  const workspaceName = path.basename(workspacePath);
  const existed = hasWorkspaceRootMarkers(workspacePath);

  await writeManagedDefaultWorkspaceSkeleton(workspacePath, workspaceName);
  await ensureWorkspaceRegistration(workspacePath);

  return {
    path: workspacePath,
    name: workspaceName,
    created: !existed,
  };
}
