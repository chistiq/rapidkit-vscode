import { describePortableCreationFailure } from './portableCreationFailure.js';
import * as fs from 'fs-extra';

import { createWorkspaceCommand } from '../commands/createWorkspace';
import { Logger } from '../utils/logger';
import { hasWorkspaceRootMarkers, resolveNewWorkspacePath } from './workspacePaths';

export type ManagedWorkspaceCreationInput = {
  name: string;
  profile:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';
  installMethod?: 'poetry' | 'venv' | 'pipx' | 'auto';
  skipPythonEngine?: boolean;
  initGit?: boolean;
  policyMode?: 'warn' | 'strict' | 'disabled';
  dependencySharing?: 'isolated' | 'shared';
};

export type WorkspaceCreationFailureCode =
  | 'runtime-unavailable'
  | 'runtime-integrity-failed'
  | 'runtime-cache-conflict'
  | 'permission-denied'
  | 'disk-space-exhausted'
  | 'partial-workspace'
  | 'workspace-invalid'
  | 'creation-failed';

export type WorkspaceCreationFailure = {
  ok: false;
  code: WorkspaceCreationFailureCode;
  message: string;
  technicalMessage: string;
  retryable: boolean;
  phase: 'preflight' | 'runtime' | 'create' | 'verify';
};

export type WorkspaceCreationSuccess = {
  ok: true;
  workspacePath: string;
  workspaceName: string;
  reused: boolean;
};

export type WorkspaceCreationResult = WorkspaceCreationSuccess | WorkspaceCreationFailure;

const activeCreations = new Map<string, Promise<WorkspaceCreationResult>>();

async function runCreation(input: ManagedWorkspaceCreationInput): Promise<WorkspaceCreationResult> {
  const logger = Logger.getInstance();
  const workspaceName = input.name.trim();
  const workspacePath = resolveNewWorkspacePath(workspaceName);
  const existed = hasWorkspaceRootMarkers(workspacePath);

  if ((await fs.pathExists(workspacePath)) && !existed) {
    return {
      ok: false,
      code: 'partial-workspace',
      message:
        `A directory named “${workspaceName}” already exists but is not a valid Workspai workspace. ` +
        'Review or remove that partial directory, then retry.',
      technicalMessage: `Partial workspace directory detected at ${workspacePath}`,
      retryable: false,
      phase: 'preflight',
    };
  }

  try {
    await createWorkspaceCommand({
      ...input,
      name: workspaceName,
      suppressPostCreatePrompt: true,
      silent: true,
    });
  } catch (error) {
    logger.error(`Managed workspace creation failed for ${workspaceName}`, error);
    return describePortableCreationFailure(error, workspaceName);
  }

  if (!hasWorkspaceRootMarkers(workspacePath)) {
    const technicalMessage = `Workspace creation returned without canonical markers at ${workspacePath}`;
    logger.error(technicalMessage);
    return {
      ok: false,
      code: 'workspace-invalid',
      message:
        `Workspai created files for “${workspaceName}”, but canonical workspace verification did not pass. ` +
        'No project scaffolding was started.',
      technicalMessage,
      retryable: false,
      phase: 'verify',
    };
  }

  return { ok: true, workspacePath, workspaceName, reused: existed };
}

/**
 * Create one canonical workspace per target at a time.
 *
 * All chat and AI creation paths use this operation instead of nesting a VS Code
 * command. The caller therefore receives the real failure and cannot continue
 * into project scaffolding after a swallowed workspace error.
 */
export function createManagedWorkspace(
  input: ManagedWorkspaceCreationInput
): Promise<WorkspaceCreationResult> {
  const workspacePath = resolveNewWorkspacePath(input.name.trim());
  const active = activeCreations.get(workspacePath);
  if (active) {
    return active;
  }
  const operation = runCreation(input).finally(() => {
    if (activeCreations.get(workspacePath) === operation) {
      activeCreations.delete(workspacePath);
    }
  });
  activeCreations.set(workspacePath, operation);
  return operation;
}

export { describePortableCreationFailure } from './portableCreationFailure.js';
