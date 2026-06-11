import * as vscode from 'vscode';

import { resetModelSelectionCache } from './aiModelSelection';

export interface WorkspaiSettingsSnapshot {
  preferredModel: string;
  aiStreamTimeoutMs: number;
}

export function readWorkspaiSettings(): WorkspaiSettingsSnapshot {
  const config = vscode.workspace.getConfiguration('workspai');
  const preferredModel = config.get<string>('preferredModel', 'auto');
  const aiStreamTimeoutMs = config.get<number>('aiStreamTimeoutMs', 45_000);

  return {
    preferredModel:
      typeof preferredModel === 'string' && preferredModel.trim().length > 0
        ? preferredModel.trim()
        : 'auto',
    aiStreamTimeoutMs:
      typeof aiStreamTimeoutMs === 'number' && Number.isFinite(aiStreamTimeoutMs)
        ? aiStreamTimeoutMs
        : 45_000,
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

export async function openWorkspaiExtensionSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:rapidkit.rapidkit-vscode workspai'
  );
}
