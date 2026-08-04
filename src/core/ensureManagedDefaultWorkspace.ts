import * as path from 'path';
import fs from 'fs-extra';

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

const workspaceCreationByPath = new Map<string, Promise<void>>();

function describeCliFailure(result: Record<string, unknown>): string {
  for (const candidate of [
    result.stderr,
    result.stdout,
    result.shortMessage,
    result.originalMessage,
    result.message,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  const exitCode = typeof result.exitCode === 'number' ? result.exitCode : undefined;
  const signal = typeof result.signal === 'string' ? result.signal : undefined;
  if (exitCode !== undefined) {
    return `CLI exited with code ${exitCode}${signal ? ` (${signal})` : ''}.`;
  }
  return 'The CLI process did not return diagnostic output.';
}

async function ensureWorkspaceViaNpm(workspacePath: string, workspaceName: string): Promise<void> {
  if (hasWorkspaceRootMarkers(workspacePath)) {
    return;
  }

  const normalizedPath = path.resolve(workspacePath);
  const inFlight = workspaceCreationByPath.get(normalizedPath);
  if (inFlight) {
    await inFlight;
    return;
  }

  const creation = (async () => {
    const parentPath = path.dirname(normalizedPath);
    await fs.ensureDir(parentPath);

    const cli = new WorkspaiCLI();
    const result = await cli.createWorkspace({
      name: workspaceName,
      parentPath,
      profile: 'minimal',
      skipPythonEngine: true,
      skipGit: true,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to create workspace "${workspaceName}" via Workspai CLI: ${describeCliFailure(result)}`
      );
    }
    if (!hasWorkspaceRootMarkers(normalizedPath)) {
      throw new Error(
        `Workspai CLI reported success but did not create a workspace marker at "${normalizedPath}".`
      );
    }
  })();

  workspaceCreationByPath.set(normalizedPath, creation);
  try {
    await creation;
  } finally {
    if (workspaceCreationByPath.get(normalizedPath) === creation) {
      workspaceCreationByPath.delete(normalizedPath);
    }
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
