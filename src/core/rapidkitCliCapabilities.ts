import * as vscode from 'vscode';

import {
  clearRuntimeCommandSurfaceCache,
  fetchRuntimeCommandSurface,
} from './runtimeCommandSurface';

/**
 * Canonical workspace intelligence chain the extension depends on. Detection is
 * driven by the structured `workspai commands --json` surface
 * (`workspace.intelligenceSubcommands`) and the bundled
 * `runtime-command-surface.v1` contract — never by regex-parsing `--help` text
 * (roadmap item 2.1). A drift-guard test pins this list to the contract.
 */
export const REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS = [
  'intelligence',
  'model',
  'snapshot',
  'diff',
  'impact',
  'contract',
  'verify',
  'goal',
  'graph',
  'watch',
  'context',
  'agent-sync',
  'remediation-plan',
  'repair',
  'explain',
  'why',
  'trace',
  'feedback',
  'eval',
  'mcp',
] as const;

/** Top-level command that backs the create-frontend flow. */
const CREATE_COMMAND_ID = 'create';
/** Top-level command that backs the import flow. */
const IMPORT_COMMAND_ID = 'import';
/** Top-level command that backs the adopt flow. */
const ADOPT_COMMAND_ID = 'adopt';

function workspaceFeatureLabel(subcommand: string): string {
  return `workspace ${subcommand}`;
}

function topLevelFeatureLabel(commandId: string): string {
  return commandId;
}

export async function probeWorkspaceIntelligenceCliCapabilities(options?: {
  cwd?: string;
  forceRefresh?: boolean;
}): Promise<{ available: boolean; missingFeatures: string[] }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  if (!surface) {
    return {
      available: false,
      missingFeatures: REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS.map(workspaceFeatureLabel),
    };
  }

  const advertised = new Set(surface.workspaceIntelligenceSubcommands);
  const missing = REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS.filter(
    (subcommand) => !advertised.has(subcommand)
  );

  return {
    available: missing.length === 0,
    missingFeatures: missing.map(workspaceFeatureLabel),
  };
}

export async function probeCreateFrontendCliCapabilities(options?: {
  cwd?: string;
  forceRefresh?: boolean;
}): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.topLevelCommands.includes(CREATE_COMMAND_ID)) };
}

export async function probeAdoptCliCapabilities(options?: {
  cwd?: string;
  forceRefresh?: boolean;
}): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.topLevelCommands.includes(ADOPT_COMMAND_ID)) };
}

export async function probeImportCliCapabilities(options?: {
  cwd?: string;
  forceRefresh?: boolean;
}): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.topLevelCommands.includes(IMPORT_COMMAND_ID)) };
}

export async function probeTopLevelCliCapability(
  commandId: string,
  options?: {
    cwd?: string;
    forceRefresh?: boolean;
  }
): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.topLevelCommands.includes(commandId)) };
}

export async function probeWorkspaceSubcommandCliCapability(
  subcommand: string,
  options?: {
    cwd?: string;
    forceRefresh?: boolean;
  }
): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.workspaceSubcommands.includes(subcommand)) };
}

export async function probeProjectScopedCliCapability(
  commandId: string,
  options?: {
    cwd?: string;
    forceRefresh?: boolean;
  }
): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.projectScopedCommands.includes(commandId)) };
}

export async function probeCoreBackedCliCapability(
  commandId: string,
  options?: {
    cwd?: string;
    forceRefresh?: boolean;
  }
): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return { available: Boolean(surface?.coreBackedCommands.includes(commandId)) };
}

export async function probeRootCliCapability(
  commandId: string,
  options?: {
    cwd?: string;
    forceRefresh?: boolean;
  }
): Promise<{ available: boolean }> {
  const surface = await fetchRuntimeCommandSurface({
    cwd: options?.cwd,
    forceRefresh: options?.forceRefresh,
  });

  return {
    available: Boolean(
      surface?.topLevelCommands.includes(commandId) ||
      surface?.coreBackedCommands.includes(commandId)
    ),
  };
}

async function showCliCapabilityGate(
  featureLabel: string,
  missingFeatures: string[]
): Promise<boolean> {
  if (missingFeatures.length === 0) {
    return true;
  }

  const choice = await vscode.window.showErrorMessage(
    `${featureLabel} is blocked because your linked Workspai CLI does not advertise required capabilities: ${missingFeatures.join(', ')}. Verify with \`workspai commands --json\`, link or install the latest Workspai package, then reload the window.`,
    'Open Setup'
  );

  if (choice === 'Open Setup') {
    await vscode.commands.executeCommand('workspai.openSetup');
  }

  return false;
}

export async function gateWorkspaceIntelligenceCli(
  featureLabel: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeWorkspaceIntelligenceCliCapabilities({ cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, probe.missingFeatures);
}

export async function gateCreateFrontendCli(
  featureLabel: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeCreateFrontendCliCapabilities({ cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, ['create frontend']);
}

export async function gateAdoptCli(
  featureLabel: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeAdoptCliCapabilities({ cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, ['adopt']);
}

export async function gateImportCli(
  featureLabel: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeImportCliCapabilities({ cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, ['import']);
}

export async function gateTopLevelRapidkitCli(
  featureLabel: string,
  commandId: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeTopLevelCliCapability(commandId, { cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, [topLevelFeatureLabel(commandId)]);
}

export async function gateWorkspaceSubcommandCli(
  featureLabel: string,
  subcommand: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeWorkspaceSubcommandCliCapability(subcommand, {
    cwd: options?.cwd,
  });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, [workspaceFeatureLabel(subcommand)]);
}

export async function gateProjectScopedRapidkitCli(
  featureLabel: string,
  commandId: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeProjectScopedCliCapability(commandId, { cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, [`project ${commandId}`]);
}

export async function gateCoreBackedRapidkitCli(
  featureLabel: string,
  commandId: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeCoreBackedCliCapability(commandId, { cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, [topLevelFeatureLabel(commandId)]);
}

export async function gateRootRapidkitCli(
  featureLabel: string,
  commandId: string,
  options?: { cwd?: string }
): Promise<boolean> {
  const probe = await probeRootCliCapability(commandId, { cwd: options?.cwd });
  if (probe.available) {
    return true;
  }
  return showCliCapabilityGate(featureLabel, [topLevelFeatureLabel(commandId)]);
}

/** Test/diagnostic helper: drop any cached command-surface resolution. */
export function clearRapidkitCliCapabilityCache(cwd?: string): void {
  clearRuntimeCommandSurfaceCache(cwd);
}
