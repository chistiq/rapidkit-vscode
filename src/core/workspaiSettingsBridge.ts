import * as vscode from 'vscode';

import { resetModelSelectionCache } from './aiModelSelection';

export interface WorkspaiSettingsSnapshot {
  preferredModel: string;
  aiStreamTimeoutMs: number;
  aiProvider: 'vscode-lm' | 'openai-compatible';
  customAIBaseUrl: string;
  customAIModel: string;
}

export function readWorkspaiSettings(): WorkspaiSettingsSnapshot {
  const config = vscode.workspace.getConfiguration('workspai');
  const preferredModel = config.get<string>('preferredModel', 'auto');
  const aiStreamTimeoutMs = config.get<number>('aiStreamTimeoutMs', 45_000);
  const aiProvider = config.get<string>('aiProvider', 'vscode-lm');
  const customAIBaseUrl = config.get<string>('customAIBaseUrl', '');
  const customAIModel = config.get<string>('customAIModel', '');

  return {
    preferredModel:
      typeof preferredModel === 'string' && preferredModel.trim().length > 0
        ? preferredModel.trim()
        : 'auto',
    aiStreamTimeoutMs:
      typeof aiStreamTimeoutMs === 'number' && Number.isFinite(aiStreamTimeoutMs)
        ? aiStreamTimeoutMs
        : 45_000,
    aiProvider: aiProvider === 'openai-compatible' ? 'openai-compatible' : 'vscode-lm',
    customAIBaseUrl:
      typeof customAIBaseUrl === 'string' && customAIBaseUrl.trim().length > 0
        ? customAIBaseUrl.trim()
        : '',
    customAIModel:
      typeof customAIModel === 'string' && customAIModel.trim().length > 0
        ? customAIModel.trim()
        : '',
  };
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
  const normalized = provider === 'openai-compatible' ? 'openai-compatible' : 'vscode-lm';
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
  if (typeof input.baseUrl === 'string') {
    await config.update('customAIBaseUrl', input.baseUrl.trim(), vscode.ConfigurationTarget.Global);
  }
  if (typeof input.model === 'string') {
    await config.update('customAIModel', input.model.trim(), vscode.ConfigurationTarget.Global);
  }
  return readWorkspaiSettings();
}

export async function openWorkspaiExtensionSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:rapidkit.rapidkit-vscode workspai'
  );
}
