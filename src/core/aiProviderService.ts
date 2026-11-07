import { AIModelRequestTimeoutError, getAIToolRequestTimeoutMs } from './aiRequestTimeout.js';
import { readAIProviderResponse, type AIProviderStreamObserver } from './aiProviderStream.js';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';

/** Explicit semantic-search configuration; never infer an embedding model from a chat model. */
export async function configuredStudioEmbeddingProvider(
  context: vscode.ExtensionContext
): Promise<import('./studioSemanticIndex.js').StudioEmbeddingProvider> {
  const configuration = vscode.workspace.getConfiguration('workspai');
  const explicit =
    typeof configuration.inspect === 'function'
      ? configuration.inspect<boolean>('semanticSearch.enabled')
      : undefined;
  if (
    !configuration.get('semanticSearch.enabled', false) ||
    (explicit && explicit.globalValue !== true)
  ) {
    throw new Error(
      'Semantic search is disabled. Enable workspai.semanticSearch.enabled and configure an embedding model; ordinary source search remains available.'
    );
  }
  for (const key of [
    'semanticSearch.enabled',
    'semanticSearch.provider',
    'semanticSearch.model',
    'semanticSearch.localBaseUrl',
  ]) {
    const setting =
      typeof configuration.inspect === 'function' ? configuration.inspect(key) : undefined;
    if (setting?.workspaceValue !== undefined || setting?.workspaceFolderValue !== undefined) {
      throw new Error(
        'Configure semantic search in User Settings. Repository settings cannot enable or redirect source embeddings.'
      );
    }
  }
  const model = configuration.get<string>('semanticSearch.model', '').trim();
  if (!model || model.length > 200) {
    throw new Error('Set workspai.semanticSearch.model to an actual embedding model.');
  }
  const route = configuration.get<string>('semanticSearch.provider', 'local');
  const settings = readWorkspaiSettings();
  let baseUrl: string, apiKey: string | undefined;
  if (route === 'current-api') {
    for (const key of ['aiProvider', 'customAIBaseUrl', 'aiProviderProfiles']) {
      const setting =
        typeof configuration.inspect === 'function' ? configuration.inspect(key) : undefined;
      if (setting?.workspaceValue !== undefined || setting?.workspaceFolderValue !== undefined) {
        throw new Error(
          'The embedding API route must use provider settings owned by the user, not repository endpoint overrides.'
        );
      }
    }
    const provider = getAIProviderDefinition(settings.aiProvider);
    if (provider.protocol !== 'openai-compatible') {
      throw new Error(
        'The selected chat provider does not expose OpenAI-compatible embeddings. Configure a local embedding endpoint or a compatible API provider.'
      );
    }
    baseUrl = settings.customAIBaseUrl;
    apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
    if (provider.requiresApiKey && !apiKey) {
      throw new Error('The selected API provider needs its saved API key for embeddings.');
    }
  } else if (route === 'local') {
    baseUrl = configuration.get<string>('semanticSearch.localBaseUrl', 'http://127.0.0.1:11434/v1');
    let endpoint: URL;
    try {
      endpoint = new URL(baseUrl);
    } catch {
      throw new Error('Invalid local embedding endpoint.');
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
      throw new Error(
        'The local embedding route requires a loopback endpoint. Remote embeddings use the explicitly configured current API provider.'
      );
    }
  } else {
    throw new Error('Unknown semantic-search provider route.');
  }
  const error = validateAIProviderBaseUrl(baseUrl);
  if (error) {
    throw new Error(error);
  }
  const endpoint = resolveOpenAIChatCompletionsUrl(baseUrl).replace(
    /\/chat\/completions$/i,
    '/embeddings'
  );
  return {
    identity: `${route}|${endpoint}|${model}`,
    async embed(texts, signal) {
      if (
        !texts.length ||
        texts.length > 8 ||
        texts.some((text) => typeof text !== 'string' || !text.trim() || text.length > 6500) ||
        Buffer.byteLength(JSON.stringify(texts)) > 160_000
      ) {
        throw new Error('Embedding batch exceeds its bounded input allowance.');
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
      }
      const timer = setTimeout(abort, 30_000);
      try {
        if (controller.signal.aborted) {
          throw new Error('Embedding request was cancelled.');
        }
        const response = await fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ model, input: texts, encoding_format: 'float' }),
        });
        const raw = await readAIProviderResponse({
          response,
          signal: controller.signal,
          protocol: 'openai-compatible',
        });
        if (!response.ok) {
          throw new Error(
            `Embedding request failed (HTTP ${response.status}); check the endpoint, model and provider configuration.`
          );
        }
        const payload = recordProviderPayload(raw),
          data = payload.data;
        if (!Array.isArray(data) || data.length !== texts.length) {
          throw new Error('Embedding provider returned an incomplete batch.');
        }
        const ordered: number[][] = Array(texts.length);
        for (const item of data) {
          const value = recordProviderValue(item);
          if (
            !Number.isInteger(value.index) ||
            Number(value.index) < 0 ||
            Number(value.index) >= texts.length ||
            ordered[Number(value.index)] ||
            !Array.isArray(value.embedding)
          ) {
            throw new Error('Embedding provider returned invalid or duplicate batch indices.');
          }
          ordered[Number(value.index)] = value.embedding;
        }
        return {
          vectors: ordered,
          inputTokens: finiteTokenCount(recordProviderValue(payload.usage).total_tokens),
        };
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
    },
  };
}
import {
  jsonToolMessages,
  parseJsonToolEnvelope,
  isNativeToolTransportUnsupported,
} from './aiToolTransport.js';

import type { AIMessage, AIMessagePathIdentity } from './aiService';
import {
  askAI,
  redactAIMessageRuntimePaths,
  requestAIModelToolAction,
  streamAIResponse,
} from './aiService';
import {
  getAIProviderDefinition,
  isAIProviderKind,
  type AIProviderKind,
  type AIProviderProtocol,
} from './aiProviderCatalog';
import { readWorkspaiSettings, type WorkspaiSettingsSnapshot } from './workspaiSettingsBridge';
import { AIProviderConfigurationError, validateAIProviderBaseUrl } from './aiProviderConfiguration';

export type { AIProviderKind } from './aiProviderCatalog';

const LEGACY_CUSTOM_AI_SECRET_KEY = 'workspai.customAI.apiKey';
const PROVIDER_SECRET_PREFIX = 'workspai.aiProvider.apiKey';

export interface AIProviderStatus {
  provider: AIProviderKind;
  protocol: AIProviderProtocol;
  ready: boolean;
  label: string;
  reason?: string;
  baseUrl?: string;
  model?: string;
  hasApiKey?: boolean;
  requiresApiKey: boolean;
}

export interface AIProviderHealthCheckResult {
  provider: AIProviderKind;
  ok: boolean;
  label: string;
  latencyMs?: number;
  model?: string;
  reason?: string;
}

export interface ConfiguredAIProviderTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export type ConfiguredAIProviderResolution = {
  provider: AIProviderKind;
  modelId: string;
  requestedModelId?: string;
  fallback: boolean;
  attempts: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenUsageSource?: 'provider' | 'estimated';
  toolTransport?: 'json';
};

export type ConfiguredAIProviderAction =
  | (ConfiguredAIProviderResolution & {
      type: 'tool';
      callId: string;
      toolName: string;
      input: Record<string, unknown>;
    })
  | (ConfiguredAIProviderResolution & { type: 'text'; text: string });

function estimatedTokenCount(value: unknown): number {
  return Math.max(1, Math.ceil(JSON.stringify(value).length / 4));
}

function providerSecretKey(provider: AIProviderKind): string {
  return `${PROVIDER_SECRET_PREFIX}.${provider}`;
}

async function getActiveProviderAPIKey(
  context: vscode.ExtensionContext,
  provider: AIProviderKind
): Promise<string | undefined> {
  const providerKey = await context.secrets.get(providerSecretKey(provider));
  if (providerKey) {
    return providerKey;
  }
  if (provider === 'openai-compatible') {
    return context.secrets.get(LEGACY_CUSTOM_AI_SECRET_KEY);
  }
  return undefined;
}

export async function setCustomAIAPIKey(
  context: vscode.ExtensionContext,
  apiKey: string,
  targetProvider?: string
): Promise<void> {
  if (targetProvider !== undefined && !isAIProviderKind(targetProvider)) {
    throw new AIProviderConfigurationError('Unknown AI provider.');
  }
  const provider = (targetProvider ?? readWorkspaiSettings().aiProvider) as AIProviderKind;
  if (provider === 'vscode-lm') {
    return;
  }
  const key = providerSecretKey(provider);
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await context.secrets.delete(key);
    if (provider === 'openai-compatible') {
      await context.secrets.delete(LEGACY_CUSTOM_AI_SECRET_KEY);
    }
    return;
  }
  await context.secrets.store(key, trimmed);
}

export async function clearCustomAIAPIKey(
  context: vscode.ExtensionContext,
  targetProvider?: string
): Promise<void> {
  if (targetProvider !== undefined && !isAIProviderKind(targetProvider)) {
    throw new AIProviderConfigurationError('Unknown AI provider.');
  }
  const provider = (targetProvider ?? readWorkspaiSettings().aiProvider) as AIProviderKind;
  if (provider === 'vscode-lm') {
    return;
  }
  await context.secrets.delete(providerSecretKey(provider));
  if (provider === 'openai-compatible') {
    await context.secrets.delete(LEGACY_CUSTOM_AI_SECRET_KEY);
  }
}

export async function getAIProviderStatus(
  context: vscode.ExtensionContext,
  settings: WorkspaiSettingsSnapshot = readWorkspaiSettings()
): Promise<AIProviderStatus> {
  const provider = getAIProviderDefinition(settings.aiProvider);
  if (provider.protocol === 'vscode-lm') {
    return {
      provider: provider.id,
      protocol: provider.protocol,
      ready: true,
      label: provider.label,
      model: settings.preferredModel,
      requiresApiKey: false,
    };
  }

  const hasApiKey = Boolean(await getActiveProviderAPIKey(context, provider.id));
  const hasBaseUrl = settings.customAIBaseUrl.length > 0;
  const hasModel = settings.customAIModel.length > 0;
  const urlError = hasBaseUrl ? validateAIProviderBaseUrl(settings.customAIBaseUrl) : null;
  const ready = hasBaseUrl && !urlError && hasModel && (!provider.requiresApiKey || hasApiKey);

  return {
    provider: provider.id,
    protocol: provider.protocol,
    ready,
    label: provider.label,
    baseUrl: settings.customAIBaseUrl || undefined,
    model: settings.customAIModel || undefined,
    hasApiKey,
    requiresApiKey: provider.requiresApiKey,
    reason: ready
      ? undefined
      : [
          !hasBaseUrl ? 'Base URL is missing' : urlError,
          !hasModel ? 'Model is missing' : null,
          provider.requiresApiKey && !hasApiKey ? 'API key is missing' : null,
        ]
          .filter(Boolean)
          .join(', '),
  };
}

function resolveOpenAIChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/(?:v\d+(?:beta)?|openai)$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function resolveAnthropicMessagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/messages$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v\d+(?:beta)?$/i.test(trimmed)) {
    return `${trimmed}/messages`;
  }
  return `${trimmed}/v1/messages`;
}

function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(?:sk|AIza)[-A-Za-z0-9._]+/gi, '[redacted API key]')
    .replace(
      /((?:api[_-]?key|x-api-key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      '$1[redacted]'
    )
    .slice(0, 360);
}

function extractOpenAICompatibleText(payload: unknown): string {
  const data = payload as {
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    output_text?: unknown;
    content?: unknown;
  };
  const first = Array.isArray(data.choices) ? data.choices[0] : undefined;
  const messageContent = first?.message?.content;
  if (typeof messageContent === 'string') {
    return messageContent;
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) =>
        part && typeof part === 'object' && 'text' in part
          ? String((part as { text?: unknown }).text ?? '')
          : ''
      )
      .join('');
  }
  if (typeof first?.text === 'string') {
    return first.text;
  }
  if (typeof data.output_text === 'string') {
    return data.output_text;
  }
  if (typeof data.content === 'string') {
    return data.content;
  }
  return '';
}

function extractAnthropicText(payload: unknown): string {
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((block) =>
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
        ? String((block as { text: string }).text)
        : ''
    )
    .join('');
}

function finiteTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function openAICompatibleTokenUsage(
  payload: unknown
): Pick<ConfiguredAIProviderResolution, 'inputTokens' | 'outputTokens' | 'tokenUsageSource'> {
  const usage =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    (payload as { usage?: unknown }).usage &&
    typeof (payload as { usage?: unknown }).usage === 'object' &&
    !Array.isArray((payload as { usage?: unknown }).usage)
      ? (payload as { usage: Record<string, unknown> }).usage
      : undefined;
  const inputTokens = finiteTokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = finiteTokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  return inputTokens !== undefined || outputTokens !== undefined
    ? {
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        tokenUsageSource: 'provider',
      }
    : {};
}

function anthropicTokenUsage(
  payload: unknown
): Pick<ConfiguredAIProviderResolution, 'inputTokens' | 'outputTokens' | 'tokenUsageSource'> {
  const usage =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    (payload as { usage?: unknown }).usage &&
    typeof (payload as { usage?: unknown }).usage === 'object' &&
    !Array.isArray((payload as { usage?: unknown }).usage)
      ? (payload as { usage: Record<string, unknown> }).usage
      : undefined;
  const inputTokens = finiteTokenCount(usage?.input_tokens);
  const outputTokens = finiteTokenCount(usage?.output_tokens);
  return inputTokens !== undefined || outputTokens !== undefined
    ? {
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        tokenUsageSource: 'provider',
      }
    : {};
}

function parseErrorPayload(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function recordProviderValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function recordProviderPayload(raw: string): Record<string, unknown> {
  return recordProviderValue(parseErrorPayload(raw));
}
function providerToolInput(raw: unknown, encoded: boolean): Record<string, unknown> {
  let input: unknown;
  try {
    input = encoded ? JSON.parse(typeof raw === 'string' && raw.trim() ? raw : '{}') : raw;
  } catch {
    throw new Error(
      'AI provider returned incomplete or invalid tool arguments; no tool was dispatched.'
    );
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('AI provider tool arguments must be an object; no tool was dispatched.');
  }
  return input as Record<string, unknown>;
}
function withDiscardedDecisionUsage(
  current: Pick<
    ConfiguredAIProviderResolution,
    'inputTokens' | 'outputTokens' | 'tokenUsageSource'
  >,
  discarded:
    | {
        inputTokens?: number;
        outputTokens?: number;
        estimatedInput: number;
        estimatedOutput: number;
      }
    | undefined,
  currentEstimate: { inputTokens: number; outputTokens: number }
): typeof current {
  if (!discarded) {
    return current;
  }
  return {
    inputTokens:
      (discarded.inputTokens ?? discarded.estimatedInput) +
      (current.inputTokens ?? currentEstimate.inputTokens),
    outputTokens:
      (discarded.outputTokens ?? discarded.estimatedOutput) +
      (current.outputTokens ?? currentEstimate.outputTokens),
    tokenUsageSource:
      discarded.inputTokens !== undefined &&
      discarded.outputTokens !== undefined &&
      current.inputTokens !== undefined &&
      current.outputTokens !== undefined
        ? 'provider'
        : 'estimated',
  };
}

function providerErrorMessage(label: string, status: number, raw: string, apiKey?: string): string {
  if (apiKey) {
    raw = raw.split(apiKey).join('[redacted]');
  }
  const payload = parseErrorPayload(raw);
  const message =
    payload && typeof payload === 'object' && 'error' in payload
      ? JSON.stringify((payload as { error?: unknown }).error)
      : raw.slice(0, 240);
  return sanitizeProviderError(`${label} returned ${status}: ${message}`);
}

function createRequestLifecycle(
  timeoutMs: number,
  token?: vscode.CancellationToken,
  timeoutSetting = 'workspai.aiStreamTimeoutMs'
): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  if (token?.isCancellationRequested) {
    controller.abort();
  }
  const timeout = setTimeout(
    () => controller.abort(new AIModelRequestTimeoutError(timeoutMs, timeoutSetting)),
    timeoutMs
  );
  const cancellation = token?.onCancellationRequested(() => controller.abort());
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      cancellation?.dispose();
    },
  };
}

const MAX_TRANSIENT_PROVIDER_ATTEMPTS = 3;

function isDefinitiveProviderFailure(status: number, raw: string): boolean {
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /(?:invalid[_ -]?api[_ -]?key|incorrect api key|insufficient[_ -]?quota|billing|payment required|permission denied|forbidden|unsupported model)/i.test(
      raw
    )
  );
}

function isRetryableProviderResponse(status: number, raw: string): boolean {
  if (isDefinitiveProviderFailure(status, raw)) {
    return false;
  }
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableProviderTransportError(error: unknown): boolean {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /(?:fetch failed|network|econnreset|econnrefused|etimedout|socket|temporar(?:y|ily)|unavailable|overloaded)/i.test(
    raw
  );
}

async function waitForProviderRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw signal.reason ?? new Error('AI provider request was cancelled.');
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new Error('AI provider request was cancelled.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function providerRetryDelayMs(response: Response, attempt: number): number {
  const fallback = 200 * 2 ** (attempt - 1);
  const raw = response.headers?.get?.('retry-after')?.trim();
  if (!raw) {
    return fallback;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(5_000, Math.max(fallback, Math.round(seconds * 1_000)));
  }
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.min(5_000, Math.max(fallback, at - Date.now())) : fallback;
}

async function fetchProviderResponseWithRetry(input: {
  url: string;
  init: RequestInit;
  signal: AbortSignal;
  protocol?: 'openai-compatible' | 'anthropic-messages';
  onProgress?: AIProviderStreamObserver;
}): Promise<{ response: Response; raw: string; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TRANSIENT_PROVIDER_ATTEMPTS; attempt += 1) {
    if (input.signal.aborted) {
      throw new Error('AI provider request was cancelled.');
    }
    let retryDelayMs = 200 * 2 ** (attempt - 1);
    try {
      const response = await fetch(input.url, {
        ...input.init,
        redirect: 'error',
        signal: input.signal,
      });
      const raw = input.protocol
        ? await readAIProviderResponse({
            response,
            protocol: input.protocol,
            signal: input.signal,
            onProgress: input.onProgress,
          })
        : await response.text();
      if (
        response.ok ||
        attempt === MAX_TRANSIENT_PROVIDER_ATTEMPTS ||
        !isRetryableProviderResponse(response.status, raw)
      ) {
        return { response, raw, attempts: attempt };
      }
      retryDelayMs = providerRetryDelayMs(response, attempt);
    } catch (error) {
      lastError = error;
      if (input.signal.aborted) {
        throw input.signal.reason ?? error;
      }
      if (!isRetryableProviderTransportError(error)) {
        throw error;
      }
      if (attempt === MAX_TRANSIENT_PROVIDER_ATTEMPTS) {
        throw new Error(
          `AI provider transport failed after ${attempt} bounded attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    await waitForProviderRetry(retryDelayMs, input.signal);
  }
  throw lastError ?? new Error('AI provider request failed after bounded retries.');
}

function createOpenAIHeaders(provider: AIProviderKind, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://www.workspai.com/';
    headers['X-OpenRouter-Title'] = 'Workspai for VS Code';
  }
  return headers;
}

function toOpenAIMessages(messages: AIMessage[]): Array<Record<string, unknown>> {
  return messages.flatMap((message): Array<Record<string, unknown>> => {
    if ('toolCall' in message) {
      return [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: message.toolCall.callId,
              type: 'function',
              function: {
                name: message.toolCall.name,
                arguments: JSON.stringify(message.toolCall.input),
              },
            },
          ],
        },
      ];
    }
    if ('toolResult' in message) {
      const result = {
        role: 'tool',
        tool_call_id: message.toolResult.callId,
        content: message.toolResult.content,
      };
      return message.toolResult.images?.length
        ? [
            result,
            {
              role: 'user',
              content: [
                { type: 'text', text: `Images returned by ${message.toolResult.name}:` },
                ...message.toolResult.images.map((image) => ({
                  type: 'image_url',
                  image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
                })),
              ],
            },
          ]
        : [result];
    }
    return [
      {
        role: message.role,
        content: message.images?.length
          ? [
              { type: 'text', text: message.content },
              ...message.images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
              })),
            ]
          : message.content,
      },
    ];
  });
}

function toAnthropicMessages(messages: AIMessage[]): {
  messages: Array<Record<string, unknown>>;
} {
  return {
    messages: messages.map((message) => {
      if ('toolCall' in message) {
        return {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: message.toolCall.callId,
              name: message.toolCall.name,
              input: message.toolCall.input,
            },
          ],
        };
      }
      if ('toolResult' in message) {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolResult.callId,
              content: message.toolResult.images?.length
                ? [
                    { type: 'text', text: message.toolResult.content },
                    ...message.toolResult.images.map((image) => ({
                      type: 'image',
                      source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
                    })),
                  ]
                : message.toolResult.content,
            },
          ],
        };
      }
      return {
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.images?.length
          ? [
              { type: 'text', text: message.content },
              ...message.images.map((image) => ({
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
              })),
            ]
          : message.content,
      };
    }),
  };
}

async function askOpenAICompatible(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  token?: vscode.CancellationToken,
  settings: WorkspaiSettingsSnapshot = readWorkspaiSettings()
): Promise<string> {
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context, settings);
  if (!status.ready) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }
  const urlError = validateAIProviderBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const lifecycle = createRequestLifecycle(settings.aiStreamTimeoutMs, token);
  try {
    const response = await fetch(resolveOpenAIChatCompletionsUrl(settings.customAIBaseUrl), {
      method: 'POST',
      redirect: 'error',
      headers: createOpenAIHeaders(provider.id, apiKey),
      body: JSON.stringify({
        model: settings.customAIModel,
        messages: toOpenAIMessages(messages),
        temperature: 0.2,
        stream: false,
      }),
      signal: lifecycle.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(providerErrorMessage(provider.label, response.status, raw, apiKey));
    }
    const text = extractOpenAICompatibleText(parseErrorPayload(raw));
    if (!text.trim()) {
      throw new Error(`${provider.label} returned an empty response.`);
    }
    return text;
  } finally {
    lifecycle.dispose();
  }
}

async function askAnthropic(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  token?: vscode.CancellationToken,
  settings: WorkspaiSettingsSnapshot = readWorkspaiSettings()
): Promise<string> {
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context, settings);
  if (!status.ready || !apiKey) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }
  const urlError = validateAIProviderBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const lifecycle = createRequestLifecycle(settings.aiStreamTimeoutMs, token);
  try {
    const response = await fetch(resolveAnthropicMessagesUrl(settings.customAIBaseUrl), {
      method: 'POST',
      redirect: 'error',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: settings.customAIModel,
        max_tokens: 4096,
        ...toAnthropicMessages(messages),
      }),
      signal: lifecycle.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(providerErrorMessage(provider.label, response.status, raw, apiKey));
    }
    const text = extractAnthropicText(parseErrorPayload(raw));
    if (!text.trim()) {
      throw new Error(`${provider.label} returned an empty response.`);
    }
    return text;
  } finally {
    lifecycle.dispose();
  }
}

async function askExternalProvider(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  token?: vscode.CancellationToken,
  settings: WorkspaiSettingsSnapshot = readWorkspaiSettings()
): Promise<string> {
  const provider = getAIProviderDefinition(settings.aiProvider);
  return provider.protocol === 'anthropic-messages'
    ? askAnthropic(context, messages, token, settings)
    : askOpenAICompatible(context, messages, token, settings);
}

const jsonTransportCache = new WeakMap<vscode.ExtensionContext, Map<string, number>>();
const streamingFallbacks = new WeakMap<vscode.ExtensionContext, Set<string>>();
function disableStreaming(context: vscode.ExtensionContext, key: string): void {
  const entries = streamingFallbacks.get(context) ?? new Set<string>();
  entries.add(key);
  while (entries.size > 32) {
    entries.delete(entries.values().next().value!);
  }
  streamingFallbacks.set(context, entries);
}
function usesJsonTransport(context: vscode.ExtensionContext, key: string): boolean {
  const cache = jsonTransportCache.get(context);
  const at = cache?.get(key);
  if (at === undefined) {
    return false;
  }
  if (Date.now() - at > 10 * 60 * 1000) {
    cache?.delete(key);
    return false;
  }
  return true;
}
function rememberJsonTransport(context: vscode.ExtensionContext, key: string): void {
  const cache = jsonTransportCache.get(context) ?? new Map<string, number>();
  cache.delete(key);
  cache.set(key, Date.now());
  while (cache.size > 64) {
    cache.delete(cache.keys().next().value!);
  }
  jsonTransportCache.set(context, cache);
}

async function askOpenAICompatibleToolAction(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  tools: ConfiguredAIProviderTool[],
  token?: vscode.CancellationToken,
  onProgress?: AIProviderStreamObserver
): Promise<ConfiguredAIProviderAction> {
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context, settings);
  if (!status.ready) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }
  const urlError = validateAIProviderBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const lifecycle = createRequestLifecycle(
    getAIToolRequestTimeoutMs(),
    token,
    'workspai.aiToolRequestTimeoutMs'
  );
  try {
    const transportKey = `${provider.id}|${settings.customAIBaseUrl}|${settings.customAIModel}`;
    let jsonTransport = usesJsonTransport(context, transportKey);
    let streaming = !streamingFallbacks.get(context)?.has(transportKey);
    let correction: string | undefined;
    let discarded: Parameters<typeof withDiscardedDecisionUsage>[1];
    const send = (json: boolean) =>
      fetchProviderResponseWithRetry({
        url: resolveOpenAIChatCompletionsUrl(settings.customAIBaseUrl),
        init: {
          method: 'POST',
          headers: createOpenAIHeaders(provider.id, apiKey),
          body: JSON.stringify({
            model: settings.customAIModel,
            messages: toOpenAIMessages(
              json
                ? jsonToolMessages(
                    correction ? [...messages, { role: 'user', content: correction }] : messages,
                    tools
                  )
                : messages
            ),
            temperature: 0.1,
            stream: streaming,
            ...(streaming ? { stream_options: { include_usage: true } } : {}),
            ...(!json
              ? {
                  tools: tools.map((tool) => ({
                    type: 'function',
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.inputSchema ?? { type: 'object' },
                    },
                  })),
                  tool_choice: 'required',
                  ...(streaming ? { parallel_tool_calls: false } : {}),
                }
              : {}),
          }),
        },
        signal: lifecycle.signal,
        protocol: 'openai-compatible',
        onProgress,
      });
    let result = await send(jsonTransport);
    let attempts = result.attempts;
    if (
      streaming &&
      !result.response.ok &&
      [400, 422].includes(result.response.status) &&
      /(stream|parallel_tool_calls)/i.test(result.raw) &&
      /(unsupported|not supported|unknown|unrecognized|unexpected|not allowed)/i.test(result.raw)
    ) {
      streaming = false;
      disableStreaming(context, transportKey);
      result = await send(jsonTransport);
      attempts += result.attempts;
    }
    if (
      !jsonTransport &&
      !result.response.ok &&
      [400, 422].includes(result.response.status) &&
      isNativeToolTransportUnsupported(result.raw)
    ) {
      jsonTransport = true;
      result = await send(true);
      attempts += result.attempts;
    }
    if (!jsonTransport && result.response.ok) {
      const candidate = recordProviderPayload(result.raw);
      const choices = Array.isArray(candidate.choices) ? candidate.choices : [];
      const message = recordProviderValue(recordProviderValue(choices[0]).message);
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 1) {
        discarded = {
          ...openAICompatibleTokenUsage(candidate),
          estimatedInput: estimatedTokenCount({ messages, tools }),
          estimatedOutput: estimatedTokenCount(candidate),
        };
        jsonTransport = true;
        correction =
          'The previous response proposed multiple tool calls. None were executed. Select exactly one next action. Use inspect-workspace-batch for independent supported reads, or choose the next necessary individual tool. Return the actual final answer through the completion tool when ready.';
        result = await send(true);
        attempts += result.attempts;
      }
    }
    const { response, raw } = result;
    if (!response.ok) {
      throw new Error(
        `${providerErrorMessage(provider.label, response.status, raw, apiKey)}${
          attempts > 1 ? ` after ${attempts} bounded attempts` : ''
        }`
      );
    }
    const payload = (parseErrorPayload(raw) ?? {}) as Record<string, unknown>;
    const tokenUsage = withDiscardedDecisionUsage(openAICompatibleTokenUsage(payload), discarded, {
      inputTokens: estimatedTokenCount({ messages, tools, correction }),
      outputTokens: estimatedTokenCount(payload),
    });
    if (jsonTransport) {
      rememberJsonTransport(context, transportKey);
      const text = extractOpenAICompatibleText(payload);
      const envelope = parseJsonToolEnvelope(text, tools);
      const resolution = {
        provider: provider.id,
        modelId: settings.customAIModel,
        fallback: false,
        attempts,
        ...tokenUsage,
        toolTransport: 'json' as const,
      };
      return envelope
        ? { type: 'tool', ...resolution, callId: randomUUID(), ...envelope }
        : { type: 'text', ...resolution, text };
    }

    const choice = Array.isArray(payload.choices)
      ? (payload.choices[0] as { message?: Record<string, unknown> } | undefined)
      : undefined;
    const message = choice?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const first = toolCalls[0] as
      | { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
      | undefined;
    const name = first?.function?.name;
    if (typeof name === 'string') {
      const args = first?.function?.arguments;
      const parsed = providerToolInput(args, true);
      return {
        type: 'tool',
        provider: provider.id,
        modelId: settings.customAIModel,
        fallback: false,
        attempts,
        ...tokenUsage,
        callId: typeof first?.id === 'string' && first.id.trim() ? first.id : randomUUID(),
        toolName: name,
        input: parsed,
      };
    }
    return {
      type: 'text',
      provider: provider.id,
      modelId: settings.customAIModel,
      fallback: false,
      attempts,
      ...tokenUsage,
      text: extractOpenAICompatibleText(payload),
    };
  } finally {
    lifecycle.dispose();
  }
}

async function askAnthropicToolAction(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  tools: ConfiguredAIProviderTool[],
  token?: vscode.CancellationToken,
  onProgress?: AIProviderStreamObserver
): Promise<ConfiguredAIProviderAction> {
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context, settings);
  if (!status.ready || !apiKey) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }

  const lifecycle = createRequestLifecycle(
    getAIToolRequestTimeoutMs(),
    token,
    'workspai.aiToolRequestTimeoutMs'
  );
  try {
    const transportKey = `${provider.id}|${settings.customAIBaseUrl}|${settings.customAIModel}`;
    let jsonTransport = usesJsonTransport(context, transportKey);
    let streaming = !streamingFallbacks.get(context)?.has(transportKey);
    let correction: string | undefined;
    let discarded: Parameters<typeof withDiscardedDecisionUsage>[1];
    const send = (json: boolean) =>
      fetchProviderResponseWithRetry({
        url: resolveAnthropicMessagesUrl(settings.customAIBaseUrl),
        init: {
          method: 'POST',
          headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            model: settings.customAIModel,
            max_tokens: 4096,
            stream: streaming,
            ...toAnthropicMessages(
              json
                ? jsonToolMessages(
                    correction ? [...messages, { role: 'user', content: correction }] : messages,
                    tools
                  )
                : messages
            ),
            ...(!json
              ? {
                  tools: tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema ?? { type: 'object' },
                  })),
                  tool_choice: {
                    type: 'any',
                    ...(streaming ? { disable_parallel_tool_use: true } : {}),
                  },
                }
              : {}),
          }),
        },
        signal: lifecycle.signal,
        protocol: 'anthropic-messages',
        onProgress,
      });
    let result = await send(jsonTransport);
    let attempts = result.attempts;
    if (
      streaming &&
      !result.response.ok &&
      [400, 422].includes(result.response.status) &&
      /(stream|disable_parallel_tool_use)/i.test(result.raw) &&
      /(unsupported|not supported|unknown|unrecognized|unexpected|not allowed)/i.test(result.raw)
    ) {
      streaming = false;
      disableStreaming(context, transportKey);
      result = await send(jsonTransport);
      attempts += result.attempts;
    }
    if (
      !jsonTransport &&
      !result.response.ok &&
      [400, 422].includes(result.response.status) &&
      isNativeToolTransportUnsupported(result.raw)
    ) {
      jsonTransport = true;
      result = await send(true);
      attempts += result.attempts;
    }
    if (!jsonTransport && result.response.ok) {
      const candidate = recordProviderPayload(result.raw);
      if (
        Array.isArray(candidate.content) &&
        candidate.content.filter((block) => recordProviderValue(block).type === 'tool_use').length >
          1
      ) {
        discarded = {
          ...anthropicTokenUsage(candidate),
          estimatedInput: estimatedTokenCount({ messages, tools }),
          estimatedOutput: estimatedTokenCount(candidate),
        };
        jsonTransport = true;
        correction =
          'The previous response proposed multiple tool calls. None were executed. Select exactly one next action. Use inspect-workspace-batch for independent supported reads, or choose the next necessary individual tool. Return the actual final answer through the completion tool when ready.';
        result = await send(true);
        attempts += result.attempts;
      }
    }
    const { response, raw } = result;
    if (!response.ok) {
      throw new Error(
        `${providerErrorMessage(provider.label, response.status, raw, apiKey)}${
          attempts > 1 ? ` after ${attempts} bounded attempts` : ''
        }`
      );
    }
    const payload = (parseErrorPayload(raw) ?? {}) as Record<string, unknown>;
    const tokenUsage = withDiscardedDecisionUsage(anthropicTokenUsage(payload), discarded, {
      inputTokens: estimatedTokenCount({ messages, tools, correction }),
      outputTokens: estimatedTokenCount(payload),
    });
    if (jsonTransport) {
      rememberJsonTransport(context, transportKey);
      const text = extractAnthropicText(payload);
      const envelope = parseJsonToolEnvelope(text, tools);
      const resolution = {
        provider: provider.id,
        modelId: settings.customAIModel,
        fallback: false,
        attempts,
        ...tokenUsage,
        toolTransport: 'json' as const,
      };
      return envelope
        ? { type: 'tool', ...resolution, callId: randomUUID(), ...envelope }
        : { type: 'text', ...resolution, text };
    }

    const content = Array.isArray(payload.content) ? payload.content : [];
    const toolUse = content.find(
      (block) =>
        block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_use'
    ) as { id?: unknown; name?: unknown; input?: unknown } | undefined;
    if (typeof toolUse?.name === 'string') {
      return {
        type: 'tool',
        provider: provider.id,
        modelId: settings.customAIModel,
        fallback: false,
        attempts,
        ...tokenUsage,
        callId: typeof toolUse.id === 'string' && toolUse.id.trim() ? toolUse.id : randomUUID(),
        toolName: toolUse.name,
        input: providerToolInput(toolUse.input, false),
      };
    }
    return {
      type: 'text',
      provider: provider.id,
      modelId: settings.customAIModel,
      fallback: false,
      attempts,
      ...tokenUsage,
      text: extractAnthropicText(payload),
    };
  } finally {
    lifecycle.dispose();
  }
}

export async function askConfiguredAIProviderForToolAction(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  tools: ConfiguredAIProviderTool[],
  token?: vscode.CancellationToken,
  preferredModelId?: string,
  pathIdentities: ReadonlyArray<AIMessagePathIdentity> = [],
  onProgress?: AIProviderStreamObserver
): Promise<ConfiguredAIProviderAction> {
  const safeMessages = redactAIMessageRuntimePaths(messages, pathIdentities);
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  // The Studio model picker selects VS Code LM registrations. External
  // providers use the explicitly configured endpoint model and must not report
  // a false fallback from an unrelated VS Code model identifier.
  const requestedModelId =
    provider.protocol === 'vscode-lm'
      ? preferredModelId?.trim() || settings.preferredModel
      : undefined;
  const withRequestedModel = (action: ConfiguredAIProviderAction): ConfiguredAIProviderAction => {
    const explicitRequestedModel =
      requestedModelId && requestedModelId.toLowerCase() !== 'auto' ? requestedModelId : undefined;
    return {
      ...action,
      ...(explicitRequestedModel ? { requestedModelId: explicitRequestedModel } : {}),
      inputTokens:
        action.inputTokens ??
        estimatedTokenCount({
          messages: safeMessages,
          tools,
        }),
      outputTokens:
        action.outputTokens ??
        estimatedTokenCount(
          action.type === 'tool' ? { toolName: action.toolName, input: action.input } : action.text
        ),
      tokenUsageSource: action.tokenUsageSource ?? 'estimated',
      fallback:
        action.fallback ||
        Boolean(
          explicitRequestedModel &&
          explicitRequestedModel.toLowerCase() !== action.modelId.toLowerCase()
        ),
    };
  };
  if (provider.protocol === 'openai-compatible') {
    return withRequestedModel(
      await askOpenAICompatibleToolAction(context, safeMessages, tools, token, onProgress)
    );
  }
  if (provider.protocol === 'anthropic-messages') {
    return withRequestedModel(
      await askAnthropicToolAction(context, safeMessages, tools, token, onProgress)
    );
  }
  const response = onProgress
    ? await requestAIModelToolAction(safeMessages, tools, token, requestedModelId, [], onProgress)
    : await requestAIModelToolAction(safeMessages, tools, token, requestedModelId);
  return withRequestedModel(
    response.type === 'tool'
      ? {
          type: 'tool',
          provider: 'vscode-lm',
          modelId: response.modelId,
          fallback: response.fallback ?? false,
          attempts: response.attempts ?? 1,
          ...(response.toolTransport ? { toolTransport: response.toolTransport } : {}),
          callId: response.callId,
          toolName: response.toolName,
          input: response.input,
        }
      : {
          type: 'text',
          provider: 'vscode-lm',
          modelId: response.modelId,
          fallback: response.fallback ?? false,
          attempts: response.attempts ?? 1,
          ...(response.toolTransport ? { toolTransport: response.toolTransport } : {}),
          text: response.text,
        }
  );
}

export async function runConfiguredAIProviderHealthCheck(
  context: vscode.ExtensionContext,
  token?: vscode.CancellationToken,
  settings: WorkspaiSettingsSnapshot = readWorkspaiSettings()
): Promise<AIProviderHealthCheckResult> {
  settings = {
    ...settings,
    aiStreamTimeoutMs: Math.min(15_000, Math.max(1_000, settings.aiStreamTimeoutMs)),
  };
  const status = await getAIProviderStatus(context, settings);
  const startedAt = Date.now();

  if (!status.ready) {
    return {
      provider: status.provider,
      ok: false,
      label: status.label,
      model: status.model,
      reason: status.reason || 'Provider setup is incomplete.',
    };
  }

  try {
    const messages: AIMessage[] = [{ role: 'user', content: 'Reply with exactly: OK' }];
    const text =
      status.protocol !== 'vscode-lm'
        ? await askExternalProvider(context, messages, token, settings)
        : await askAI(messages, token);
    if (!/\bOK\b/i.test(text)) {
      return {
        provider: status.provider,
        ok: false,
        label: status.label,
        latencyMs: Date.now() - startedAt,
        model: status.model,
        reason: 'Provider responded, but the health-check response was not recognized.',
      };
    }

    return {
      provider: status.provider,
      ok: true,
      label: status.label,
      latencyMs: Date.now() - startedAt,
      model: status.model,
    };
  } catch (error) {
    return {
      provider: status.provider,
      ok: false,
      label: status.label,
      latencyMs: Date.now() - startedAt,
      model: status.model,
      reason: sanitizeProviderError(error),
    };
  }
}

export async function askConfiguredAIProvider(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  token?: vscode.CancellationToken,
  onTextChunk?: (text: string) => void,
  preferredModelId?: string
): Promise<{ text: string; provider: AIProviderKind }> {
  const provider = getAIProviderDefinition(readWorkspaiSettings().aiProvider);
  if (provider.protocol !== 'vscode-lm') {
    const text = await askExternalProvider(context, messages, token);
    onTextChunk?.(text);
    return { text, provider: provider.id };
  }
  if (onTextChunk) {
    let text = '';
    await streamAIResponse(
      messages,
      (chunk) => {
        if (!chunk.text) {
          return;
        }
        text += chunk.text;
        onTextChunk(chunk.text);
      },
      token,
      preferredModelId
    );
    return { text, provider: 'vscode-lm' };
  }
  return {
    text: preferredModelId
      ? await (async () => {
          let text = '';
          await streamAIResponse(
            messages,
            (chunk) => {
              text += chunk.text;
            },
            token,
            preferredModelId
          );
          return text;
        })()
      : await askAI(messages, token),
    provider: 'vscode-lm',
  };
}
