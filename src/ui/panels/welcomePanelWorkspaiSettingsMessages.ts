import * as vscode from 'vscode';

import {
  clearCustomAIAPIKey,
  getAIProviderStatus,
  runConfiguredAIProviderHealthCheck,
  setCustomAIAPIKey,
} from '../../core/aiProviderService';
import {
  getAIProviderDefinition,
  isAIProviderKind,
  listAIProviderDefinitions,
} from '../../core/aiProviderCatalog';
import { AIProviderConfigurationError } from '../../core/aiProviderConfiguration';
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
  'openAIProviderLink',
  'openWorkspaiExtensionSettings',
  'aiGetModels',
]);

export function isWorkspaiSettingsWebviewCommand(command: string): boolean {
  return WORKSPAI_SETTINGS_COMMANDS.has(command);
}

async function dispatchWorkspaiSettingsWebviewMessage(
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
        ...(typeof data?.provider === 'string' ? { provider: data.provider } : {}),
        baseUrl: typeof data?.baseUrl === 'string' ? data.baseUrl : undefined,
        model: typeof data?.model === 'string' ? data.model : undefined,
      });
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'setCustomAIAPIKey': {
      const apiKey = typeof data?.apiKey === 'string' ? data.apiKey : '';
      if (!apiKey.trim()) {
        throw new AIProviderConfigurationError('Enter an API key to save.');
      }
      await setCustomAIAPIKey(
        host.context,
        apiKey,
        typeof data?.provider === 'string' ? data.provider : undefined
      );
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'clearCustomAIAPIKey':
      await clearCustomAIAPIKey(
        host.context,
        typeof data?.provider === 'string' ? data.provider : undefined
      );
      await host.sendWorkspaiSettings();
      return true;
    case 'testAIProvider': {
      const settings = readWorkspaiSettings();
      if (data?.provider && data.provider !== settings.aiProvider) {
        throw new AIProviderConfigurationError(
          'Provider selection changed. Refresh settings before testing.'
        );
      }
      if (
        (typeof data?.baseUrl === 'string' && data.baseUrl !== settings.customAIBaseUrl) ||
        (typeof data?.model === 'string' && data.model !== settings.customAIModel) ||
        (typeof data?.preferredModel === 'string' &&
          data.preferredModel !== settings.preferredModel)
      ) {
        throw new AIProviderConfigurationError(
          'Provider configuration changed. Refresh settings before testing.'
        );
      }
      const result = await runConfiguredAIProviderHealthCheck(host.context, undefined, settings);
      host.postWebviewMessage('aiProviderHealthCheck', { ...result, requestId: data?.requestId });
      await host.sendWorkspaiSettings();
      return true;
    }
    case 'openAIProviderLink': {
      const provider = getAIProviderDefinition(data?.provider);
      const destination = data?.destination === 'api-key' ? 'api-key' : 'docs';
      const url = destination === 'api-key' ? provider.apiKeyUrl : provider.docsUrl;
      if (url) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
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

const providerMutationCommands = new Set([
  'setPreferredModel',
  'setAIProvider',
  'setCustomAIConfig',
  'setCustomAIAPIKey',
  'clearCustomAIAPIKey',
  'testAIProvider',
]);
const settingsLanes = new WeakMap<vscode.ExtensionContext, Promise<unknown>>();

export async function tryDispatchWorkspaiSettingsWebviewMessage(
  host: WorkspaiSettingsMessageHost,
  command: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!providerMutationCommands.has(command)) {
    return dispatchWorkspaiSettingsWebviewMessage(host, command, data);
  }
  const run = async () => {
    let healthCheck: unknown;
    try {
      if (data?.provider !== undefined && !isAIProviderKind(data.provider)) {
        throw new AIProviderConfigurationError('Unknown AI provider.');
      }
      await dispatchWorkspaiSettingsWebviewMessage(
        {
          ...host,
          postWebviewMessage: (name, payload) => {
            if (name === 'aiProviderHealthCheck') {
              healthCheck = payload;
            }
            host.postWebviewMessage(name, payload);
          },
        },
        command,
        data
      );
      host.postWebviewMessage('aiProviderSettingsResult', {
        requestId: data?.requestId,
        provider: data?.provider,
        command,
        ok: true,
        message:
          command === 'testAIProvider' ? 'Provider test finished.' : 'Provider settings saved.',
        ...(healthCheck ? { healthCheck } : {}),
      });
    } catch (error) {
      host.postWebviewMessage('aiProviderSettingsResult', {
        requestId: data?.requestId,
        provider: data?.provider,
        command,
        ok: false,
        message:
          error instanceof AIProviderConfigurationError
            ? error.message
            : 'Could not confirm the provider update. Refresh settings and try again.',
      });
    }
    return true;
  };
  const previous = settingsLanes.get(host.context) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  settingsLanes.set(host.context, next);
  try {
    return await next;
  } finally {
    if (settingsLanes.get(host.context) === next) {
      settingsLanes.delete(host.context);
    }
  }
}

export async function buildWorkspaiSettingsPayload(
  context: vscode.ExtensionContext,
  preferredModelOverride?: string
) {
  const settings = readWorkspaiSettings();
  let models: Array<{ id: string; name: string; vendor: string }> = [];
  const aiProviderStatus = await getAIProviderStatus(context, settings);

  if (settings.aiProvider === 'vscode-lm') {
    try {
      const { listAvailableModels } = await import('../../core/aiService.js');
      models = await listAvailableModels();
    } catch {
      models = [];
    }
  }

  if (settings.aiProvider === 'vscode-lm' && models.length === 0) {
    aiProviderStatus.ready = false;
    aiProviderStatus.reason =
      'No available VS Code language models. Enable a model provider and refresh.';
  }

  return {
    preferredModel: preferredModelOverride ?? settings.preferredModel,
    aiStreamTimeoutMs: settings.aiStreamTimeoutMs,
    aiProvider: settings.aiProvider,
    customAIBaseUrl: settings.customAIBaseUrl,
    customAIModel: settings.customAIModel,
    themeMode: settings.themeMode,
    aiProviderStatus,
    aiProviderCatalog: listAIProviderDefinitions(),
    models,
  };
}
