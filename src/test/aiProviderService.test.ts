import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockRedactAIMessageRuntimePaths, mockRequestAIModelToolAction } = vi.hoisted(
  () => ({
    mockGet: vi.fn(),
    mockRedactAIMessageRuntimePaths: vi.fn((messages: unknown[]) => messages),
    mockRequestAIModelToolAction: vi.fn(),
  })
);

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
  redactAIMessageRuntimePaths: mockRedactAIMessageRuntimePaths,
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
    mockRedactAIMessageRuntimePaths.mockImplementation((messages: unknown[]) => messages);
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
      callId: 'vscode-call-1',
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
        [
          { role: 'user', content: 'Repair readiness' },
          {
            role: 'assistant',
            toolCall: {
              callId: 'prior-call',
              name: 'inspect-remediation-plan',
              input: {},
            },
          },
          {
            role: 'tool',
            toolResult: {
              callId: 'prior-call',
              name: 'inspect-remediation-plan',
              content: '{"ok":true}',
            },
          },
        ],
        [{ name: 'verify-blocker', description: 'Verify', inputSchema: { type: 'object' } }],
        undefined,
        'copilotcli/auto'
      )
    ).resolves.toEqual({
      type: 'tool',
      provider: 'vscode-lm',
      callId: 'vscode-call-1',
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
        [
          { role: 'user', content: 'Repair readiness' },
          {
            role: 'assistant',
            toolCall: {
              callId: 'prior-call',
              name: 'inspect-remediation-plan',
              input: {},
            },
          },
          {
            role: 'tool',
            toolResult: {
              callId: 'prior-call',
              name: 'inspect-remediation-plan',
              content: '{"ok":true}',
            },
          },
        ],
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
      callId: 'call-1',
      toolName: 'inspect-remediation-plan',
      input: {},
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.tool_choice).toBe('required');
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          tool_calls: [
            expect.objectContaining({
              id: 'prior-call',
              function: expect.objectContaining({ name: 'inspect-remediation-plan' }),
            }),
          ],
        }),
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'prior-call',
          content: '{"ok":true}',
        }),
      ])
    );
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
      label: 'Custom OpenAI-compatible API',
      model: 'enterprise-model',
    });
  });

  it('uses the official Gemini OpenAI-compatible endpoint and provider-scoped secret', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'aiProvider') {
        return 'gemini';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 45_000;
      }
      return defaultValue;
    });
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'gemini-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'gemini-response' } }],
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      askConfiguredAIProvider(context, [{ role: 'user', content: 'hello' }])
    ).resolves.toEqual({
      provider: 'gemini',
      text: 'gemini-response',
    });
    expect(context.secrets.store).toHaveBeenCalledWith(
      'workspai.aiProvider.apiKey.gemini',
      'gemini-key'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer gemini-key' }),
      })
    );
  });

  it('supports local Ollama without requiring an API key', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'aiProvider') {
        return 'ollama';
      }
      return defaultValue;
    });
    const context = createMockContext();

    await expect(getAIProviderStatus(context)).resolves.toMatchObject({
      provider: 'ollama',
      ready: true,
      hasApiKey: false,
      requiresApiKey: false,
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('uses Anthropic Messages tool calling for Claude', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'aiProvider') {
        return 'anthropic';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 45_000;
      }
      return defaultValue;
    });
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'anthropic-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'verify-blocker',
              input: { strict: true },
            },
          ],
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      askConfiguredAIProviderForToolAction(
        context,
        [
          { role: 'user', content: 'Verify readiness' },
          {
            role: 'assistant',
            toolCall: {
              callId: 'prior-anthropic-call',
              name: 'verify-blocker',
              input: {},
            },
          },
          {
            role: 'tool',
            toolResult: {
              callId: 'prior-anthropic-call',
              name: 'verify-blocker',
              content: '{"ok":false}',
            },
          },
        ],
        [{ name: 'verify-blocker', description: 'Verify the blocker' }]
      )
    ).resolves.toEqual({
      type: 'tool',
      provider: 'anthropic',
      callId: 'tool-1',
      toolName: 'verify-blocker',
      input: { strict: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'anthropic-key',
        }),
      })
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.tool_choice).toEqual({ type: 'any' });
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: [
            expect.objectContaining({
              type: 'tool_use',
              id: 'prior-anthropic-call',
              name: 'verify-blocker',
            }),
          ],
        }),
        expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({
              type: 'tool_result',
              tool_use_id: 'prior-anthropic-call',
            }),
          ],
        }),
      ])
    );
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
