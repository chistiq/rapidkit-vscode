import * as vscode from 'vscode';

import type { AgentCustomizationPackPreset } from './agentCustomizationPack.js';

export type AgentSyncSettings = {
  preset: AgentCustomizationPackPreset;
  experimentalHooks: boolean;
};

function normalizePreset(value: unknown): AgentCustomizationPackPreset {
  return value === 'minimal' ? 'minimal' : 'enterprise';
}

export function readAgentSyncSettings(scope?: vscode.ConfigurationScope): AgentSyncSettings {
  const config = vscode.workspace.getConfiguration('workspai', scope);
  return {
    preset: normalizePreset(config.get('agentSync.preset')),
    experimentalHooks: config.get<boolean>('agentSync.experimentalHooks', false) === true,
  };
}

export function resolveAgentSyncCliOptions(
  overrides?: Partial<AgentSyncSettings> & { scope?: string; strict?: boolean; target?: string }
): {
  scope?: string;
  strict?: boolean;
  preset: AgentCustomizationPackPreset;
  target?: string;
  experimentalHooks?: boolean;
} {
  const settings = readAgentSyncSettings();
  return {
    scope: overrides?.scope,
    strict: overrides?.strict,
    preset: overrides?.preset ?? settings.preset,
    target: overrides?.target,
    experimentalHooks: overrides?.experimentalHooks ?? settings.experimentalHooks,
  };
}
