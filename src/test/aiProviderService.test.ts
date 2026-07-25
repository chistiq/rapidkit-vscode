import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockRequestAIModelToolAction } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockRequestAIModelToolAction: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockGet,
    }),
  },
  lm: {
    selectChatModels: vi.fn(),
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      hide: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 'user', content }),
    Assistant: (content: string) => ({ role: 'assistant', content }),
  },
}));

vi.mock('../core/aiService.js', () => ({
  askAI: vi.fn(async () => 'vscode-lm-response'),
  requestAIModelToolAction: mockRequestAIModelToolAction,
}));

import {
  askConfiguredAIProvider,
  askConfiguredAIProviderForToolAction,
  clearCustomAIAPIKey,
  getAIProviderStatus,
  runConfiguredAIProviderHealthCheck,
  setCustomAIAPIKey,
} from '../core/aiProviderService.js';

function createMockContext() {
  const secrets = new Map<string, string>();
  return {
    secrets: {
      get: vi.fn(async (key: string) => secrets.get(key)),
      store: vi.fn(async (key: string, value: string) => {
        secrets.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        secrets.delete(key);
      }),
    },
  } as any;
}

describe('aiProviderService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'aiProvider') {
        return 'openai-compatible';
      }
      if (key === 'customAIBaseUrl') {
        return 'https://api.example.test/v1';
      }
      if (key === 'customAIModel') {
        return 'enterprise-model';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 45_000;
      }
      if (key === 'preferredModel') {
        return 'auto';
      }
      return defaultValue;
    });
    mockRequestAIModelToolAction.mockResolvedValue({
      type: 'tool',
      modelId: 'copilotcli/auto',
      toolName: 'verify-blocker',
      input: {},
    });
  });

  it('reports custom provider readiness from settings and Secret Storage', async () => {
    const context = createMockContext();

    await expect(getAIProviderStatus(context)).resolves.toMatchObject({
      provider: 'openai-compatible',
      ready: false,
      hasApiKey: false,
    });

    await setCustomAIAPIKey(context, 'sk-test');

    await expect(getAIProviderStatus(context)).resolves.toMatchObject({
      provider: 'openai-compatible',
      ready: true,
      hasApiKey: true,
      model: 'enterprise-model',
    });

    await clearCustomAIAPIKey(context);

    await expect(getAIProviderStatus(context)).resolves.toMatchObject({
      ready: false,
      hasApiKey: false,
    });
  });

  it('sends OpenAI-compatible chat completion requests through the configured provider', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'sk-test');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'provider-response' } }],
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const onTextChunk = vi.fn();
    await expect(
      askConfiguredAIProvider(context, [{ role: 'user', content: 'hello' }], undefined, onTextChunk)
    ).resolves.toEqual({
      provider: 'openai-compatible',
      text: 'provider-response',
    });
    expect(onTextChunk).toHaveBeenCalledWith('provider-response');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer sk-test',
        }),
      })
    );
  });

  it('preserves native VS Code LM tool actions for Studio Agent', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) =>
      key === 'aiProvider' ? 'vscode-lm' : defaultValue
    );
    const context = createMockContext();
    await expect(
      askConfiguredAIProviderForToolAction(
        context,
        [{ role: 'user', content: 'Repair readiness' }],
        [{ name: 'verify-blocker', description: 'Verify', inputSchema: { type: 'object' } }],
        undefined,
        'copilotcli/auto'
      )
    ).resolves.toEqual({
      type: 'tool',
      provider: 'vscode-lm',
      toolName: 'verify-blocker',
      input: {},
    });
  });

  it('uses OpenAI-compatible function tools with required selection', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'sk-test');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'inspect-remediation-plan', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      askConfiguredAIProviderForToolAction(
        context,
        [{ role: 'user', content: 'Repair readiness' }],
        [
          {
            name: 'inspect-remediation-plan',
            description: 'Inspect',
            inputSchema: { type: 'object' },
          },
        ]
      )
    ).resolves.toEqual({
      type: 'tool',
      provider: 'openai-compatible',
      toolName: 'inspect-remediation-plan',
      input: {},
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.tool_choice).toBe('required');
    expect(body.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: 'inspect-remediation-plan' }),
        }),
      ])
    );
  });

  it('runs a live health check against the configured provider', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'sk-test');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
      }))
    );

    await expect(runConfiguredAIProviderHealthCheck(context)).resolves.toMatchObject({
      provider: 'openai-compatible',
      ok: true,
      label: 'OpenAI-compatible API',
      model: 'enterprise-model',
    });
  });

  it('returns setup failures without making network requests', async () => {
    const context = createMockContext();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runConfiguredAIProviderHealthCheck(context)).resolves.toMatchObject({
      provider: 'openai-compatible',
      ok: false,
      reason: expect.stringContaining('API key is missing'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts provider secrets from health check failures', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'sk-secret-value');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'Bearer sk-secret-value rejected',
      }))
    );

    const result = await runConfiguredAIProviderHealthCheck(context);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Bearer [redacted]');
    expect(result.reason).not.toContain('sk-secret-value');
  });
});
