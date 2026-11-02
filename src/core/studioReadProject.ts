import path from 'node:path';
import fs from 'fs-extra';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';

export type StudioReadScope = {
  workspacePath: string;
  projectPath?: string;
  /** Registered identity or exact workspace-relative location; never a guessed first project. */
  project?: string;
  signal?: AbortSignal;
};

export function requireStudioReadNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Read was cancelled.');
  }
}

export async function resolveStudioReadProject(request: StudioReadScope) {
  requireStudioReadNotCancelled(request.signal);
  const inventory = await inspectStudioWorkspaceInventory(
    request.projectPath ?? request.workspacePath
  );
  const selectedPath =
    'scope' in inventory && inventory.scope && 'projectPath' in inventory.scope
      ? inventory.scope.projectPath
      : undefined;
  if (
    request.project !== undefined &&
    (typeof request.project !== 'string' ||
      !request.project.trim() ||
      request.project.length > 2000 ||
      /[\0\r\n]/.test(request.project))
  ) {
    throw new Error('Invalid registered project selector.');
  }
  let projectPath = selectedPath ?? request.projectPath;
  if (request.projectPath && inventory.management === 'workspai' && inventory.workspace) {
    const workspace = await inspectStudioWorkspaceInventory(request.workspacePath);
    if (
      workspace.management === 'workspai' &&
      workspace.workspace &&
      (await fs.realpath(workspace.workspace.path)) !==
        (await fs.realpath(inventory.workspace.path))
    ) {
      throw new Error('The selected project belongs to a different workspace.');
    }
  }
  if (
    !projectPath &&
    request.project === undefined &&
    inventory.management === 'unmanaged' &&
    (await fs.pathExists(path.join(request.workspacePath, 'package.json')))
  ) {
    projectPath = request.workspacePath;
  }
  if (request.project !== undefined) {
    if (!inventory.workspace || inventory.management !== 'workspai') {
      throw new Error('An explicit project selector requires resolved workspace membership.');
    }
    const selector = request.project.trim();
    const matches = inventory.projects.filter(
      (entry) =>
        entry.id === selector ||
        entry.name === selector ||
        path.relative(inventory.workspace!.path, entry.path).replace(/\\/g, '/') === selector
    );
    if (matches.length !== 1) {
      throw new Error(
        'Project selector is missing or ambiguous. Inspect workspace inventory and use an exact registered project identity.'
      );
    }
    const selected = await fs.realpath(matches[0].path);
    if (projectPath && selected !== (await fs.realpath(projectPath))) {
      throw new Error('A project-scoped read cannot select another project.');
    }
    projectPath = selected;
  }
  if (projectPath) {
    projectPath = await fs.realpath(projectPath);
  }
  requireStudioReadNotCancelled(request.signal);
  return { inventory, projectPath };
}
