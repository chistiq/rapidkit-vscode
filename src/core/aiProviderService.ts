import * as vscode from 'vscode';

import type { AIMessage } from './aiService';
import { askAI, requestAIModelToolAction, streamAIResponse } from './aiService';
import { readWorkspaiSettings } from './workspaiSettingsBridge';

const CUSTOM_AI_SECRET_KEY = 'workspai.customAI.apiKey';

export type AIProviderKind = 'vscode-lm' | 'openai-compatible';

export interface AIProviderStatus {
  provider: AIProviderKind;
  ready: boolean;
  label: string;
  reason?: string;
  baseUrl?: string;
  model?: string;
  hasApiKey?: boolean;
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

export async function setCustomAIAPIKey(
  context: vscode.ExtensionContext,
  apiKey: string
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await context.secrets.delete(CUSTOM_AI_SECRET_KEY);
    return;
  }
  await context.secrets.store(CUSTOM_AI_SECRET_KEY, trimmed);
}

export async function clearCustomAIAPIKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(CUSTOM_AI_SECRET_KEY);
}

export async function getAIProviderStatus(
  context: vscode.ExtensionContext
): Promise<AIProviderStatus> {
  const settings = readWorkspaiSettings();
  if (settings.aiProvider === 'vscode-lm') {
    return {
      provider: 'vscode-lm',
      ready: true,
      label: 'VS Code Language Model',
      model: settings.preferredModel,
    };
  }

  const hasApiKey = Boolean(await context.secrets.get(CUSTOM_AI_SECRET_KEY));
  const hasBaseUrl = settings.customAIBaseUrl.length > 0;
  const hasModel = settings.customAIModel.length > 0;
  const ready = hasApiKey && hasBaseUrl && hasModel;

  return {
    provider: 'openai-compatible',
    ready,
    label: 'OpenAI-compatible API',
    baseUrl: settings.customAIBaseUrl || undefined,
    model: settings.customAIModel || undefined,
    hasApiKey,
    reason: ready
      ? undefined
      : [
          !hasBaseUrl ? 'Base URL is missing' : null,
          !hasModel ? 'Model is missing' : null,
          !hasApiKey ? 'API key is missing' : null,
        ]
          .filter(Boolean)
          .join(', '),
  };
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v\d+$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function validateCustomAIBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Base URL must use http or https.';
    }
    if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return 'HTTP custom AI providers are only allowed for localhost.';
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
    .replace(/sk-[A-Za-z0-9._-]+/gi, 'sk-[redacted]')
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

async function askOpenAICompatible(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  token?: vscode.CancellationToken
): Promise<string> {
  const settings = readWorkspaiSettings();
  const apiKey = await context.secrets.get(CUSTOM_AI_SECRET_KEY);
  const status = await getAIProviderStatus(context);
  if (!status.ready || !apiKey) {
    throw new Error(status.reason || 'Custom AI provider is not configured.');
  }
  const urlError = validateCustomAIBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.aiStreamTimeoutMs);
  const cancellation = token?.onCancellationRequested(() => controller.abort());

  try {
    const response = await fetch(resolveChatCompletionsUrl(settings.customAIBaseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.customAIModel,
        messages,
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? JSON.stringify((payload as { error?: unknown }).error)
          : raw.slice(0, 240);
      throw new Error(`Custom AI provider returned ${response.status}: ${message}`);
    }

    const text = extractOpenAICompatibleText(payload);
    if (!text.trim()) {
      throw new Error('Custom AI provider returned an empty response.');
    }
    return text;
  } finally {
    clearTimeout(timeout);
    cancellation?.dispose();
  }
}

async function askOpenAICompatibleToolAction(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  tools: ConfiguredAIProviderTool[],
  token?: vscode.CancellationToken
): Promise<ConfiguredAIProviderAction> {
  const settings = readWorkspaiSettings();
  const apiKey = await context.secrets.get(CUSTOM_AI_SECRET_KEY);
  const status = await getAIProviderStatus(context);
  if (!status.ready || !apiKey) {
    throw new Error(status.reason || 'Custom AI provider is not configured.');
  }
  const urlError = validateCustomAIBaseUrl(settings.customAIBaseUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.aiStreamTimeoutMs);
  const cancellation = token?.onCancellationRequested(() => controller.abort());
  try {
    const response = await fetch(resolveChatCompletionsUrl(settings.customAIBaseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
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
      signal: controller.signal,
    });
    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new Error(`Custom AI provider returned ${response.status}: ${raw.slice(0, 240)}`);
    }
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
      return { type: 'tool', provider: 'openai-compatible', toolName: name, input: parsed };
    }
    return {
      type: 'text',
      provider: 'openai-compatible',
      text: extractOpenAICompatibleText(payload),
    };
  } finally {
    clearTimeout(timeout);
    cancellation?.dispose();
  }
}

export async function askConfiguredAIProviderForToolAction(
  context: vscode.ExtensionContext,
  messages: AIMessage[],
  tools: ConfiguredAIProviderTool[],
  token?: vscode.CancellationToken,
  preferredModelId?: string
): Promise<ConfiguredAIProviderAction> {
  const settings = readWorkspaiSettings();
  if (settings.aiProvider === 'openai-compatible') {
    return askOpenAICompatibleToolAction(context, messages, tools, token);
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
    if (status.provider === 'openai-compatible') {
      const text = await askOpenAICompatible(
        context,
        [
          {
            role: 'user',
            content: 'Reply with exactly: OK',
          },
        ],
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
      await askAI(
        [
          {
            role: 'user',
            content: 'Reply with exactly: OK',
          },
        ],
        token
      );
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
  const settings = readWorkspaiSettings();
  if (settings.aiProvider === 'openai-compatible') {
    const text = await askOpenAICompatible(context, messages, token);
    onTextChunk?.(text);
    return {
      text,
      provider: 'openai-compatible',
    };
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
