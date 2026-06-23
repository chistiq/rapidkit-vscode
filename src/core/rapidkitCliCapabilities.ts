import * as vscode from 'vscode';

import {
  clearRuntimeCommandSurfaceCache,
  fetchRuntimeCommandSurface,
} from './runtimeCommandSurface';

/**
 * Canonical workspace intelligence chain the extension depends on. Detection is
 * driven by the structured `rapidkit commands --json` surface
 * (`workspace.intelligenceSubcommands`) and the bundled
 * `runtime-command-surface.v1` contract — never by regex-parsing `--help` text
 * (roadmap item 2.1). A drift-guard test pins this list to the contract.
 */
export const REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS = [
  'model',
  'snapshot',
  'diff',
  'impact',
  'verify',
  'context',
  'agent-sync',
] as const;

/** Top-level command that backs the create-frontend flow. */
const CREATE_COMMAND_ID = 'create';
/** Top-level command that backs the adopt flow. */
const ADOPT_COMMAND_ID = 'adopt';

function workspaceFeatureLabel(subcommand: string): string {
  return `workspace ${subcommand}`;
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

async function showCliCapabilityGate(
  featureLabel: string,
  missingFeatures: string[]
): Promise<boolean> {
  if (missingFeatures.length === 0) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    `${featureLabel} needs rapidkit CLI capabilities not advertised by your linked npm package: ${missingFeatures.join(', ')}. Verify with \`npx rapidkit commands --json\`, link the latest rapidkit-npm locally (npm run install:local), then reload the window.`,
    'Open Setup',
    'Continue anyway'
  );

  if (choice === 'Open Setup') {
    await vscode.commands.executeCommand('workspai.openSetup');
    return false;
  }

  return choice === 'Continue anyway';
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

/** Test/diagnostic helper: drop any cached command-surface resolution. */
export function clearRapidkitCliCapabilityCache(cwd?: string): void {
  clearRuntimeCommandSurfaceCache(cwd);
}
