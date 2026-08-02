import path from 'node:path';
import * as fs from 'fs-extra';

const CORE_REQUIRED_PROFILES = new Set(['python-only', 'polyglot', 'enterprise']);
const MODULE_CAPABLE_KITS = new Set(['fastapi.standard', 'fastapi.ddd', 'nestjs.standard']);

export type WorkspaceCoreRequirement = {
  required: boolean;
  reason:
    | 'local-environment'
    | 'profile'
    | 'python-kit'
    | 'modules'
    | 'user-opted-out'
    | 'not-required';
  profile?: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown> | undefined> {
  if (!(await fs.pathExists(filePath))) {
    return undefined;
  }
  return record(await fs.readJSON(filePath).catch(() => undefined));
}

/**
 * Resolve whether RapidKit Core belongs to a workspace.
 *
 * A globally installed Python engine is a machine capability, not evidence
 * that every registered workspace requires it.
 */
export async function resolveWorkspaceCoreRequirement(
  workspacePath: string
): Promise<WorkspaceCoreRequirement> {
  if (await fs.pathExists(path.join(workspacePath, '.venv'))) {
    return { required: true, reason: 'local-environment' };
  }

  const workspaceManifest =
    (await readJsonRecord(path.join(workspacePath, '.workspai', 'workspace.json'))) ??
    (await readJsonRecord(path.join(workspacePath, '.rapidkit', 'workspace.json')));
  const profile =
    typeof workspaceManifest?.profile === 'string' ? workspaceManifest.profile : undefined;
  const engine = record(workspaceManifest?.engine);
  const pythonCore = record(engine?.python_core);
  if (pythonCore?.status === 'skipped' && pythonCore.reason === 'user-opted-out') {
    return { required: false, reason: 'user-opted-out', profile };
  }
  if (profile && CORE_REQUIRED_PROFILES.has(profile)) {
    return { required: true, reason: 'profile', profile };
  }

  const contract =
    (await readJsonRecord(path.join(workspacePath, '.workspai', 'workspace.contract.json'))) ??
    (await readJsonRecord(path.join(workspacePath, '.rapidkit', 'workspace.contract.json')));
  const contractWorkspace = record(contract?.workspace);
  const contractProfile =
    typeof contractWorkspace?.profile === 'string' ? contractWorkspace.profile : profile;
  if (contractProfile && CORE_REQUIRED_PROFILES.has(contractProfile)) {
    return { required: true, reason: 'profile', profile: contractProfile };
  }

  const projects = Array.isArray(contract?.projects) ? contract.projects : [];
  for (const value of projects) {
    const project = record(value);
    if (!project) {
      continue;
    }
    const kit = typeof project.kit === 'string' ? project.kit : '';
    if (kit.startsWith('fastapi.')) {
      return { required: true, reason: 'python-kit', profile: contractProfile };
    }
    if (
      MODULE_CAPABLE_KITS.has(kit) &&
      Array.isArray(project.modules) &&
      project.modules.length > 0
    ) {
      return { required: true, reason: 'modules', profile: contractProfile };
    }
  }

  return { required: false, reason: 'not-required', profile: contractProfile };
}
