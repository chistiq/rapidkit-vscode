import * as vscode from 'vscode';

import { resetModelSelectionCache } from './aiModelSelection';
import {
  getAIProviderDefinition,
  normalizeAIProviderKind,
  type AIProviderKind,
} from './aiProviderCatalog';

export type WorkspaiThemeMode = 'auto' | 'light' | 'dark';

export interface WorkspaiAIProviderProfile {
  baseUrl?: string;
  model?: string;
}

export interface WorkspaiSettingsSnapshot {
  preferredModel: string;
  aiStreamTimeoutMs: number;
  aiProvider: AIProviderKind;
  customAIBaseUrl: string;
  customAIModel: string;
  themeMode: WorkspaiThemeMode;
}

function normalizeThemeMode(value: unknown): WorkspaiThemeMode {
  if (value === 'light' || value === 'dark') {
    return value;
  }
  return 'auto';
}

function normalizeProviderProfiles(value: unknown): Record<string, WorkspaiAIProviderProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([id, profile]) => {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return [];
      }
      const candidate = profile as Record<string, unknown>;
      const baseUrl = typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim() : '';
      const model = typeof candidate.model === 'string' ? candidate.model.trim() : '';
      return [[id, { baseUrl, model } satisfies WorkspaiAIProviderProfile]];
    })
  );
}

export function readWorkspaiSettings(): WorkspaiSettingsSnapshot {
  const config = vscode.workspace.getConfiguration('workspai');
  const preferredModel = config.get<string>('preferredModel', 'auto');
  const aiStreamTimeoutMs = config.get<number>('aiStreamTimeoutMs', 45_000);
  const aiProvider = normalizeAIProviderKind(config.get<string>('aiProvider', 'vscode-lm'));
  const legacyBaseUrl = config.get<string>('customAIBaseUrl', '');
  const legacyModel = config.get<string>('customAIModel', '');
  const profiles = normalizeProviderProfiles(
    config.get<Record<string, WorkspaiAIProviderProfile>>('aiProviderProfiles', {})
  );
  const provider = getAIProviderDefinition(aiProvider);
  const profile = profiles[aiProvider];
  const themeMode = config.get<string>('themeMode', 'auto');

  return {
    preferredModel:
      typeof preferredModel === 'string' && preferredModel.trim().length > 0
        ? preferredModel.trim()
        : 'auto',
    aiStreamTimeoutMs:
      typeof aiStreamTimeoutMs === 'number' && Number.isFinite(aiStreamTimeoutMs)
        ? aiStreamTimeoutMs
        : 45_000,
    aiProvider,
    customAIBaseUrl:
      profile?.baseUrl ||
      (aiProvider === 'openai-compatible' && typeof legacyBaseUrl === 'string'
        ? legacyBaseUrl.trim()
        : '') ||
      provider.defaultBaseUrl,
    customAIModel:
      profile?.model ||
      (aiProvider === 'openai-compatible' && typeof legacyModel === 'string'
        ? legacyModel.trim()
        : '') ||
      provider.defaultModel,
    themeMode: normalizeThemeMode(themeMode),
  };
}

export async function setWorkspaiThemeMode(mode: string): Promise<WorkspaiThemeMode> {
  const normalized = normalizeThemeMode(mode);
  await vscode.workspace
    .getConfiguration('workspai')
    .update('themeMode', normalized, vscode.ConfigurationTarget.Global);
  return normalized;
}

export async function setWorkspaiPreferredModel(modelId: string): Promise<string> {
  const normalized =
    typeof modelId === 'string' && modelId.trim().length > 0 ? modelId.trim() : 'auto';
  await vscode.workspace
    .getConfiguration('workspai')
    .update('preferredModel', normalized, vscode.ConfigurationTarget.Global);
  resetModelSelectionCache();
  return normalized;
}

export async function setWorkspaiAIProvider(provider: string): Promise<WorkspaiSettingsSnapshot> {
  const normalized = normalizeAIProviderKind(provider);
  await vscode.workspace
    .getConfiguration('workspai')
    .update('aiProvider', normalized, vscode.ConfigurationTarget.Global);
  resetModelSelectionCache();
  return readWorkspaiSettings();
}

export async function setWorkspaiCustomAIConfig(input: {
  baseUrl?: string;
  model?: string;
}): Promise<WorkspaiSettingsSnapshot> {
  const config = vscode.workspace.getConfiguration('workspai');
  const provider = normalizeAIProviderKind(config.get<string>('aiProvider', 'vscode-lm'));
  if (provider === 'vscode-lm') {
    return readWorkspaiSettings();
  }
  const profiles = normalizeProviderProfiles(
    config.get<Record<string, WorkspaiAIProviderProfile>>('aiProviderProfiles', {})
  );
  const previous = profiles[provider] ?? {};
  profiles[provider] = {
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl.trim() : previous.baseUrl,
    model: typeof input.model === 'string' ? input.model.trim() : previous.model,
  };
  await config.update('aiProviderProfiles', profiles, vscode.ConfigurationTarget.Global);
  if (provider === 'openai-compatible') {
    if (typeof input.baseUrl === 'string') {
      await config.update(
        'customAIBaseUrl',
        input.baseUrl.trim(),
        vscode.ConfigurationTarget.Global
      );
    }
    if (typeof input.model === 'string') {
      await config.update('customAIModel', input.model.trim(), vscode.ConfigurationTarget.Global);
    }
  }
  return readWorkspaiSettings();
}

export async function openWorkspaiExtensionSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:rapidkit.rapidkit-vscode workspai'
  );
}
