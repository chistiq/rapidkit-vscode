import * as vscode from 'vscode';

import { readLanguageModelResponseText } from '../../core/languageModelResponse';
import { getWebviewMessageDataRecord, readNumberField } from '../../contracts/webviewProtocol';
import type { ModuleData } from '../../data/modules';
import { asRecord, extractFirstJsonArray, safeErrorMessage } from './welcomePanel.shared.js';
import { handleAiModalQueryMessage, type AiModalQueryHost } from './welcomePanelAiModalQuery';

const DEFAULT_AI_MODULE_SUGGEST_TIMEOUT_MS = 20_000;
const MIN_AI_MODULE_SUGGEST_TIMEOUT_MS = 1_000;
const MAX_AI_MODULE_SUGGEST_TIMEOUT_MS = 60_000;

export type AiModalMessageHost = AiModalQueryHost & {
  getModulesCatalog: () => ModuleData[];
  ensureModulesCatalogLoaded: () => Promise<void>;
};

const AI_MODAL_WEBVIEW_COMMANDS = new Set(['aiSuggestModules', 'aiCancelQuery', 'aiQuery']);

export function isAiModalWebviewCommand(command: string): boolean {
  return AI_MODAL_WEBVIEW_COMMANDS.has(command);
}

function getAIModuleSuggestTimeoutMs(): number {
  const configured = vscode.workspace
    .getConfiguration('workspai')
    .get<number>('commandTimeoutMs', DEFAULT_AI_MODULE_SUGGEST_TIMEOUT_MS);

  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return DEFAULT_AI_MODULE_SUGGEST_TIMEOUT_MS;
  }

  return Math.max(
    MIN_AI_MODULE_SUGGEST_TIMEOUT_MS,
    Math.min(MAX_AI_MODULE_SUGGEST_TIMEOUT_MS, Math.round(configured))
  );
}

export async function handleAiSuggestModulesMessage(
  host: AiModalMessageHost,
  messageData: unknown
): Promise<void> {
  const payload = asRecord(messageData);
  const fw = typeof payload?.framework === 'string' ? payload.framework : undefined;
  const pn = typeof payload?.projectName === 'string' ? payload.projectName : undefined;
  if (!fw) {
    return;
  }

  if (fw !== 'fastapi' && fw !== 'nestjs') {
    host.postWebviewMessage('aiModuleSuggestions', {
      loading: false,
      suggestions: [],
      error: 'AI module suggestions are available only for FastAPI and NestJS projects.',
    });
    return;
  }

  try {
    const { selectModelWithPreference } = await import('../../core/aiService.js');
    const { model, modelId } = await selectModelWithPreference();
    host.postWebviewMessage('aiModuleSuggestions', { loading: true, modelId });

    await host.ensureModulesCatalogLoaded();
    const modulesCatalog = host.getModulesCatalog();
    const moduleList = modulesCatalog.length
      ? modulesCatalog
          .map((m) => {
            const tags = m.tags && m.tags.length ? ` | tags: ${m.tags.slice(0, 4).join(', ')}` : '';
            return `- ${m.slug}: ${m.description || m.name} | category: ${m.category} | status: ${m.status}${tags}`;
          })
          .join('\n')
      : '(module list not available)';

    const prompt = `You are a Workspai assistant. Recommend the top 5 most useful Workspai modules for a ${fw} project named "${pn || 'my-project'}".
Available modules:
${moduleList}

Reply ONLY with a JSON array of objects like: [{"slug": "free/auth/core", "reason": "short reason"}]
Use ONLY slugs from the list above. Prefer modules that fit the framework and avoid deprecated or invented slugs.
No markdown, no explanation outside the JSON.`;

    const requestTokenSource = new vscode.CancellationTokenSource();
    const requestTimeoutMs = getAIModuleSuggestTimeoutMs();
    const timeoutHandle = setTimeout(() => {
      requestTokenSource.cancel();
    }, requestTimeoutMs);

    let parsed: unknown = [];
    try {
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {},
        requestTokenSource.token
      );

      const raw = await readLanguageModelResponseText(response, requestTokenSource.token);

      if (requestTokenSource.token.isCancellationRequested) {
        throw new Error(`AI module suggestion timed out after ${requestTimeoutMs}ms.`);
      }

      const rawJsonArray = extractFirstJsonArray(raw);
      if (rawJsonArray) {
        try {
          parsed = JSON.parse(rawJsonArray);
        } catch {
          parsed = [];
        }
      }
    } finally {
      clearTimeout(timeoutHandle);
      requestTokenSource.dispose();
    }

    const allowedSlugs = new Set(modulesCatalog.map((m) => m.slug));
    const suggestions = Array.isArray(parsed)
      ? parsed
          .filter(
            (item): item is { slug: string; reason?: string } =>
              item && typeof item === 'object' && typeof item.slug === 'string'
          )
          .map((item) => ({
            slug: item.slug.trim(),
            reason:
              typeof item.reason === 'string' && item.reason.trim()
                ? item.reason.trim().slice(0, 180)
                : 'Recommended for this project',
          }))
          .filter((item) => allowedSlugs.has(item.slug))
          .slice(0, 5)
      : [];
    host.postWebviewMessage('aiModuleSuggestions', { loading: false, modelId, suggestions });
  } catch (err: unknown) {
    host.postWebviewMessage('aiModuleSuggestions', {
      loading: false,
      error: safeErrorMessage(err) || 'AI unavailable',
    });
  }
}

export function handleAiCancelQueryMessage(host: AiModalMessageHost, messageData: unknown): void {
  const payload = getWebviewMessageDataRecord({ command: 'aiCancelQuery', data: messageData });
  const cancelRequestId = readNumberField(payload, 'requestId');
  const activeRequestId = host.getActiveAiQueryRequestId();
  if (
    typeof cancelRequestId === 'number' &&
    typeof activeRequestId === 'number' &&
    cancelRequestId !== activeRequestId
  ) {
    return;
  }

  const tokenSource = host.getAiQueryTokenSource();
  tokenSource?.cancel();
  tokenSource?.dispose();
  host.setAiQueryTokenSource(undefined);
  const doneRequestId = typeof cancelRequestId === 'number' ? cancelRequestId : activeRequestId;
  host.postAIStreamDoneOnce(doneRequestId);
  host.setActiveAiQueryRequestId(undefined);
}

export async function tryDispatchAiModalWebviewMessage(
  host: AiModalMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isAiModalWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'aiSuggestModules':
      await handleAiSuggestModulesMessage(host, data);
      break;
    case 'aiCancelQuery':
      handleAiCancelQueryMessage(host, data);
      break;
    case 'aiQuery':
      await handleAiModalQueryMessage(host, data);
      break;
  }

  return true;
}
