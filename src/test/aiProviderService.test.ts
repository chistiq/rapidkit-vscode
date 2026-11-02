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
  it('uses the configured LM model when no per-turn picker override was supplied', async () => {
    mockGet.mockImplementation((key: string, fallback: unknown) =>
      key === 'aiProvider' ? 'vscode-lm' : key === 'preferredModel' ? 'copilot/auto' : fallback
    );
    mockRequestAIModelToolAction.mockResolvedValue({
      type: 'text',
      text: 'Hi',
      modelId: 'copilot/auto',
      attempts: 1,
    });
    const action = await askConfiguredAIProviderForToolAction(
      createMockContext(),
      [{ role: 'user', content: 'Hi' }],
      []
    );
    expect(mockRequestAIModelToolAction).toHaveBeenLastCalledWith(
      expect.any(Array),
      [],
      undefined,
      'copilot/auto'
    );
    expect(action).toMatchObject({
      requestedModelId: 'copilot/auto',
      modelId: 'copilot/auto',
      fallback: false,
    });
  });
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

  it.each([
    ['openai-compatible', 'tool'],
    ['anthropic', 'tool'],
    ['openai-compatible', 'user'],
    ['anthropic', 'user'],
  ] as const)('sends %s %s images with the native multimodal format', async (provider, source) => {
    const previous = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((key: string, fallback: unknown) =>
      key === 'aiProvider' ? provider : previous(key, fallback)
    );
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'image-test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify(
          provider === 'anthropic'
            ? { content: [{ type: 'text', text: 'The screenshot contains a button.' }] }
            : { choices: [{ message: { content: 'The screenshot contains a button.' } }] }
        ),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await askConfiguredAIProviderForToolAction(
      context,
      source === 'user'
        ? [
            {
              role: 'user',
              content: 'Inspect this image.',
              images: [{ mimeType: 'image/png', base64: 'iVBORw==' }],
            },
          ]
        : [
            {
              role: 'assistant',
              toolCall: {
                callId: 'screenshot',
                name: 'invoke-host-tool',
                input: { name: 'screenshot' },
              },
            },
            {
              role: 'tool',
              toolResult: {
                callId: 'screenshot',
                name: 'invoke-host-tool',
                content: 'Screenshot captured.',
                images: [{ mimeType: 'image/png', base64: 'iVBORw==' }],
              },
            },
          ],
      [{ name: 'workspai-complete', description: 'Answer', inputSchema: { type: 'object' } }]
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    if (provider === 'anthropic')
      expect(
        source === 'user' ? body.messages[0].content : body.messages[1].content[0].content
      ).toContainEqual({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'iVBORw==' },
      });
    else
      expect(
        source === 'user' ? body.messages[0].content : body.messages[2].content
      ).toContainEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw==' },
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
      modelId: 'copilotcli/auto',
      requestedModelId: 'copilotcli/auto',
      fallback: false,
      attempts: 1,
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      tokenUsageSource: 'estimated',
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
      modelId: 'enterprise-model',
      fallback: false,
      attempts: 1,
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      tokenUsageSource: 'estimated',
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

  it('retries transient OpenAI-compatible failures with bounded backoff', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'sk-test');
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return {
          ok: false,
          status: 503,
          text: async () => JSON.stringify({ error: { message: 'temporarily unavailable' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            usage: { prompt_tokens: 120, completion_tokens: 18 },
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: 'call-retried',
                      function: { name: 'verify-blocker', arguments: '{}' },
                    },
                  ],
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      askConfiguredAIProviderForToolAction(
        context,
        [{ role: 'user', content: 'Verify after a transient outage' }],
        [{ name: 'verify-blocker', description: 'Verify' }]
      )
    ).resolves.toMatchObject({
      type: 'tool',
      toolName: 'verify-blocker',
      attempts: 3,
      fallback: false,
      inputTokens: 120,
      outputTokens: 18,
      tokenUsageSource: 'provider',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports the actual fallback model selected by VS Code LM', async () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) =>
      key === 'aiProvider' ? 'vscode-lm' : defaultValue
    );
    mockRequestAIModelToolAction.mockResolvedValueOnce({
      type: 'tool',
      modelId: 'copilot/fallback',
      attempts: 2,
      callId: 'fallback-call',
      toolName: 'verify-blocker',
      input: {},
    });

    await expect(
      askConfiguredAIProviderForToolAction(
        createMockContext(),
        [{ role: 'user', content: 'Verify' }],
        [{ name: 'verify-blocker', description: 'Verify' }],
        undefined,
        'copilot/preferred'
      )
    ).resolves.toMatchObject({
      provider: 'vscode-lm',
      modelId: 'copilot/fallback',
      requestedModelId: 'copilot/preferred',
      fallback: true,
      attempts: 2,
    });
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

  it.each(['openai-compatible', 'anthropic'])(
    'keeps the same %s model and all tool schemas when native tools are unsupported',
    async (provider) => {
      const defaults: Record<string, unknown> = {
        aiProvider: provider,
        aiProviderProfiles: {
          [provider]: { model: 'json-only-model', baseUrl: 'https://api.example.test/v1' },
        },
        aiStreamTimeoutMs: 45000,
      };
      mockGet.mockImplementation((key: string, fallback: unknown) => defaults[key] ?? fallback);
      const context = createMockContext();
      await setCustomAIAPIKey(context, 'test-key');
      const requests: Array<Record<string, any>> = [];
      const fetchMock = vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        requests.push(body);
        if (requests.length === 1)
          return {
            ok: false,
            status: 400,
            text: async () =>
              JSON.stringify({ error: 'This model does not support tools or tool_choice' }),
          };
        const text = JSON.stringify({ toolName: 'inspect-source', input: { paths: ['file.rs'] } });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              provider === 'anthropic'
                ? { content: [{ type: 'text', text }] }
                : { choices: [{ message: { content: text } }] }
            ),
        };
      });
      vi.stubGlobal('fetch', fetchMock);
      const tools = [
        { name: 'inspect-source', description: 'Read source', inputSchema: { type: 'object' } },
        { name: 'run-workspace-command', description: 'Run an approved command' },
      ];
      const messages = [
        { role: 'user' as const, content: 'Read file.rs' },
        {
          role: 'assistant' as const,
          toolCall: { callId: 'old', name: 'inspect-source', input: {} },
        },
        {
          role: 'tool' as const,
          toolResult: { callId: 'old', name: 'inspect-source', content: 'previous observation' },
        },
      ];
      const first = await askConfiguredAIProviderForToolAction(context, messages, tools);
      expect(first).toMatchObject({
        type: 'tool',
        toolName: 'inspect-source',
        input: { paths: ['file.rs'] },
        modelId: 'json-only-model',
        fallback: false,
        toolTransport: 'json',
        attempts: 2,
      });
      const second = await askConfiguredAIProviderForToolAction(context, messages, tools);
      expect(second).toMatchObject({ attempts: 1, toolTransport: 'json' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(requests[0].tools).toHaveLength(2);
      expect(requests[1].tools).toBeUndefined();
      expect(requests[1].tool_choice).toBeUndefined();
      expect(JSON.stringify(requests[1].messages)).toContain('run-workspace-command');
      expect(JSON.stringify(requests[1].messages)).toContain('previous observation');
      expect(JSON.stringify(requests[1].messages)).not.toContain('"role":"tool"');
    }
  );

  it('does not retry tools through another transport after an authorization failure or cancellation', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'test-key');
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => 'tools are not permitted',
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      askConfiguredAIProviderForToolAction(
        context,
        [{ role: 'user', content: 'inspect' }],
        [{ name: 'inspect-source', description: 'Inspect' }]
      )
    ).rejects.toThrow('403');
    expect(fetchMock).toHaveBeenCalledOnce();
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: () => ({ dispose() {} }),
    };
    await expect(
      askConfiguredAIProviderForToolAction(
        context,
        [],
        [{ name: 'inspect-source', description: 'Inspect' }],
        token
      )
    ).rejects.toThrow('cancelled');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['openai-compatible', 'anthropic'])(
    'reports the tool deadline accurately for %s',
    async (provider) => {
      vi.useFakeTimers();
      try {
        mockGet.mockImplementation(
          (key: string, fallback: unknown) =>
            (
              ({
                aiProvider: provider,
                customAIBaseUrl: 'https://api.example.test/v1',
                customAIModel: 'enterprise-model',
                aiToolRequestTimeoutMs: 8000,
              }) as Record<string, unknown>
            )[key] ?? fallback
        );
        const context = createMockContext();
        await setCustomAIAPIKey(context, 'fixture-key');
        const fetchMock = vi.fn(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener(
                'abort',
                () => reject(new Error('network request aborted')),
                { once: true }
              );
            })
        );
        vi.stubGlobal('fetch', fetchMock);
        const pending = askConfiguredAIProviderForToolAction(
          context,
          [],
          [{ name: 'inspect-source', description: 'Read' }]
        ).catch((error) => error);
        await vi.advanceTimersByTimeAsync(8000);
        const error = await pending;
        expect(error.message).toContain('AI model request timed out after 8000ms');
        expect(error.message).not.toContain('network request aborted');
        expect(fetchMock).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    }
  );

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
      modelId: 'claude-sonnet-4-6',
      fallback: false,
      attempts: 1,
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      tokenUsageSource: 'estimated',
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
  it('stores and clears only the provider named by the settings request', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'provider-a-key', 'openai');
    await setCustomAIAPIKey(context, 'provider-b-key', 'gemini');
    await clearCustomAIAPIKey(context, 'openai');
    expect(await context.secrets.get('workspai.aiProvider.apiKey.openai')).toBeUndefined();
    expect(await context.secrets.get('workspai.aiProvider.apiKey.gemini')).toBe('provider-b-key');
    await expect(setCustomAIAPIKey(context, 'fixture', 'unknown-provider')).rejects.toThrow(
      'Unknown AI provider'
    );
  });

  it('keeps health-check credentials, endpoint and model on the captured provider when selection changes mid-read', async () => {
    let provider = 'openai-compatible';
    const previous = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((key, fallback) =>
      key === 'aiProvider' ? provider : previous(key, fallback)
    );
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'original-key', 'openai-compatible');
    await setCustomAIAPIKey(context, 'other-key', 'gemini');
    const originalGet = context.secrets.get.getMockImplementation()!;
    context.secrets.get.mockImplementation(async (key: string) => {
      provider = 'gemini';
      return originalGet(key);
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await runConfiguredAIProviderHealthCheck(context)).toMatchObject({
      provider: 'openai-compatible',
      model: 'enterprise-model',
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/chat/completions',
      expect.objectContaining({
        redirect: 'error',
        headers: expect.objectContaining({ authorization: 'Bearer original-key' }),
      })
    );
  });

  it('redacts an echoed key even when it has no recognizable vendor prefix', async () => {
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'private-fixture-value');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Rejected private-fixture-value' } }),
      }))
    );
    const result = await runConfiguredAIProviderHealthCheck(context);
    expect(result.ok).toBe(false);
    expect(result.reason).not.toContain('private-fixture-value');
    expect(result.reason).toContain('redacted');
  });

  it('rejects URL credentials and query tokens before making an authenticated request', async () => {
    const previous = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((key, fallback) =>
      key === 'customAIBaseUrl'
        ? 'https://example.test/v1?api_key=fixture'
        : previous(key, fallback)
    );
    const context = createMockContext();
    await setCustomAIAPIKey(context, 'fixture');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await runConfiguredAIProviderHealthCheck(context);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('query parameters'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
