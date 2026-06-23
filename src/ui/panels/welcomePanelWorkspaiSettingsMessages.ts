import * as vscode from 'vscode';

import {
  clearCustomAIAPIKey,
  getAIProviderStatus,
  runConfiguredAIProviderHealthCheck,
  setCustomAIAPIKey,
} from '../../core/aiProviderService';
import {
  openWorkspaiExtensionSettings,
  readWorkspaiSettings,
  setWorkspaiAIProvider,
  setWorkspaiCustomAIConfig,
  setWorkspaiPreferredModel,
  setWorkspaiThemeMode,
} from '../../core/workspaiSettingsBridge';

export type WorkspaiSettingsMessageHost = {
  context: vscode.ExtensionContext;
  postWebviewMessage: (command: string, data?: unknown) => void;
  sendWorkspaiSettings: (preferredModelOverride?: string) => Promise<void>;
};

const WORKSPAI_SETTINGS_COMMANDS = new Set([
  'requestWorkspaiSettings',
  'setPreferredModel',
  'setThemeMode',
  'setAIProvider',
  'setCustomAIConfig',
  'setCustomAIAPIKey',
  'clearCustomAIAPIKey',
  'testAIProvider',
  'openWorkspaiExtensionSettings',
  'aiGetModels',
]);

export function isWorkspaiSettingsWebviewCommand(command: string): boolean {
  return WORKSPAI_SETTINGS_COMMANDS.has(command);
}

export async function tryDispatchWorkspaiSettingsWebviewMessage(
  host: WorkspaiSettingsMessageHost,
  command: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!isWorkspaiSettingsWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'requestWorkspaiSettings':
      await host.sendWorkspaiSettings();
      return true;
    case 'setPreferredModel': {
      const modelId = typeof data?.modelId === 'string' ? data.modelId : 'auto';
      const preferredModel = await setWorkspaiPreferredModel(modelId);
      await host.sendWorkspaiSettings(preferredModel);
      return true;
    }
    case 'setThemeMode': {
      const mode = typeof data?.mode === 'string' ? data.mode : 'auto';
      await setWorkspaiThemeMode(mode);
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'setAIProvider': {
      const provider = typeof data?.provider === 'string' ? data.provider : 'vscode-lm';
      await setWorkspaiAIProvider(provider);
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'setCustomAIConfig': {
      await setWorkspaiCustomAIConfig({
        baseUrl: typeof data?.baseUrl === 'string' ? data.baseUrl : undefined,
        model: typeof data?.model === 'string' ? data.model : undefined,
      });
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'setCustomAIAPIKey': {
      const apiKey = typeof data?.apiKey === 'string' ? data.apiKey : '';
      await setCustomAIAPIKey(host.context, apiKey);
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'clearCustomAIAPIKey':
      await clearCustomAIAPIKey(host.context);
      await host.sendWorkspaiSettings();
      return true;
    case 'testAIProvider': {
      const result = await runConfiguredAIProviderHealthCheck(host.context);
      host.postWebviewMessage('aiProviderHealthCheck', result);
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'openWorkspaiExtensionSettings':
      await openWorkspaiExtensionSettings();
      return true;
    case 'aiGetModels': {
      try {
        const { listAvailableModels } = await import('../../core/aiService.js');
        const models = await listAvailableModels();
        host.postWebviewMessage('aiModelsList', { models });
      } catch {
        host.postWebviewMessage('aiModelsList', { models: [] });
      }
      return true;
    }
    default:
      return false;
  }
}

export async function buildWorkspaiSettingsPayload(
  context: vscode.ExtensionContext,
  preferredModelOverride?: string
) {
  const settings = readWorkspaiSettings();
  let models: Array<{ id: string; name: string; vendor: string }> = [];
  const aiProviderStatus = await getAIProviderStatus(context);

  try {
    const { listAvailableModels } = await import('../../core/aiService.js');
    models = await listAvailableModels();
  } catch {
    models = [];
  }

  return {
    preferredModel: preferredModelOverride ?? settings.preferredModel,
    aiStreamTimeoutMs: settings.aiStreamTimeoutMs,
    aiProvider: settings.aiProvider,
    customAIBaseUrl: settings.customAIBaseUrl,
    customAIModel: settings.customAIModel,
    themeMode: settings.themeMode,
    aiProviderStatus,
    models,
  };
}
