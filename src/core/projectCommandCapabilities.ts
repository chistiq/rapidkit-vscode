import { run } from '../utils/exec';
import { buildNpxRapidkitArgs } from '../utils/platformCapabilities';
import { parseTrailingJson } from './canonicalProjectLifecycle';

export type CommandCapabilityStatus = 'supported' | 'unsupported' | 'global';
export type CommandCapabilityOwner = 'npm' | 'core' | 'runtime' | 'none';

export interface CommandCapabilitySnapshot {
  command: string;
  owner: CommandCapabilityOwner;
  status: CommandCapabilityStatus;
  reason?: string;
  executionScope?: string;
  fleetEligible?: boolean;
}

export interface ProjectCommandCapabilitiesSnapshot {
  schemaVersion: number;
  scope: 'project';
  projectRoot: string | null;
  runtime: string;
  framework: string;
  frameworkDisplayName: string;
  moduleSupport: boolean;
  fleetStages: string[];
  localOnlyCommands: string[];
  commandMap: Record<string, CommandCapabilitySnapshot>;
  supportedCommands: string[];
  unsupportedCommands: string[];
}

type CacheEntry = {
  expiresAt: number;
  capabilities: ProjectCommandCapabilitiesSnapshot;
};

const CACHE_TTL_MS = 60_000;
const capabilityCache = new Map<string, CacheEntry>();

export function clearProjectCommandCapabilitiesCache(projectPath?: string): void {
  if (!projectPath) {
    capabilityCache.clear();
    return;
  }
  capabilityCache.delete(projectPath);
}

export async function fetchProjectCommandCapabilities(
  projectPath: string,
  options: { forceRefresh?: boolean } = {}
): Promise<ProjectCommandCapabilitiesSnapshot | null> {
  const cached = capabilityCache.get(projectPath);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.capabilities;
  }

  const result = await run('npx', buildNpxRapidkitArgs(['project', 'commands', '--json']), {
    cwd: projectPath,
    timeout: 45_000,
  });

  if (result.exitCode !== 0) {
    return null;
  }

  const parsed = parseTrailingJson<ProjectCommandCapabilitiesSnapshot>(result.stdout);
  if (!parsed || parsed.scope !== 'project' || !parsed.commandMap) {
    return null;
  }

  capabilityCache.set(projectPath, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    capabilities: parsed,
  });

  return parsed;
}

export function isProjectCommandSupported(
  capabilities: ProjectCommandCapabilitiesSnapshot,
  command: string
): boolean {
  const entry = capabilities.commandMap[command];
  return entry?.status === 'supported';
}

export function getUnsupportedProjectCommandReason(
  capabilities: ProjectCommandCapabilitiesSnapshot,
  command: string
): string {
  const entry = capabilities.commandMap[command];
  if (entry?.reason) {
    return entry.reason;
  }
  if (entry?.status === 'global') {
    return `${command} is a global RapidKit command, not a project lifecycle action.`;
  }
  return `rapidkit ${command} is not supported for ${capabilities.frameworkDisplayName} projects.`;
}

export async function resolveProjectLifecycleCommand(
  projectPath: string,
  command: string
): Promise<
  | { allowed: true; capabilities: ProjectCommandCapabilitiesSnapshot }
  | { allowed: false; capabilities: ProjectCommandCapabilitiesSnapshot | null; reason: string }
> {
  const capabilities = await fetchProjectCommandCapabilities(projectPath);
  if (!capabilities) {
    return {
      allowed: false,
      capabilities: null,
      reason:
        'Could not resolve Workspai project command capabilities. Run `npx workspai project commands --json` in the project directory.',
    };
  }

  if (!isProjectCommandSupported(capabilities, command)) {
    return {
      allowed: false,
      capabilities,
      reason: getUnsupportedProjectCommandReason(capabilities, command),
    };
  }

  return { allowed: true, capabilities };
}

export function isModuleMutationSupported(
  capabilities: ProjectCommandCapabilitiesSnapshot
): boolean {
  return (
    capabilities.moduleSupport &&
    isProjectCommandSupported(capabilities, 'add') &&
    isProjectCommandSupported(capabilities, 'modules')
  );
}
