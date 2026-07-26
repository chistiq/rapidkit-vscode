import * as vscode from 'vscode';

import type { AIMessage } from './aiService';
import { askAI, requestAIModelToolAction, streamAIResponse } from './aiService';
import {
  getAIProviderDefinition,
  type AIProviderKind,
  type AIProviderProtocol,
} from './aiProviderCatalog';
import { readWorkspaiSettings } from './workspaiSettingsBridge';

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

export type ConfiguredAIProviderAction =
  | { type: 'tool'; provider: AIProviderKind; toolName: string; input: Record<string, unknown> }
  | { type: 'text'; provider: AIProviderKind; text: string };

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
  apiKey: string
): Promise<void> {
  const provider = readWorkspaiSettings().aiProvider;
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

export async function clearCustomAIAPIKey(context: vscode.ExtensionContext): Promise<void> {
  const provider = readWorkspaiSettings().aiProvider;
  if (provider === 'vscode-lm') {
    return;
  }
  await context.secrets.delete(providerSecretKey(provider));
  if (provider === 'openai-compatible') {
    await context.secrets.delete(LEGACY_CUSTOM_AI_SECRET_KEY);
  }
}

export async function getAIProviderStatus(
  context: vscode.ExtensionContext
): Promise<AIProviderStatus> {
  const settings = readWorkspaiSettings();
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
  const ready = hasBaseUrl && hasModel && (!provider.requiresApiKey || hasApiKey);

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
          !hasBaseUrl ? 'Base URL is missing' : null,
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

function validateCustomAIBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Base URL must use http or https.';
    }
    if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return 'HTTP AI providers are only allowed for localhost.';
    }
    return null;
  } catch {
    return 'Base URL is not a valid URL.';
  }
}

function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(?:sk|AIza)[-A-Za-z0-9._]+/gi, '[redacted API key]')
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

function parseErrorPayload(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function providerErrorMessage(label: string, status: number, raw: string): string {
  const payload = parseErrorPayload(raw);
  const message =
    payload && typeof payload === 'object' && 'error' in payload
      ? JSON.stringify((payload as { error?: unknown }).error)
      : raw.slice(0, 240);
  return `${label} returned ${status}: ${message}`;
}

function createRequestLifecycle(
  timeoutMs: number,
  token?: vscode.CancellationToken
): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const cancellation = token?.onCancellationRequested(() => controller.abort());
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      cancellation?.dispose();
    },
  };
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

function toAnthropicMessages(messages: AIMessage[]): {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  return {
    messages: messages.map((message) => ({
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: message.content,
    })),
  };
}

async function askOpenAICompatible(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  token?: vscode.CancellationToken
): Promise<string> {
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context);
  if (!status.ready) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }
  const urlError = validateCustomAIBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const lifecycle = createRequestLifecycle(settings.aiStreamTimeoutMs, token);
  try {
    const response = await fetch(resolveOpenAIChatCompletionsUrl(settings.customAIBaseUrl), {
      method: 'POST',
      headers: createOpenAIHeaders(provider.id, apiKey),
      body: JSON.stringify({
        model: settings.customAIModel,
        messages,
        temperature: 0.2,
        stream: false,
      }),
      signal: lifecycle.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(providerErrorMessage(provider.label, response.status, raw));
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
  token?: vscode.CancellationToken
): Promise<string> {
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context);
  if (!status.ready || !apiKey) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }
  const urlError = validateCustomAIBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const lifecycle = createRequestLifecycle(settings.aiStreamTimeoutMs, token);
  try {
    const response = await fetch(resolveAnthropicMessagesUrl(settings.customAIBaseUrl), {
      method: 'POST',
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
      throw new Error(providerErrorMessage(provider.label, response.status, raw));
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
  token?: vscode.CancellationToken
): Promise<string> {
  const provider = getAIProviderDefinition(readWorkspaiSettings().aiProvider);
  return provider.protocol === 'anthropic-messages'
    ? askAnthropic(context, messages, token)
    : askOpenAICompatible(context, messages, token);
}

async function askOpenAICompatibleToolAction(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  tools: ConfiguredAIProviderTool[],
  token?: vscode.CancellationToken
): Promise<ConfiguredAIProviderAction> {
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context);
  if (!status.ready) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }
  const urlError = validateCustomAIBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const lifecycle = createRequestLifecycle(settings.aiStreamTimeoutMs, token);
  try {
    const response = await fetch(resolveOpenAIChatCompletionsUrl(settings.customAIBaseUrl), {
      method: 'POST',
      headers: createOpenAIHeaders(provider.id, apiKey),
      body: JSON.stringify({
        model: settings.customAIModel,
        messages,
        temperature: 0.1,
        stream: false,
        tools: tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema ?? { type: 'object' },
          },
        })),
        tool_choice: 'required',
      }),
      signal: lifecycle.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(providerErrorMessage(provider.label, response.status, raw));
    }
    const payload = (parseErrorPayload(raw) ?? {}) as Record<string, unknown>;
    const choice = Array.isArray(payload.choices)
      ? (payload.choices[0] as { message?: Record<string, unknown> } | undefined)
      : undefined;
    const message = choice?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const first = toolCalls[0] as
      | { function?: { name?: unknown; arguments?: unknown } }
      | undefined;
    const name = first?.function?.name;
    if (typeof name === 'string') {
      const args = first?.function?.arguments;
      let parsed: Record<string, unknown> = {};
      if (typeof args === 'string' && args.trim()) {
        const value = JSON.parse(args) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          parsed = value as Record<string, unknown>;
        }
      }
      return { type: 'tool', provider: provider.id, toolName: name, input: parsed };
    }
    return {
      type: 'text',
      provider: provider.id,
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
  token?: vscode.CancellationToken
): Promise<ConfiguredAIProviderAction> {
  const settings = readWorkspaiSettings();
  const provider = getAIProviderDefinition(settings.aiProvider);
  const apiKey = await getActiveProviderAPIKey(context, settings.aiProvider);
  const status = await getAIProviderStatus(context);
  if (!status.ready || !apiKey) {
    throw new Error(status.reason || `${provider.label} is not configured.`);
  }

  const lifecycle = createRequestLifecycle(settings.aiStreamTimeoutMs, token);
  try {
    const response = await fetch(resolveAnthropicMessagesUrl(settings.customAIBaseUrl), {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: settings.customAIModel,
        max_tokens: 4096,
        ...toAnthropicMessages(messages),
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema ?? { type: 'object' },
        })),
        tool_choice: { type: 'any' },
      }),
      signal: lifecycle.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(providerErrorMessage(provider.label, response.status, raw));
    }
    const payload = (parseErrorPayload(raw) ?? {}) as { content?: unknown };
    const content = Array.isArray(payload.content) ? payload.content : [];
    const toolUse = content.find(
      (block) =>
        block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_use'
    ) as { name?: unknown; input?: unknown } | undefined;
    if (typeof toolUse?.name === 'string') {
      return {
        type: 'tool',
        provider: provider.id,
        toolName: toolUse.name,
        input:
          toolUse.input && typeof toolUse.input === 'object' && !Array.isArray(toolUse.input)
            ? (toolUse.input as Record<string, unknown>)
            : {},
      };
    }
    return {
      type: 'text',
      provider: provider.id,
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
  preferredModelId?: string
): Promise<ConfiguredAIProviderAction> {
  const provider = getAIProviderDefinition(readWorkspaiSettings().aiProvider);
  if (provider.protocol === 'openai-compatible') {
    return askOpenAICompatibleToolAction(context, messages, tools, token);
  }
  if (provider.protocol === 'anthropic-messages') {
    return askAnthropicToolAction(context, messages, tools, token);
  }
  const response = await requestAIModelToolAction(messages, tools, token, preferredModelId);
  return response.type === 'tool'
    ? {
        type: 'tool',
        provider: 'vscode-lm',
        toolName: response.toolName,
        input: response.input,
      }
    : { type: 'text', provider: 'vscode-lm', text: response.text };
}

export async function runConfiguredAIProviderHealthCheck(
  context: vscode.ExtensionContext,
  token?: vscode.CancellationToken
): Promise<AIProviderHealthCheckResult> {
  const status = await getAIProviderStatus(context);
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
    if (status.protocol !== 'vscode-lm') {
      const text = await askExternalProvider(
        context,
        [{ role: 'user', content: 'Reply with exactly: OK' }],
        token
      );
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
    } else {
      await askAI([{ role: 'user', content: 'Reply with exactly: OK' }], token);
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
