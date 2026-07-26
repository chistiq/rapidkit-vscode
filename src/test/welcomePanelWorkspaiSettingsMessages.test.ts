import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenExternal, mockParse, mockGetAIProviderStatus, mockReadSettings } = vi.hoisted(
  () => ({
    mockOpenExternal: vi.fn(),
    mockParse: vi.fn((value: string) => ({ value })),
    mockGetAIProviderStatus: vi.fn(),
    mockReadSettings: vi.fn(),
  })
);

vi.mock('vscode', () => ({
  env: {
    openExternal: mockOpenExternal,
  },
  Uri: {
    parse: mockParse,
  },
}));

vi.mock('../core/aiProviderService.js', () => ({
  clearCustomAIAPIKey: vi.fn(),
  getAIProviderStatus: mockGetAIProviderStatus,
  runConfiguredAIProviderHealthCheck: vi.fn(),
  setCustomAIAPIKey: vi.fn(),
}));

vi.mock('../core/workspaiSettingsBridge.js', () => ({
  openWorkspaiExtensionSettings: vi.fn(),
  readWorkspaiSettings: mockReadSettings,
  setWorkspaiAIProvider: vi.fn(),
  setWorkspaiCustomAIConfig: vi.fn(),
  setWorkspaiPreferredModel: vi.fn(),
  setWorkspaiThemeMode: vi.fn(),
}));

vi.mock('../core/aiService.js', () => ({
  listAvailableModels: vi.fn(async () => []),
}));

import {
  buildWorkspaiSettingsPayload,
  tryDispatchWorkspaiSettingsWebviewMessage,
} from '../ui/panels/welcomePanelWorkspaiSettingsMessages.js';

describe('welcomePanel Workspai provider settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenExternal.mockResolvedValue(true);
    mockReadSettings.mockReturnValue({
      preferredModel: 'auto',
      aiStreamTimeoutMs: 45_000,
      aiProvider: 'gemini',
      customAIBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      customAIModel: 'gemini-3.6-flash',
      themeMode: 'auto',
    });
    mockGetAIProviderStatus.mockResolvedValue({
      provider: 'gemini',
      protocol: 'openai-compatible',
      ready: false,
      label: 'Google Gemini',
      requiresApiKey: true,
      reason: 'API key is missing',
    });
  });

  it('opens only the catalog-owned official setup URL', async () => {
    const host = {
      context: {} as never,
      postWebviewMessage: vi.fn(),
      sendWorkspaiSettings: vi.fn(),
    };

    await expect(
      tryDispatchWorkspaiSettingsWebviewMessage(host, 'openAIProviderLink', {
        provider: 'gemini',
        destination: 'docs',
        url: 'https://malicious.example.test/',
      })
    ).resolves.toBe(true);

    expect(mockParse).toHaveBeenCalledWith('https://ai.google.dev/gemini-api/docs/openai');
    expect(mockOpenExternal).toHaveBeenCalledWith({
      value: 'https://ai.google.dev/gemini-api/docs/openai',
    });
  });

  it('includes the canonical provider catalog in the settings payload', async () => {
    const payload = await buildWorkspaiSettingsPayload({} as never);

    expect(payload.aiProviderCatalog.map((provider) => provider.id)).toContain('kimi');
    expect(payload.aiProviderCatalog.map((provider) => provider.id)).toContain('anthropic');
    expect(payload.aiProviderCatalog.map((provider) => provider.id)).toContain('ollama');
    expect(payload.aiProviderStatus).toMatchObject({
      provider: 'gemini',
      reason: 'API key is missing',
    });
  });
});
