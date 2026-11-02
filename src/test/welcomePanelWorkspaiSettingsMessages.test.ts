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
  setCustomAIAPIKey,
  runConfiguredAIProviderHealthCheck,
} from '../core/aiProviderService.js';
import { listAvailableModels } from '../core/aiService.js';

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
  it('binds API key writes to the submitted provider and acknowledges without echoing credentials', async () => {
    const host = {
      context: {} as never,
      postWebviewMessage: vi.fn(),
      sendWorkspaiSettings: vi.fn(),
    };
    await tryDispatchWorkspaiSettingsWebviewMessage(host, 'setCustomAIAPIKey', {
      provider: 'openai',
      requestId: 'save-1',
      apiKey: 'fixture-key',
    });
    expect(setCustomAIAPIKey).toHaveBeenCalledWith(host.context, 'fixture-key', 'openai');
    expect(host.postWebviewMessage).toHaveBeenCalledWith(
      'aiProviderSettingsResult',
      expect.objectContaining({ provider: 'openai', requestId: 'save-1', ok: true })
    );
    expect(JSON.stringify(host.postWebviewMessage.mock.calls)).not.toContain('fixture-key');
  });

  it('reports storage failures safely and keeps later provider operations usable', async () => {
    vi.mocked(setCustomAIAPIKey).mockRejectedValueOnce(new Error('fixture-secret-must-not-appear'));
    const host = {
      context: {} as never,
      postWebviewMessage: vi.fn(),
      sendWorkspaiSettings: vi.fn(),
    };
    await tryDispatchWorkspaiSettingsWebviewMessage(host, 'setCustomAIAPIKey', {
      provider: 'gemini',
      requestId: 'failed',
      apiKey: 'fixture-key',
    });
    expect(host.postWebviewMessage).toHaveBeenLastCalledWith(
      'aiProviderSettingsResult',
      expect.objectContaining({ requestId: 'failed', ok: false })
    );
    expect(JSON.stringify(host.postWebviewMessage.mock.calls)).not.toContain('fixture-secret');
    await tryDispatchWorkspaiSettingsWebviewMessage(host, 'clearCustomAIAPIKey', {
      provider: 'gemini',
      requestId: 'next',
    });
    expect(host.postWebviewMessage).toHaveBeenLastCalledWith(
      'aiProviderSettingsResult',
      expect.objectContaining({ requestId: 'next', ok: true })
    );
  });

  it('serializes writes before the following test and correlates the result', async () => {
    let release!: () => void;
    vi.mocked(setCustomAIAPIKey).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    vi.mocked(runConfiguredAIProviderHealthCheck).mockResolvedValueOnce({
      provider: 'gemini',
      ok: true,
      label: 'Gemini',
    });
    const host = {
      context: {} as never,
      postWebviewMessage: vi.fn(),
      sendWorkspaiSettings: vi.fn(),
    };
    const save = tryDispatchWorkspaiSettingsWebviewMessage(host, 'setCustomAIAPIKey', {
      provider: 'gemini',
      requestId: 'save',
      apiKey: 'fixture',
    });
    const test = tryDispatchWorkspaiSettingsWebviewMessage(host, 'testAIProvider', {
      provider: 'gemini',
      requestId: 'test',
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(runConfiguredAIProviderHealthCheck).not.toHaveBeenCalled();
    release();
    await Promise.all([save, test]);
    expect(host.postWebviewMessage).toHaveBeenLastCalledWith(
      'aiProviderSettingsResult',
      expect.objectContaining({
        requestId: 'test',
        healthCheck: expect.objectContaining({ provider: 'gemini', ok: true }),
      })
    );
  });

  it('does not label an empty VS Code model catalog as ready', async () => {
    mockReadSettings.mockReturnValue({ aiProvider: 'vscode-lm', preferredModel: 'auto' });
    mockGetAIProviderStatus.mockResolvedValue({
      provider: 'vscode-lm',
      ready: true,
      label: 'VS Code',
    });
    vi.mocked(listAvailableModels).mockResolvedValueOnce([]);
    const payload = await buildWorkspaiSettingsPayload({} as never);
    expect(payload.aiProviderStatus).toMatchObject({
      ready: false,
      reason: expect.stringContaining('No available'),
    });
  });
  it('does not block API-provider settings on unrelated VS Code model discovery', async () => {
    vi.mocked(listAvailableModels).mockImplementationOnce(() => new Promise(() => {}));
    const payload = await buildWorkspaiSettingsPayload({} as never);
    expect(payload.aiProvider).toBe('gemini');
    expect(listAvailableModels).not.toHaveBeenCalled();
    vi.mocked(listAvailableModels).mockReset();
    vi.mocked(listAvailableModels).mockResolvedValue([]);
  });
  it('rejects a test of stale form values before sending a model request', async () => {
    const host = {
      context: {} as never,
      postWebviewMessage: vi.fn(),
      sendWorkspaiSettings: vi.fn(),
    };
    await tryDispatchWorkspaiSettingsWebviewMessage(host, 'testAIProvider', {
      provider: 'gemini',
      requestId: 'stale-form',
      model: 'outdated-model',
    });
    expect(runConfiguredAIProviderHealthCheck).not.toHaveBeenCalled();
    expect(host.postWebviewMessage).toHaveBeenLastCalledWith(
      'aiProviderSettingsResult',
      expect.objectContaining({
        requestId: 'stale-form',
        ok: false,
        message: expect.stringContaining('configuration changed'),
      })
    );
  });
});
