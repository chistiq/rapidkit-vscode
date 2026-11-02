import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockUpdate, mockInspect, mockExecuteCommand, mockResetModelSelectionCache } =
  vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockUpdate: vi.fn(),
    mockInspect: vi.fn(),
    mockExecuteCommand: vi.fn(),
    mockResetModelSelectionCache: vi.fn(),
  }));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockGet,
      update: mockUpdate,
      inspect: mockInspect,
    }),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

vi.mock('../core/aiModelSelection.js', () => ({
  resetModelSelectionCache: mockResetModelSelectionCache,
}));

import {
  openWorkspaiExtensionSettings,
  readWorkspaiSettings,
  setWorkspaiAIProvider,
  setWorkspaiCustomAIConfig,
  setWorkspaiPreferredModel,
  setWorkspaiThemeMode,
} from '../core/workspaiSettingsBridge.js';

describe('workspaiSettingsBridge', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockInspect.mockReset();
    mockExecuteCommand.mockReset();
    mockResetModelSelectionCache.mockReset();
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'preferredModel') {
        return 'auto';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 45_000;
      }
      if (key === 'aiProvider') {
        return 'vscode-lm';
      }
      if (key === 'customAIBaseUrl' || key === 'customAIModel') {
        return '';
      }
      if (key === 'themeMode') {
        return 'auto';
      }
      return defaultValue;
    });
    mockUpdate.mockResolvedValue(undefined);
    mockExecuteCommand.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads preferred model and stream timeout from VS Code settings', () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'preferredModel') {
        return 'gpt-5.2';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 60_000;
      }
      if (key === 'aiProvider') {
        return 'openai-compatible';
      }
      if (key === 'customAIBaseUrl') {
        return 'https://api.example.test/v1';
      }
      if (key === 'customAIModel') {
        return 'enterprise-model';
      }
      if (key === 'themeMode') {
        return 'dark';
      }
      return defaultValue;
    });

    expect(readWorkspaiSettings()).toEqual({
      preferredModel: 'gpt-5.2',
      aiStreamTimeoutMs: 60_000,
      aiProvider: 'openai-compatible',
      customAIBaseUrl: 'https://api.example.test/v1',
      customAIModel: 'enterprise-model',
      themeMode: 'dark',
    });
  });

  it('persists theme mode to VS Code settings', async () => {
    await expect(setWorkspaiThemeMode('light')).resolves.toBe('light');

    expect(mockUpdate).toHaveBeenCalledWith('themeMode', 'light', 1);
  });

  it('normalizes invalid theme mode values to auto', async () => {
    await expect(setWorkspaiThemeMode('invalid')).resolves.toBe('auto');

    expect(mockUpdate).toHaveBeenCalledWith('themeMode', 'auto', 1);
  });

  it('persists preferred model and clears model selection cache', async () => {
    await expect(setWorkspaiPreferredModel('claude-sonnet-4-6')).resolves.toBe('claude-sonnet-4-6');

    expect(mockUpdate).toHaveBeenCalledWith('preferredModel', 'claude-sonnet-4-6', 1);
    expect(mockResetModelSelectionCache).toHaveBeenCalledTimes(1);
  });

  it('persists custom AI provider settings', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'aiProvider') {
        return 'openai-compatible';
      }
      return defaultValue;
    });
    await setWorkspaiAIProvider('openai-compatible');
    await setWorkspaiCustomAIConfig({
      baseUrl: ' https://api.example.test/v1 ',
      model: ' enterprise-model ',
    });

    expect(mockUpdate).toHaveBeenCalledWith('aiProvider', 'openai-compatible', 1);
    expect(mockUpdate).toHaveBeenCalledWith(
      'aiProviderProfiles',
      {
        'openai-compatible': {
          baseUrl: 'https://api.example.test/v1',
          model: 'enterprise-model',
        },
      },
      1
    );
    expect(mockUpdate).toHaveBeenCalledWith('customAIBaseUrl', 'https://api.example.test/v1', 1);
    expect(mockUpdate).toHaveBeenCalledWith('customAIModel', 'enterprise-model', 1);
  });

  it('accepts catalog providers and resolves their safe defaults', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'aiProvider') {
        return 'gemini';
      }
      return defaultValue;
    });

    expect(readWorkspaiSettings()).toMatchObject({
      aiProvider: 'gemini',
      customAIBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      customAIModel: 'gemini-3.6-flash',
    });

    await setWorkspaiAIProvider('kimi');
    expect(mockUpdate).toHaveBeenCalledWith('aiProvider', 'kimi', 1);
  });

  it('opens filtered Workspai extension settings', async () => {
    await openWorkspaiExtensionSettings();

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:rapidkit.rapidkit-vscode workspai'
    );
  });
  it('binds saves to their explicit provider even after selection changes', async () => {
    await setWorkspaiCustomAIConfig({
      provider: 'ollama',
      baseUrl: 'http://[::1]:11434/v1',
      model: 'local-model',
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      'aiProviderProfiles',
      {
        ollama: { baseUrl: 'http://[::1]:11434/v1', model: 'local-model' },
      },
      1
    );
  });

  it.each([
    'http://remote.example.test/v1',
    'https://example.test/v1?key=fixture',
    'https://example.test/v1#fragment',
  ])('rejects invalid endpoints before writing settings: %s', async (baseUrl) => {
    await expect(
      setWorkspaiCustomAIConfig({ provider: 'openai-compatible', baseUrl, model: 'model' })
    ).rejects.toThrow(/Base URL|localhost/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps official provider credentials on the catalog endpoint', async () => {
    const previous = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((key, fallback) =>
      key === 'aiProvider'
        ? 'gemini'
        : key === 'aiProviderProfiles'
          ? {
              gemini: { baseUrl: 'https://unrelated.example.test/v1', model: 'chosen-model' },
            }
          : previous(key, fallback)
    );
    expect(readWorkspaiSettings().customAIBaseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai'
    );
    await setWorkspaiCustomAIConfig({
      provider: 'gemini',
      baseUrl: 'https://unrelated.example.test',
      model: 'chosen-model',
    });
    expect(mockUpdate.mock.calls[0][1].gemini.baseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai'
    );
  });

  it('updates the effective workspace setting instead of an overridden global value', async () => {
    mockInspect.mockImplementation((key) =>
      key === 'aiProvider' ? { workspaceValue: 'vscode-lm' } : undefined
    );
    await setWorkspaiAIProvider('ollama');
    expect(mockUpdate).toHaveBeenCalledWith('aiProvider', 'ollama', 2);
  });
});
