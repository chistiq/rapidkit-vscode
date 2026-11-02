import * as vscode from 'vscode';

import { resetModelSelectionCache } from './aiModelSelection';
import {
  getAIProviderDefinition,
  isAIProviderKind,
  normalizeAIProviderKind,
  type AIProviderKind,
} from './aiProviderCatalog';
import { AIProviderConfigurationError, validateAIProviderBaseUrl } from './aiProviderConfiguration';

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
      (provider.configurableBaseUrl ? profile?.baseUrl : provider.defaultBaseUrl) ||
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

function configurationTarget(
  config: vscode.WorkspaceConfiguration,
  key: string
): vscode.ConfigurationTarget {
  const inspected = config.inspect?.(key);
  if (inspected?.workspaceFolderValue !== undefined) {
    return vscode.ConfigurationTarget.WorkspaceFolder;
  }
  if (inspected?.workspaceValue !== undefined) {
    return vscode.ConfigurationTarget.Workspace;
  }
  return vscode.ConfigurationTarget.Global;
}

export async function setWorkspaiThemeMode(mode: string): Promise<WorkspaiThemeMode> {
  const normalized = normalizeThemeMode(mode);
  await vscode.workspace
    .getConfiguration('workspai')
    .update(
      'themeMode',
      normalized,
      configurationTarget(vscode.workspace.getConfiguration('workspai'), 'themeMode')
    );
  return normalized;
}

export async function setWorkspaiPreferredModel(modelId: string): Promise<string> {
  const normalized =
    typeof modelId === 'string' && modelId.trim().length > 0 ? modelId.trim() : 'auto';
  await vscode.workspace
    .getConfiguration('workspai')
    .update(
      'preferredModel',
      normalized,
      configurationTarget(vscode.workspace.getConfiguration('workspai'), 'preferredModel')
    );
  resetModelSelectionCache();
  return normalized;
}

export async function setWorkspaiAIProvider(provider: string): Promise<WorkspaiSettingsSnapshot> {
  if (!isAIProviderKind(provider)) {
    throw new AIProviderConfigurationError('Unknown AI provider.');
  }
  const normalized = normalizeAIProviderKind(provider);
  await vscode.workspace
    .getConfiguration('workspai')
    .update(
      'aiProvider',
      normalized,
      configurationTarget(vscode.workspace.getConfiguration('workspai'), 'aiProvider')
    );
  resetModelSelectionCache();
  return readWorkspaiSettings();
}

export async function setWorkspaiCustomAIConfig(input: {
  provider?: string;
  baseUrl?: string;
  model?: string;
}): Promise<WorkspaiSettingsSnapshot> {
  const config = vscode.workspace.getConfiguration('workspai');
  if (input.provider !== undefined && !isAIProviderKind(input.provider)) {
    throw new AIProviderConfigurationError('Unknown AI provider.');
  }
  const provider =
    input.provider ?? normalizeAIProviderKind(config.get<string>('aiProvider', 'vscode-lm'));
  if (provider === 'vscode-lm') {
    return readWorkspaiSettings();
  }
  const profiles = normalizeProviderProfiles(
    config.get<Record<string, WorkspaiAIProviderProfile>>('aiProviderProfiles', {})
  );
  const previous = profiles[provider] ?? {};
  const definition = getAIProviderDefinition(provider);
  const baseUrl = definition.configurableBaseUrl
    ? (input.baseUrl?.trim() ?? previous.baseUrl ?? definition.defaultBaseUrl)
    : definition.defaultBaseUrl;
  const model = input.model?.trim() ?? previous.model ?? definition.defaultModel;
  const error = validateAIProviderBaseUrl(baseUrl);
  if (error) {
    throw new AIProviderConfigurationError(error);
  }
  if (!model) {
    throw new AIProviderConfigurationError('Model is missing.');
  }
  profiles[provider] = {
    baseUrl,
    model,
  };
  await config.update(
    'aiProviderProfiles',
    profiles,
    configurationTarget(config, 'aiProviderProfiles')
  );
  if (provider === 'openai-compatible') {
    if (typeof input.baseUrl === 'string') {
      await config.update(
        'customAIBaseUrl',
        input.baseUrl.trim(),
        configurationTarget(config, 'customAIBaseUrl')
      );
    }
    if (typeof input.model === 'string') {
      await config.update(
        'customAIModel',
        input.model.trim(),
        configurationTarget(config, 'customAIModel')
      );
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
