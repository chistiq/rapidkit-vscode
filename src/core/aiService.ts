/**
 * Workspai AI Service
 * Thin wrapper over VS Code Language Model API (vscode.lm).
 * Requires VS Code >= 1.90 and an active Copilot / compatible LLM subscription.
 */

import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import {
  languageModelSelectionIdentifier,
  languageModelSupportsExtensionRequests,
} from './aiModelIdentity.js';
import { ModulesCatalogService } from './modulesCatalogService';
import { run } from '../utils/exec';
import { buildNpxRapidkitArgs } from '../utils/platformCapabilities';
import { sanitizePromptText } from '../utils/promptSecurity';
import {
  buildDirTree,
  getGitDiffStat,
  normalizeFrameworkHint,
  normalizeKitName,
  readRelevantFiles,
  readWorkspaceHealthSummary,
  readWorkspaceVersions,
  resolveProjectScanRoot,
  resolvePythonVersion,
} from './aiProjectContextUtils';
import {
  resetModelSelectionCache,
  selectModelAuto,
  selectModelWithPreference as selectModelWithPreferenceInternal,
} from './aiModelSelection';
import {
  frontendKitIdForFramework,
  isScaffoldFramework,
  isDesktopScaffoldFramework,
  isExtensionScaffoldFramework,
  isFrontendScaffoldFramework,
  type ScaffoldKitId,
  type ScaffoldFramework,
} from './scaffoldKits';
import {
  resolveCreateCapabilityFromPrompt,
  type CreatePlannerCapability,
} from '../contracts/createPlannerCapabilities';
import { buildHeuristicCreationDraft } from './aiCreationHeuristic';
import {
  inferExplicitCreationFrameworks,
  inferPolyglotCompanionProject,
  inferStackIntentFromPrompt,
} from './creationStackIntent';
import { getCanonicalWorkspacesDirectory } from './workspacePaths';
import { readLanguageModelResponseText } from './languageModelResponse';
import { buildAIModalUserMessage as buildAIModalUserMessageInternal } from './aiPromptMessageBuilder';
import { buildWorkspaiSystemPrompt as buildWorkspaiSystemPromptInternal } from './aiSystemPromptBuilder';
import { buildModuleListForPrompt, type LiveModuleEntry } from './aiLiveModuleCatalog';
import { resolveWorkspacePathForGrounding } from './aiArchitectureGrounding';
import { redactKnownRuntimePathsForConsumer } from './consumerPathRedaction.js';
import {
  bootstrapProjectAgent,
  type ProjectAgentBootstrapResult,
} from './projectAgentBootstrap.js';
import {
  buildContextContractFromEvidence,
  validateContextContract,
  type AIContextContractV1,
  type ContextContractValidationResult,
  type DoctorEvidenceSnapshot,
} from './aiContextContract';
export { extractContractTelemetry } from './aiContextContract';

export type AIMessage =
  | {
      role: 'user' | 'assistant';
      content: string;
    }
  | {
      role: 'assistant';
      toolCall: {
        callId: string;
        name: string;
        input: Record<string, unknown>;
      };
    }
  | {
      role: 'tool';
      toolResult: {
        callId: string;
        name: string;
        content: string;
      };
    };

export type AIMessagePathIdentity = {
  path?: string;
  token: '$WORKSPACE' | '$PROJECT' | '$LOCAL_PATH';
};

function redactUnknownMessageValue(
  value: unknown,
  identities: ReadonlyArray<AIMessagePathIdentity>
): unknown {
  if (typeof value === 'string') {
    return redactKnownRuntimePathsForConsumer(value, identities);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownMessageValue(entry, identities));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactUnknownMessageValue(entry, identities),
      ])
    );
  }
  return value;
}

/**
 * Remove known host filesystem identities from every model-message shape,
 * including nested tool inputs and tool results. This is intentionally pure so
 * persisted Studio events retain their exact extension-host execution data.
 */
export function redactAIMessageRuntimePaths(
  messages: ReadonlyArray<AIMessage>,
  identities: ReadonlyArray<AIMessagePathIdentity>
): AIMessage[] {
  return messages.map((message) => {
    if ('content' in message) {
      return {
        ...message,
        content: redactKnownRuntimePathsForConsumer(message.content, identities),
      };
    }
    if ('toolResult' in message) {
      return {
        ...message,
        toolResult: {
          ...message.toolResult,
          content: redactKnownRuntimePathsForConsumer(message.toolResult.content, identities),
        },
      };
    }
    return {
      ...message,
      toolCall: {
        ...message.toolCall,
        input: redactUnknownMessageValue(message.toolCall.input, identities) as Record<
          string,
          unknown
        >,
      },
    };
  });
}

export interface AIStreamChunk {
  text: string;
  done: boolean;
}

export type AIConversationMode = 'debug' | 'ask';

export interface AIConversationHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface PreparedAIConversation {
  scanned?: ScannedProjectContext;
  projectBootstrap: ProjectAgentBootstrapResult;
  contract: AIContextContractV1;
  validation: ContextContractValidationResult;
  messages: AIMessage[];
}

export interface AvailableModel {
  id: string;
  name: string;
  vendor: string;
}

export interface AIModelToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export type AIModelToolActionResponse =
  | {
      type: 'tool';
      modelId: string;
      callId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | { type: 'text'; modelId: string; text: string };

function isRetryableToolModelError(error: unknown): boolean {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /(?:\b(429|rate\s*limit|quota|resource\s*exhausted|temporar(?:y|ily)|unavailable|overloaded|busy|too\s*many\s*requests|service\s*unavailable|model\s*not\s*available|model\s*unavailable|requested\s*model\s*is\s*not\s*supported)\b|model_not_supported)/i.test(
    raw
  );
}

/**
 * Return all language models currently registered in VS Code.
 * Safe to call repeatedly — results stream directly from the LM registry.
 */
export async function listAvailableModels(): Promise<AvailableModel[]> {
  const all = (await vscode.lm.selectChatModels()).filter(languageModelSupportsExtensionRequests);
  return all.map((m) => ({
    id: languageModelSelectionIdentifier(m),
    name: m.name ?? m.id,
    vendor: m.vendor ?? '',
  }));
}

/**
 * Request one native, schema-constrained tool action from the VS Code LM API.
 * Studio Agent uses this path instead of asking models to serialize executable
 * actions into prose. The tool itself is still executed by Studio's governed
 * registry; the model only selects an allowlisted action and its validated input.
 */
export async function requestAIModelToolAction(
  messages: AIMessage[],
  tools: AIModelToolDefinition[],
  token?: vscode.CancellationToken,
  preferredModelId?: string,
  pathIdentities: ReadonlyArray<AIMessagePathIdentity> = []
): Promise<AIModelToolActionResponse> {
  const all = (await vscode.lm.selectChatModels()).filter(languageModelSupportsExtensionRequests);
  const preferred = preferredModelId?.trim();
  let model = preferred
    ? all.find(
        (candidate) =>
          languageModelSelectionIdentifier(candidate) === preferred ||
          candidate.id === preferred ||
          candidate.name === preferred
      )
    : undefined;
  if (!model) {
    model = (await selectModelAuto()).model;
  }

  const safeMessages = redactAIMessageRuntimePaths(messages, pathIdentities);
  const lmMessages = safeMessages.map((message) => {
    if ('toolCall' in message) {
      return vscode.LanguageModelChatMessage.Assistant([
        new vscode.LanguageModelToolCallPart(
          message.toolCall.callId,
          message.toolCall.name,
          message.toolCall.input
        ),
      ]);
    }
    if ('toolResult' in message) {
      return vscode.LanguageModelChatMessage.User([
        new vscode.LanguageModelToolResultPart(message.toolResult.callId, [
          new vscode.LanguageModelTextPart(
            sanitizePromptText(message.toolResult.content, 96 * 1024)
          ),
        ]),
      ]);
    }
    return message.role === 'user'
      ? vscode.LanguageModelChatMessage.User(sanitizePromptText(message.content, 96 * 1024))
      : vscode.LanguageModelChatMessage.Assistant(sanitizePromptText(message.content, 96 * 1024));
  });
  const requestTokenSource = new vscode.CancellationTokenSource();
  const cancellation = token?.onCancellationRequested(() => requestTokenSource.cancel());
  const timeoutMs = getAIStreamTimeoutMs();
  const timeout = setTimeout(() => requestTokenSource.cancel(), timeoutMs);
  const fallbackModels = all.filter(
    (candidate) =>
      languageModelSelectionIdentifier(candidate) !== languageModelSelectionIdentifier(model)
  );
  const candidates = [model, ...fallbackModels];

  // VS Code only permits Required when exactly one tool is exposed. Studio
  // intentionally gives the model a governed toolset, so multi-tool turns
  // must use Auto and let the session contract reject prose/completion until
  // verified evidence exists. Passing Required with multiple tools terminates
  // the request before the model sees the incident.
  const toolMode =
    tools.length === 1
      ? vscode.LanguageModelChatToolMode.Required
      : vscode.LanguageModelChatToolMode.Auto;

  try {
    let lastError: unknown;
    for (const [index, candidateModel] of candidates.entries()) {
      const modelId = languageModelSelectionIdentifier(candidateModel);
      let text = '';
      try {
        const response = await candidateModel.sendRequest(
          lmMessages,
          {
            justification: 'Resolve the selected Workspai incident through governed Studio tools.',
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
            })),
            toolMode,
          },
          requestTokenSource.token
        );

        for await (const part of response.stream) {
          if (requestTokenSource.token.isCancellationRequested) {
            break;
          }
          const candidate = part as {
            name?: unknown;
            input?: unknown;
            callId?: unknown;
            value?: unknown;
          };
          const isNativeToolCall =
            (typeof vscode.LanguageModelToolCallPart === 'function' &&
              part instanceof vscode.LanguageModelToolCallPart) ||
            (typeof candidate.name === 'string' &&
              typeof candidate.callId === 'string' &&
              candidate.input !== null &&
              typeof candidate.input === 'object');
          if (isNativeToolCall && typeof candidate.name === 'string') {
            return {
              type: 'tool',
              modelId,
              callId:
                typeof candidate.callId === 'string' && candidate.callId.trim()
                  ? candidate.callId
                  : randomUUID(),
              toolName: candidate.name,
              input:
                candidate.input &&
                typeof candidate.input === 'object' &&
                !Array.isArray(candidate.input)
                  ? (candidate.input as Record<string, unknown>)
                  : {},
            };
          }
          if (part instanceof vscode.LanguageModelTextPart) {
            text += part.value;
          } else if (typeof candidate.value === 'string') {
            text += candidate.value;
          }
        }
        if (requestTokenSource.token.isCancellationRequested && !token?.isCancellationRequested) {
          throw new Error(
            `AI tool request timed out after ${timeoutMs}ms for model ${candidateModel.id}.`
          );
        }
        // Text may contain the strict JSON fallback understood by the Studio
        // model protocol. An empty response, however, proves this endpoint
        // cannot participate and should fall through to the next live model.
        if (text.trim()) {
          return { type: 'text', modelId, text };
        }
        lastError = new Error(`Model ${modelId} returned no tool call or text.`);
      } catch (error) {
        lastError = error;
        if (
          token?.isCancellationRequested ||
          requestTokenSource.token.isCancellationRequested ||
          !isRetryableToolModelError(error)
        ) {
          throw error;
        }
      }
      if (index === candidates.length - 1) {
        throw lastError;
      }
    }
    throw lastError ?? new Error('No callable AI model completed the Studio tool request.');
  } finally {
    clearTimeout(timeout);
    cancellation?.dispose();
    requestTokenSource.dispose();
  }
}

/**
 * Send messages to the LM and stream back text.
 * @param messages        – conversation history
 * @param onChunk         – called with each streamed chunk
 * @param token           – cancellation token
 * @param preferredModelId – when provided, use this exact model id chosen by the user
 */
export async function streamAIResponse(
  messages: AIMessage[],
  onChunk: (chunk: AIStreamChunk) => void,
  token?: vscode.CancellationToken,
  preferredModelId?: string
): Promise<{ modelId: string }> {
  const logger = Logger.getInstance();

  const normalizeModelLookupKey = (value: string | undefined): string =>
    (value ?? '').trim().toLowerCase();

  const isRetryableModelRequestError = (err: unknown): boolean => {
    const raw = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
    return /(?:\b(429|rate\s*limit|quota|resource\s*exhausted|temporar(?:y|ily)|unavailable|overloaded|busy|too\s*many\s*requests|service\s*unavailable|model\s*not\s*available|model\s*unavailable|requested\s*model\s*is\s*not\s*supported)\b|model_not_supported)/i.test(
      raw
    );
  };

  const isSameModel = (
    a: { id: string; name?: string },
    b: { id: string; name?: string }
  ): boolean => {
    const aId = normalizeModelLookupKey(a.id);
    const bId = normalizeModelLookupKey(b.id);
    const aName = normalizeModelLookupKey(a.name);
    const bName = normalizeModelLookupKey(b.name);
    return (aId.length > 0 && aId === bId) || (aName.length > 0 && aName === bName);
  };

  const selectFallbackModelForFailure = async (
    failedModel: vscode.LanguageModelChat
  ): Promise<{ model: vscode.LanguageModelChat; modelId: string } | undefined> => {
    // Force re-evaluation to avoid sticky cache repeatedly selecting the failed model.
    resetModelSelectionCache();

    try {
      const auto = await selectModelAuto();
      if (!isSameModel(auto.model, failedModel)) {
        return auto;
      }
    } catch {
      // Continue to raw model registry fallback.
    }

    const all = await vscode.lm.selectChatModels();
    const alternative = all.find((candidate) => !isSameModel(candidate, failedModel));
    if (!alternative) {
      return undefined;
    }

    return {
      model: alternative,
      modelId: alternative.name ?? alternative.id,
    };
  };

  const normalizePreferredModelId = (raw?: string): string | undefined => {
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed;
  };
  const normalizedPreferredModelId = normalizePreferredModelId(preferredModelId);

  let model: vscode.LanguageModelChat;
  let modelId: string;
  try {
    if (normalizedPreferredModelId) {
      const all = await vscode.lm.selectChatModels();
      const found = all.find(
        (m) =>
          languageModelSelectionIdentifier(m) === normalizedPreferredModelId ||
          m.id === normalizedPreferredModelId ||
          (m.name ?? '') === normalizedPreferredModelId
      );
      if (found) {
        model = found;
        modelId = found.name ?? found.id;
        logger.info(`[AI] Using user-selected model: ${model.id}`);
      } else {
        logger.warn(
          `[AI] Requested model "${normalizedPreferredModelId}" not found, falling back to auto`
        );
        ({ model, modelId } = await selectModelAuto());
      }
    } else {
      ({ model, modelId } = await selectModelAuto());
    }
    logger.info(`[AI] Using model: ${model.id} (${modelId})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[AI] Model selection failed: ${msg}`);
    throw err;
  }

  const lmMessages = messages.map((message) => {
    if ('toolCall' in message) {
      return vscode.LanguageModelChatMessage.Assistant([
        new vscode.LanguageModelToolCallPart(
          message.toolCall.callId,
          message.toolCall.name,
          message.toolCall.input
        ),
      ]);
    }
    if ('toolResult' in message) {
      return vscode.LanguageModelChatMessage.User([
        new vscode.LanguageModelToolResultPart(message.toolResult.callId, [
          new vscode.LanguageModelTextPart(
            sanitizePromptText(message.toolResult.content, 96 * 1024)
          ),
        ]),
      ]);
    }
    return message.role === 'user'
      ? vscode.LanguageModelChatMessage.User(sanitizePromptText(message.content, 96 * 1024))
      : vscode.LanguageModelChatMessage.Assistant(sanitizePromptText(message.content, 96 * 1024));
  });

  const requestTimeoutMs = getAIStreamTimeoutMs();

  const streamWithModel = async (
    selected: vscode.LanguageModelChat,
    onEmitChunk?: () => void
  ): Promise<boolean> => {
    const requestTokenSource = new vscode.CancellationTokenSource();
    const cancellationDisposable = token?.onCancellationRequested(() => {
      requestTokenSource.cancel();
    });
    const timeoutHandle = setTimeout(() => {
      logger.warn(
        `[AI] Streaming request timed out after ${requestTimeoutMs}ms for model ${selected.id}`
      );
      requestTokenSource.cancel();
    }, requestTimeoutMs);

    try {
      const response = await selected.sendRequest(lmMessages, {}, requestTokenSource.token);
      let emittedAnyChunk = false;

      for await (const part of response.stream) {
        if (requestTokenSource.token.isCancellationRequested) {
          break;
        }
        if (part instanceof vscode.LanguageModelTextPart) {
          emittedAnyChunk = true;
          onEmitChunk?.();
          onChunk({ text: part.value, done: false });
        }
      }

      if (requestTokenSource.token.isCancellationRequested && !token?.isCancellationRequested) {
        throw new Error(
          `AI request timed out after ${requestTimeoutMs}ms while streaming model ${selected.id}.`
        );
      }

      return emittedAnyChunk;
    } finally {
      clearTimeout(timeoutHandle);
      cancellationDisposable?.dispose();
      requestTokenSource.dispose();
    }
  };

  let selectedModel = model;
  let selectedModelId = modelId;
  let emittedFromPrimary = false;

  try {
    await streamWithModel(selectedModel, () => {
      emittedFromPrimary = true;
    });
  } catch (err) {
    const retryable = isRetryableModelRequestError(err);
    if (token?.isCancellationRequested || !retryable || emittedFromPrimary) {
      throw err;
    }

    logger.warn(
      `[AI] Model request failed for ${selectedModel.id}; retrying with fallback auto model. reason=${err instanceof Error ? err.message : String(err)}`
    );

    const fallback = await selectFallbackModelForFailure(selectedModel);
    if (!fallback) {
      throw err;
    }

    selectedModel = fallback.model;
    selectedModelId = fallback.modelId;
    logger.info(
      `[AI] Retrying stream with fallback model: ${selectedModel.id} (${selectedModelId})`
    );
    await streamWithModel(selectedModel);
  }

  if (!token?.isCancellationRequested) {
    onChunk({ text: '', done: true });
  }
  return { modelId: selectedModelId };
}

/**
 * Convenience wrapper that accumulates the full response and returns it.
 */
export async function askAI(
  messages: AIMessage[],
  token?: vscode.CancellationToken
): Promise<string> {
  let result = '';
  await streamAIResponse(
    messages,
    (chunk) => {
      result += chunk.text;
    },
    token
  );
  return result;
}

// ──────────────────────────────────────────────
// Workspai Architecture Context
// ──────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

export interface AIModalContext {
  type: 'workspace' | 'project' | 'module';
  name: string;
  path?: string;
  framework?: string;
  moduleSlug?: string;
  moduleDescription?: string;
  workspaceRootPath?: string;
  projectRootPath?: string;
  /** Internal bounded override for evidence-rich Studio repair prompts. */
  questionMaxChars?: number;
  prefillQuestion?: string;
  prefillMode?: AIConversationMode;
}

interface AIWorkspaceHealthSummary {
  generatedAt: string | null;
  total: number;
  passed: number;
  warnings: number;
  errors: number;
}

// ─── Kit types detected at runtime ─────────────────────────────────────────
export type RapidKitType = ScaffoldKitId | 'unknown';

export interface InstalledModule {
  slug: string;
  version: string;
  display_name: string;
}

/** Scanned data from the actual project on disk. */
export interface ScannedProjectContext {
  kit: RapidKitType;
  projectName: string;
  projectRoot: string;
  installedModules: InstalledModule[];
  productionDeps: string[]; // key dependency names
  hasAlembic: boolean;
  hasDocker: boolean;
  hasHealthDir: boolean;
  hasDomainLayer: boolean; // src/app/domain exists → DDD
  hasUseCasesDir: boolean;
  topLevelSrcDirs: string[]; // e.g. ['modules', 'health', 'routing']
  configFiles: string[]; // config/*.yaml found
  envFile: string | null;
  // ── v0.18 rich context ─────────────────────────────────────────────────
  dirTree: string; // formatted src/ directory tree
  relevantFiles: Array<{ relPath: string; content: string }>; // key entry-point files
  gitDiff: string | null; // recent uncommitted changes (stat only, truncated)
  runtime: string | null;
  engine: string | null;
  pythonVersion: string | null;
  /** Java version, Go version, or .NET target framework detected from native project files. */
  runtimeVersion: string | null;
  rapidkitCoreVersion: string | null;
  rapidkitCliVersion: string | null;
  workspaceHealth: AIWorkspaceHealthSummary | null;
  detectionConfidence: 'strong' | 'weak' | 'none';
}

interface ProjectContextCacheEntry {
  value: ScannedProjectContext;
  cachedAt: number;
}

const PROJECT_CONTEXT_TTL_MS = 60 * 1000;
const MAX_PROJECT_CACHE_SIZE = 20;
const DEFAULT_PROJECT_DETECTION_TIMEOUT_MS = 2000;
const DEFAULT_GIT_DIFF_TIMEOUT_MS = 3000;
const DEFAULT_LIVE_MODULES_TIMEOUT_MS = 8000;
const DEFAULT_AI_STREAM_TIMEOUT_MS = 45000;
const MIN_COMMAND_TIMEOUT_MS = 1000;
const MAX_COMMAND_TIMEOUT_MS = 60000;
const MAX_AI_STREAM_TIMEOUT_MS = 120000;

const _projectContextCache = new Map<string, ProjectContextCacheEntry>();

function stripXmlBlocks(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return xml.replace(pattern, '');
}

function extractMavenProductionDeps(pomXml: string): string[] {
  if (!pomXml.trim()) {
    return [];
  }

  // Remove blocks that frequently introduce false positives for runtime deps.
  let sanitized = pomXml.replace(/<!--([\s\S]*?)-->/g, '');
  sanitized = stripXmlBlocks(sanitized, 'dependencyManagement');
  sanitized = stripXmlBlocks(sanitized, 'build');
  sanitized = stripXmlBlocks(sanitized, 'profiles');

  const dependencies = [...sanitized.matchAll(/<dependency>([\s\S]*?)<\/dependency>/gi)];
  const deps = new Set<string>();

  for (const entry of dependencies) {
    const body = entry[1] ?? '';
    const artifactId = body
      .match(/<artifactId>([^<]+)<\/artifactId>/i)?.[1]
      ?.trim()
      .toLowerCase();
    if (!artifactId) {
      continue;
    }

    const scope = body
      .match(/<scope>([^<]+)<\/scope>/i)?.[1]
      ?.trim()
      .toLowerCase();
    if (scope === 'test' || scope === 'provided' || scope === 'import') {
      continue;
    }

    deps.add(artifactId);
  }

  return [...deps];
}

function extractJavaVersionFromPom(pomXml: string): string | null {
  const candidates = [
    /<java\.version>(\d+(?:\.\d+(?:\.\d+)?)?)<\/java\.version>/i,
    /<maven\.compiler\.release>(\d+(?:\.\d+(?:\.\d+)?)?)<\/maven\.compiler\.release>/i,
    /<maven\.compiler\.target>(\d+(?:\.\d+(?:\.\d+)?)?)<\/maven\.compiler\.target>/i,
    /<maven\.compiler\.source>(\d+(?:\.\d+(?:\.\d+)?)?)<\/maven\.compiler\.source>/i,
  ];

  for (const pattern of candidates) {
    const match = pomXml.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractDotnetPackageRefs(csprojXml: string): string[] {
  if (!csprojXml.trim()) {
    return [];
  }

  const sanitized = csprojXml.replace(/<!--([\s\S]*?)-->/g, '');
  const deps = new Set<string>();
  const packageRefs = [
    ...sanitized.matchAll(/<PackageReference\b([^>]*)\/?>/gi),
    ...sanitized.matchAll(/<PackageReference\b([^>]*)>([\s\S]*?)<\/PackageReference>/gi),
  ];

  for (const entry of packageRefs) {
    const attrs = entry[1] ?? '';
    const body = entry[2] ?? '';
    const include =
      attrs.match(/\bInclude=["']([^"']+)["']/i)?.[1] ??
      attrs.match(/\bUpdate=["']([^"']+)["']/i)?.[1];
    if (!include) {
      continue;
    }

    const privateAssets =
      attrs.match(/\bPrivateAssets=["']([^"']+)["']/i)?.[1] ??
      body.match(/<PrivateAssets>([^<]+)<\/PrivateAssets>/i)?.[1];
    if (privateAssets?.toLowerCase() === 'all') {
      continue;
    }

    deps.add(include.trim().toLowerCase());
  }

  return [...deps];
}

function extractDotnetTargetFramework(csprojXml: string): string | null {
  const target =
    csprojXml.match(/<TargetFramework>([^<]+)<\/TargetFramework>/i)?.[1] ??
    csprojXml.match(/<TargetFrameworks>([^<]+)<\/TargetFrameworks>/i)?.[1];
  return target?.split(';')[0]?.trim() || null;
}

function getCommandTimeoutMs(fallback: number): number {
  const configured = vscode.workspace
    .getConfiguration('workspai')
    .get<number>('commandTimeoutMs', fallback);

  if (!Number.isFinite(configured)) {
    return fallback;
  }

  return Math.max(MIN_COMMAND_TIMEOUT_MS, Math.min(MAX_COMMAND_TIMEOUT_MS, configured));
}

function getAIStreamTimeoutMs(): number {
  const configured = vscode.workspace
    .getConfiguration('workspai')
    .get<number>('aiStreamTimeoutMs', DEFAULT_AI_STREAM_TIMEOUT_MS);

  if (!Number.isFinite(configured)) {
    return DEFAULT_AI_STREAM_TIMEOUT_MS;
  }

  return Math.max(8000, Math.min(MAX_AI_STREAM_TIMEOUT_MS, configured));
}

/**
 * Scan a project directory and return rich context for the AI prompt.
 * Reads registry.json, pyproject.toml / package.json, and directory structure.
 * Non-throwing — returns partial context on any IO error.
 */
export async function scanProjectContext(
  projectPath: string,
  framework?: string
): Promise<ScannedProjectContext> {
  const resolvedInputPath = projectPath ? path.resolve(projectPath) : projectPath;
  const empty: ScannedProjectContext = {
    kit: 'unknown',
    projectName: path.basename(resolvedInputPath),
    projectRoot: resolvedInputPath,
    installedModules: [],
    productionDeps: [],
    hasAlembic: false,
    hasDocker: false,
    hasHealthDir: false,
    hasDomainLayer: false,
    hasUseCasesDir: false,
    topLevelSrcDirs: [],
    configFiles: [],
    envFile: null,
    dirTree: '',
    relevantFiles: [],
    gitDiff: null,
    runtime: null,
    engine: null,
    pythonVersion: null,
    runtimeVersion: null,
    rapidkitCoreVersion: null,
    rapidkitCliVersion: null,
    workspaceHealth: null,
    detectionConfidence: 'none',
  };

  if (!resolvedInputPath) {
    return empty;
  }

  const cacheKey = `${resolvedInputPath}::${framework ?? 'auto'}`;
  const cached = _projectContextCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < PROJECT_CONTEXT_TTL_MS) {
    return cached.value;
  }

  let resolved: {
    scanRoot: string;
    runtime: string | null;
    engine: string | null;
    detectionConfidence: 'strong' | 'weak' | 'none';
    kitName: string | null;
  };
  try {
    resolved = await resolveProjectScanRoot(
      resolvedInputPath,
      getCommandTimeoutMs(DEFAULT_PROJECT_DETECTION_TIMEOUT_MS)
    );
  } catch (error) {
    Logger.getInstance().warn(
      '[AI] resolveProjectScanRoot failed; falling back to input project path.',
      error
    );
    resolved = {
      scanRoot: resolvedInputPath,
      runtime: null,
      engine: null,
      detectionConfidence: 'none',
      kitName: null,
    };
  }
  const scanRoot = resolved.scanRoot;
  const ctx: ScannedProjectContext = {
    ...empty,
    projectName: path.basename(scanRoot),
    projectRoot: scanRoot,
    runtime: resolved.runtime,
    engine: resolved.engine,
    detectionConfidence: resolved.detectionConfidence,
  };

  // ── helpers ────────────────────────────────────────────────────────────
  const exists = async (rel: string): Promise<boolean> => {
    try {
      await fs.promises.access(path.join(scanRoot, rel));
      return true;
    } catch {
      return false;
    }
  };
  const readJSON = async <T>(rel: string): Promise<T | null> => {
    try {
      return JSON.parse(await fs.promises.readFile(path.join(scanRoot, rel), 'utf8')) as T;
    } catch {
      return null;
    }
  };
  const readText = async (rel: string): Promise<string | null> => {
    try {
      return await fs.promises.readFile(path.join(scanRoot, rel), 'utf8');
    } catch {
      return null;
    }
  };
  const listDir = async (rel: string): Promise<string[]> => {
    try {
      return await fs.promises.readdir(path.join(scanRoot, rel));
    } catch {
      return [];
    }
  };

  const resolvedFramework = normalizeFrameworkHint(framework, resolved);

  const hasPyproject = await exists('pyproject.toml');
  const hasPackageJson = await exists('package.json');
  const hasGoMod = await exists('go.mod');
  const rootEntries = await listDir('');

  let inferredFramework = resolvedFramework;
  if (!inferredFramework) {
    const candidates: AICreateFramework[] = [];
    if (hasPyproject) {
      candidates.push('fastapi');
    }
    if (hasPackageJson) {
      candidates.push('nestjs');
    }
    if (hasGoMod) {
      candidates.push('go');
    }
    if (
      (await exists('pom.xml')) ||
      (await exists('build.gradle')) ||
      (await exists('build.gradle.kts'))
    ) {
      candidates.push('springboot');
    }
    if (rootEntries.some((entry) => entry.endsWith('.csproj') || entry.endsWith('.sln'))) {
      candidates.push('dotnet');
    }

    if (candidates.length === 1) {
      inferredFramework = candidates[0];
    } else if (candidates.length > 1) {
      if (
        resolved.runtime === 'python' ||
        resolved.engine === 'python' ||
        resolved.engine === 'pip'
      ) {
        inferredFramework = 'fastapi';
      } else if (
        resolved.runtime === 'node' ||
        resolved.engine === 'node' ||
        resolved.engine === 'npm'
      ) {
        inferredFramework = 'nestjs';
      } else if (resolved.runtime === 'go' || resolved.engine === 'go') {
        inferredFramework = 'go';
      } else if (
        resolved.runtime === 'java' ||
        resolved.engine === 'java' ||
        resolved.engine === 'mvn'
      ) {
        inferredFramework = 'springboot';
      } else if (
        resolved.runtime === 'dotnet' ||
        resolved.runtime === 'csharp' ||
        resolved.engine === 'dotnet'
      ) {
        inferredFramework = 'dotnet';
      } else if (candidates.includes('dotnet')) {
        inferredFramework = 'dotnet';
      } else if (candidates.includes('springboot')) {
        inferredFramework = 'springboot';
      } else if (candidates.includes('go')) {
        inferredFramework = 'go';
      } else if (candidates.includes('nestjs')) {
        inferredFramework = 'nestjs';
      } else if (candidates.includes('fastapi')) {
        inferredFramework = 'fastapi';
      }
    }
  }

  if (resolved.kitName) {
    ctx.kit = normalizeKitName(resolved.kitName);
  }

  // ── registry.json (installed modules) ─────────────────────────────────
  const registry =
    (await readJSON<{ installed_modules?: InstalledModule[] }>('.workspai/registry.json')) ??
    (await readJSON<{ installed_modules?: InstalledModule[] }>('registry.json')) ??
    (await readJSON<{ installed_modules?: InstalledModule[] }>('.rapidkit/registry.json'));
  if (registry?.installed_modules) {
    ctx.installedModules = registry.installed_modules;
  }

  // ── project layout ─────────────────────────────────────────────────────
  ctx.hasAlembic = (await exists('alembic')) || (await exists('alembic.ini'));
  ctx.hasDocker = (await exists('Dockerfile')) || (await exists('docker-compose.yml'));
  ctx.hasHealthDir = await exists('src/health');
  ctx.hasDomainLayer = await exists('src/app/domain');
  ctx.hasUseCasesDir = await exists('src/app/application/use_cases');
  ctx.topLevelSrcDirs = (await listDir('src')).filter(
    (n) => !n.startsWith('_') && !n.endsWith('.py') && !n.endsWith('.ts')
  );

  // config/*.yaml files
  try {
    ctx.configFiles = (await fs.promises.readdir(path.join(scanRoot, 'config'))).filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml')
    );
  } catch {
    /* no config dir */
  }

  ctx.envFile = (await exists('.env'))
    ? '.env'
    : (await exists('.env.local'))
      ? '.env.local'
      : null;

  // ── kit detection ───────────────────────────────────────────────────────
  if (inferredFramework === 'fastapi') {
    if (ctx.kit === 'unknown') {
      ctx.kit = ctx.hasDomainLayer ? 'fastapi.ddd' : 'fastapi.standard';
    }
    // extract pydantic, sqlalchemy, other prod deps from pyproject.toml
    const pyproj = (await readText('pyproject.toml')) ?? '';
    const depSection = pyproj.split('[tool.poetry.dependencies]')[1]?.split('[')[0] ?? '';
    const deps: string[] = [];
    for (const line of depSection.split('\n')) {
      const m = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
      if (m && m[1] !== 'python') {
        deps.push(m[1].toLowerCase());
      }
    }
    ctx.productionDeps = deps;
  } else if (inferredFramework === 'nestjs') {
    if (ctx.kit === 'unknown') {
      ctx.kit = 'nestjs.standard';
    }
    const pkg = await readJSON<{ dependencies?: Record<string, string> }>('package.json');
    ctx.productionDeps = Object.keys(pkg?.dependencies ?? {});
  } else if (inferredFramework === 'go') {
    const gomod = (await readText('go.mod')) ?? '';
    if (ctx.kit === 'unknown') {
      ctx.kit = gomod.toLowerCase().includes('gofiber') ? 'gofiber.standard' : 'gogin.standard';
    }
    // Parse Go toolchain version from go.mod: "go 1.22.3" or "go 1.22"
    const goVersionMatch = gomod.match(/^go\s+(\d+\.\d+(?:\.\d+)?)$/m);
    if (goVersionMatch) {
      ctx.runtimeVersion = goVersionMatch[1];
    }
  } else if (inferredFramework === 'springboot') {
    if (ctx.kit === 'unknown') {
      ctx.kit = 'springboot.standard';
    }

    const pomXml = (await readText('pom.xml')) ?? '';
    if (pomXml) {
      ctx.productionDeps = extractMavenProductionDeps(pomXml);
      ctx.runtimeVersion = extractJavaVersionFromPom(pomXml);
    }
  } else if (inferredFramework === 'dotnet') {
    if (ctx.kit === 'unknown') {
      ctx.kit = 'dotnet.webapi.clean';
    }
    const csprojName = rootEntries.find((entry) => entry.endsWith('.csproj'));
    const csproj = csprojName ? ((await readText(csprojName)) ?? '') : '';
    if (csproj) {
      ctx.productionDeps = extractDotnetPackageRefs(csproj);
      ctx.runtimeVersion = extractDotnetTargetFramework(csproj);
    }
  }

  // ── v0.18: rich context ──────────────────────────────────────────────────
  ctx.pythonVersion = await resolvePythonVersion(scanRoot, inferredFramework, resolved.runtime);
  ctx.workspaceHealth = await readWorkspaceHealthSummary(scanRoot);
  const versions = await readWorkspaceVersions(scanRoot);
  ctx.rapidkitCoreVersion = versions.core;
  ctx.rapidkitCliVersion = versions.npm;
  ctx.dirTree = await buildDirTree(scanRoot, ctx.topLevelSrcDirs, ctx.kit);
  ctx.relevantFiles = await readRelevantFiles(scanRoot, ctx.kit);
  ctx.gitDiff = await getGitDiffStat(scanRoot, getCommandTimeoutMs(DEFAULT_GIT_DIFF_TIMEOUT_MS));

  _projectContextCache.set(cacheKey, {
    value: ctx,
    cachedAt: Date.now(),
  });

  // Evict oldest entries when cache exceeds max size
  if (_projectContextCache.size > MAX_PROJECT_CACHE_SIZE) {
    const oldestKey = _projectContextCache.keys().next().value;
    if (oldestKey !== undefined) {
      _projectContextCache.delete(oldestKey);
    }
  }

  return ctx;
}

export type { LiveModuleEntry } from './aiLiveModuleCatalog';
export { buildModuleListForPrompt } from './aiLiveModuleCatalog';

async function getWorkspaceAwareLiveModules(
  workspacePath?: string
): Promise<LiveModuleEntry[] | null> {
  try {
    const result = await ModulesCatalogService.getInstance().getModulesCatalog(workspacePath);
    return result.modules.map((module) => ({
      name: module.id,
      display_name: module.name,
      version: module.version,
      category: module.category,
      description: module.description,
      slug: module.slug,
      tags: Array.isArray(module.tags) ? module.tags : [],
    }));
  } catch {
    // The catalog service may not be initialized yet; fall back to direct CLI probing.
  }

  return await fetchLiveModules();
}

export { getWorkspaceAwareLiveModules };

interface LiveModulesCache {
  modules: LiveModuleEntry[];
  fetchedAt: number;
}

/** In-memory TTL cache — avoid repeated shell calls during one session. */
let _liveModulesCache: LiveModulesCache | null = null;
const LIVE_MODULES_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Try to fetch the live module list from the installed rapidkit engine.
 * Strategy:
 *   1. Try the locally installed `rapidkit` binary (fastest, no network).
 *   2. Fall back to `npx --yes rapidkit` via buildNpxRapidkitArgs
 * Returns `null` when rapidkit is not installed or the command fails.
 * Results are cached for `LIVE_MODULES_TTL_MS` to avoid overhead.
 */
export async function fetchLiveModules(): Promise<LiveModuleEntry[] | null> {
  const now = Date.now();
  if (_liveModulesCache && now - _liveModulesCache.fetchedAt < LIVE_MODULES_TTL_MS) {
    return _liveModulesCache.modules;
  }

  const moduleArgs = ['modules', 'list', '--json-schema', '1'];
  const timeout = getCommandTimeoutMs(DEFAULT_LIVE_MODULES_TIMEOUT_MS);

  // 1. Try local rapidkit binary first (no npx overhead, no network risk)
  let res = await run('rapidkit', moduleArgs, { timeout });

  // 2. Fall back to the pinned npm wrapper.
  if (res.exitCode !== 0) {
    res = await run('npx', buildNpxRapidkitArgs(moduleArgs), { timeout });
  }

  if (res.exitCode !== 0) {
    return null;
  }

  try {
    const raw = res.stdout ?? '';
    // The CLI prints a preamble line ("🚀 RapidKit") before the JSON — strip it
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return null;
    }
    let parsed: { modules?: LiveModuleEntry[] };
    try {
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { modules?: LiveModuleEntry[] };
    } catch {
      return null;
    }
    const modules = parsed.modules ?? [];
    _liveModulesCache = { modules, fetchedAt: now };
    return modules;
  } catch {
    return null;
  }
}

/** Invalidate the cache (e.g. after `rapidkit add` installs a new module). */
export function invalidateLiveModulesCache(): void {
  _liveModulesCache = null;
}

export function resetAIServiceCaches(): void {
  _projectContextCache.clear();
  _workspaceModulesCache.clear();
  resetModelSelectionCache();
  _liveModulesCache = null;
}

interface WorkspaceModulesCacheEntry {
  modules: Array<{ slug: string; projects: string[] }>;
  cachedAt: number;
}
const _workspaceModulesCache = new Map<string, WorkspaceModulesCacheEntry>();
const WORKSPACE_MODULES_TTL_MS = 2 * 60 * 1000; // 2 minutes

async function collectWorkspaceInstalledModules(
  workspacePath?: string
): Promise<Array<{ slug: string; projects: string[] }>> {
  if (!workspacePath) {
    return [];
  }

  const root = path.resolve(workspacePath);

  // Cache check — avoid repeated full directory scans in the same session
  const cached = _workspaceModulesCache.get(root);
  if (cached && Date.now() - cached.cachedAt < WORKSPACE_MODULES_TTL_MS) {
    return cached.modules;
  }

  const moduleProjects = new Map<string, Set<string>>();

  const projectCandidates = new Set<string>([root]);
  try {
    const topLevel = await fs.promises.readdir(root, { withFileTypes: true });
    for (const entry of topLevel) {
      if (entry.isDirectory()) {
        projectCandidates.add(path.join(root, entry.name));
      }
    }
  } catch {
    return [];
  }

  for (const candidate of projectCandidates) {
    const projectName = path.basename(candidate);
    const registryPaths = [
      path.join(candidate, '.workspai', 'registry.json'),
      path.join(candidate, 'registry.json'),
      path.join(candidate, '.rapidkit', 'registry.json'),
    ];
    for (const registryPath of registryPaths) {
      try {
        const parsed = JSON.parse(await fs.promises.readFile(registryPath, 'utf8')) as {
          installed_modules?: Array<{ slug?: string }>;
        };
        for (const mod of parsed.installed_modules ?? []) {
          const slug = typeof mod.slug === 'string' ? mod.slug.trim().toLowerCase() : '';
          if (!slug) {
            continue;
          }
          if (!moduleProjects.has(slug)) {
            moduleProjects.set(slug, new Set<string>());
          }
          moduleProjects.get(slug)!.add(projectName);
        }
      } catch {
        // Not every directory is a project; ignore missing/invalid registry files.
      }
    }
  }

  const modules = [...moduleProjects.entries()]
    .map(([slug, projects]) => ({ slug, projects: [...projects].sort() }))
    .sort((a, b) => b.projects.length - a.projects.length || a.slug.localeCompare(b.slug));

  _workspaceModulesCache.set(root, { modules, cachedAt: Date.now() });
  return modules;
}

function buildWorkspaceInstalledModulesSection(
  installedElsewhere: Array<{ slug: string; projects: string[] }>
): string {
  if (installedElsewhere.length === 0) {
    return 'No installed-module signals from sibling projects were detected in this workspace.';
  }
  const lines = installedElsewhere.slice(0, 20).map((entry) => {
    const scope = entry.projects.slice(0, 4).join(', ');
    return `  - ${entry.slug} (seen in ${entry.projects.length} project(s): ${scope})`;
  });
  return `Installed modules already present in this workspace (prefer reuse when relevant):\n${lines.join('\n')}`;
}

/**
 * Backward-compatible export that delegates to the extracted system prompt builder.
 * Accepts an optional contract for persona-aware adaptation.
 */
export async function buildWorkspaiSystemPrompt(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  contract?: AIContextContractV1,
  liveModules?: LiveModuleEntry[] | null
): Promise<string> {
  return buildWorkspaiSystemPromptInternal(ctx, scanned, contract, liveModules);
}

// Re-export contract types for convenience
export type { AIContextContractV1, DoctorEvidenceSnapshot } from './aiContextContract';
export { buildContextContractFromEvidence, validateContextContract } from './aiContextContract';

// ─── buildAIModalUserMessage ────────────────────────────────────────────────

/**
 * Backward-compatible export that delegates to the extracted prompt message builder.
 */
export async function buildAIModalUserMessage(
  mode: AIConversationMode,
  question: string,
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): Promise<string> {
  return buildAIModalUserMessageInternal(mode, question, ctx, scanned);
}

function deriveDoctorSnapshotFromScannedContext(
  scanned?: ScannedProjectContext
): DoctorEvidenceSnapshot | undefined {
  if (!scanned?.workspaceHealth?.generatedAt) {
    return undefined;
  }

  const health = scanned.workspaceHealth;
  const total = Number.isFinite(health.total) ? health.total : 0;
  const passed = Number.isFinite(health.passed) ? health.passed : 0;
  const warnings = Number.isFinite(health.warnings) ? health.warnings : 0;
  const errors = Number.isFinite(health.errors) ? health.errors : 0;
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    generatedAt: health.generatedAt ?? undefined,
    health: {
      total,
      passed,
      warnings,
      errors,
      percent,
    },
    projectCount: 0,
    projects: [],
    fixCommands: [],
  };
}

export async function prepareAIConversation(
  mode: AIConversationMode,
  question: string,
  ctx: AIModalContext,
  history: AIConversationHistoryEntry[] = [],
  doctorSnapshot?: DoctorEvidenceSnapshot
): Promise<PreparedAIConversation> {
  const projectBootstrap = await bootstrapProjectAgent({
    projectPath: ctx.projectRootPath ?? (ctx.type === 'project' ? ctx.path : undefined),
    workspacePath: ctx.workspaceRootPath,
    consumer: 'generic',
  });
  let scanned: ScannedProjectContext | undefined;
  const broadSourceScanAllowed =
    projectBootstrap.status === 'not-applicable' || projectBootstrap.status === 'ready';
  if (ctx.path && broadSourceScanAllowed) {
    try {
      scanned = await scanProjectContext(ctx.path, ctx.framework);
    } catch (err) {
      Logger.getInstance().warn(
        `[AI] scanProjectContext failed for ${ctx.path}: ${err instanceof Error ? err.message : String(err)}`
      );
      scanned = undefined;
    }
  }

  const effectiveDoctorSnapshot = doctorSnapshot ?? deriveDoctorSnapshotFromScannedContext(scanned);
  const contract = buildContextContractFromEvidence(ctx, scanned, effectiveDoctorSnapshot);
  const validation = validateContextContract(contract);

  // If clarification is needed the system prompt should still be assembled — the
  // persona adapter block already includes the appropriate warning text.
  // The caller (welcomePanel) can inspect the validation result separately.
  void validation; // surfaced via telemetry, not blocking

  const historyMessages: AIMessage[] = history.slice(-8).map((entry) => ({
    role: entry.role,
    content: sanitizePromptText(entry.content, 8000),
  }));

  const sanitizedQuestion = sanitizePromptText(
    question,
    Math.min(Math.max(ctx.questionMaxChars ?? 8000, 1000), 96 * 1024)
  );

  const workspacePath =
    resolveWorkspacePathForGrounding(ctx) ??
    ctx.workspaceRootPath ??
    (ctx.type === 'workspace' ? ctx.path : undefined);
  const liveModules = await getWorkspaceAwareLiveModules(workspacePath);
  const pathIdentities: AIMessagePathIdentity[] = [
    { path: ctx.projectRootPath, token: '$PROJECT' },
    {
      path: ctx.type === 'project' ? ctx.path : undefined,
      token: '$PROJECT',
    },
    { path: scanned?.projectRoot, token: '$PROJECT' },
    { path: ctx.workspaceRootPath, token: '$WORKSPACE' },
    {
      path: ctx.type === 'workspace' ? ctx.path : undefined,
      token: '$WORKSPACE',
    },
  ];
  const redactPrompt = (value: string): string =>
    redactKnownRuntimePathsForConsumer(value, pathIdentities);
  const systemPrompt = redactPrompt(
    await buildWorkspaiSystemPromptInternal(ctx, scanned, contract, liveModules)
  );
  const userPrompt = redactPrompt(
    await buildAIModalUserMessageInternal(mode, sanitizedQuestion, ctx, scanned)
  );
  const safeHistoryMessages = redactAIMessageRuntimePaths(historyMessages, pathIdentities);

  return {
    scanned,
    projectBootstrap,
    contract,
    validation,
    messages: [
      {
        role: 'user',
        content: systemPrompt,
      },
      {
        role: 'assistant',
        content: 'Understood. I will follow Workspai standards and real project context.',
      },
      ...safeHistoryMessages,
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  };
}

// ─── selectModel: respects workspai.preferredModel VS Code setting ──────────

/**
 * Backward-compatible export that delegates to the extracted model selector.
 */
export async function selectModelWithPreference(): Promise<{
  model: vscode.LanguageModelChat;
  modelId: string;
}> {
  return selectModelWithPreferenceInternal();
}

// ─── AI-powered Workspace / Project Creation ────────────────────────────────

export type AICreateProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';
export type AICreateFramework = ScaffoldFramework;

export interface AICreationPlan {
  type: 'workspace' | 'project';
  workspaceName: string;
  profile: AICreateProfile;
  installMethod: 'auto' | 'poetry' | 'venv' | 'pipx';
  framework: AICreateFramework;
  kit: string;
  projectName: string;
  suggestedModules: string[];
  description: string;
  secondaryProject?: {
    framework: AICreateFramework;
    kit: string;
    projectName: string;
  };
}

export class UnsupportedCreationStackError extends Error {
  readonly stackLabel: string;
  readonly capability?: CreatePlannerCapability;

  constructor(stackLabel: string, capability?: CreatePlannerCapability) {
    super(
      `${stackLabel} is not available as a Workspai create target yet. Create an empty governed workspace, then add or adopt your ${stackLabel} project so Workspai can index it, generate workspace intelligence, and keep agents aligned.`
    );
    this.name = 'UnsupportedCreationStackError';
    this.stackLabel = stackLabel;
    this.capability = capability;
  }
}

const VALID_PROFILES = new Set<AICreateProfile>([
  'minimal',
  'python-only',
  'node-only',
  'go-only',
  'java-only',
  'dotnet-only',
  'polyglot',
  'enterprise',
]);

const VALID_INSTALL_METHODS = new Set<AICreationPlan['installMethod']>([
  'auto',
  'poetry',
  'venv',
  'pipx',
]);

const FRAMEWORK_TO_KITS: Record<ScaffoldFramework, string[]> = {
  fastapi: ['fastapi.standard', 'fastapi.ddd'],
  nestjs: ['nestjs.standard'],
  go: ['gofiber.standard', 'gogin.standard'],
  springboot: ['springboot.standard'],
  dotnet: ['dotnet.webapi.clean'],
  rust: ['rust.axum'],
  laravel: ['php.laravel'],
  tauri: ['desktop.tauri'],
  electron: ['desktop.electron'],
  'vscode-extension': ['extension.vscode'],
  nextjs: ['frontend.nextjs'],
  remix: ['frontend.remix'],
  'vite-react': ['frontend.vite-react'],
  'vite-vue': ['frontend.vite-vue'],
  'vite-svelte': ['frontend.vite-svelte'],
  'vite-solid': ['frontend.vite-solid'],
  'vite-vanilla': ['frontend.vite-vanilla'],
  nuxt: ['frontend.nuxt'],
  angular: ['frontend.angular'],
  astro: ['frontend.astro'],
  sveltekit: ['frontend.sveltekit'],
};

const STATIC_MODULE_SLUGS = new Set<string>([
  'free/essentials/settings',
  'free/essentials/logging',
  'free/essentials/middleware',
  'free/essentials/deployment',
  'free/auth/core',
  'free/auth/oauth',
  'free/auth/session',
  'free/auth/passwordless',
  'free/auth/api_keys',
  'free/database/db_postgres',
  'free/database/db_mongo',
  'free/database/db_sqlite',
  'free/cache/redis',
  'free/security/cors',
  'free/security/security_headers',
  'free/security/rate_limiting',
  'free/observability/core',
  'free/users/users_core',
  'free/users/users_profiles',
  'free/business/storage',
  'free/billing/stripe_payment',
  'free/billing/cart',
  'free/billing/inventory',
  'free/communication/notifications',
  'free/communication/email',
  'free/tasks/celery',
  'free/ai/ai_assistant',
]);

/**
 * Extract the first JSON object from a potentially markdown-wrapped LLM response.
 */
function extractJSON(text: string): string {
  // Strip ```json ... ``` or ``` ... ``` code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    return fenced[1].trim();
  }
  // Bare JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

/**
 * Map a framework string to the default profile.
 */
function defaultProfile(fw: ScaffoldFramework): AICreateProfile {
  if (
    isFrontendScaffoldFramework(fw) ||
    fw === 'nestjs' ||
    fw === 'electron' ||
    fw === 'vscode-extension'
  ) {
    return 'node-only';
  }
  if (fw === 'go') {
    return 'go-only';
  }
  if (fw === 'springboot') {
    return 'java-only';
  }
  if (fw === 'dotnet') {
    return 'dotnet-only';
  }
  if (fw === 'rust' || fw === 'tauri' || fw === 'laravel') {
    return 'minimal';
  }
  return 'python-only';
}

function isCreateFramework(value: unknown): value is ScaffoldFramework {
  return typeof value === 'string' && isScaffoldFramework(value);
}

function normalizeCreationFramework(value: unknown, frameworkHint?: string): ScaffoldFramework {
  if (isCreateFramework(value)) {
    return value;
  }
  if (isCreateFramework(frameworkHint)) {
    return frameworkHint;
  }
  return 'fastapi';
}

function defaultKitForFramework(framework: ScaffoldFramework): string {
  if (isFrontendScaffoldFramework(framework)) {
    return frontendKitIdForFramework(framework);
  }
  if (framework === 'nestjs') {
    return 'nestjs.standard';
  }
  if (framework === 'go') {
    return 'gofiber.standard';
  }
  if (framework === 'springboot') {
    return 'springboot.standard';
  }
  if (framework === 'dotnet') {
    return 'dotnet.webapi.clean';
  }
  if (framework === 'rust') {
    return 'rust.axum';
  }
  if (framework === 'laravel') {
    return 'php.laravel';
  }
  if (framework === 'tauri') {
    return 'desktop.tauri';
  }
  if (framework === 'electron') {
    return 'desktop.electron';
  }
  if (framework === 'vscode-extension') {
    return 'extension.vscode';
  }
  return 'fastapi.standard';
}

function labelCreatePlannerCapability(capability: CreatePlannerCapability): string {
  const resolved = capability.resolved ?? capability.requested;
  const labels: Record<string, string> = {
    'wordpress-site': 'WordPress',
    'wordpress-block': 'WordPress block',
    'php.laravel': 'Laravel',
    symfony: 'Symfony',
    rails: 'Rails',
    php: 'PHP',
    ruby: 'Ruby',
    rust: 'Rust',
    elixir: 'Elixir',
    clojure: 'Clojure',
    scala: 'Scala',
    kotlin: 'Kotlin',
  };

  return labels[resolved] ?? labels[capability.requested] ?? resolved;
}

function detectUnsupportedCreationStack(
  prompt: string,
  frameworkHint?: string
): CreatePlannerCapability | null {
  const capability = resolveCreateCapabilityFromPrompt(prompt, frameworkHint);
  if (capability && !capability.canExecuteCreate) {
    return capability;
  }

  return null;
}

function normalizeCreationKit(kit: unknown, framework: ScaffoldFramework): string {
  if (typeof kit === 'string' && FRAMEWORK_TO_KITS[framework].includes(kit)) {
    return kit;
  }
  return defaultKitForFramework(framework);
}

function normalizeCreationProfile(profile: unknown, framework: ScaffoldFramework): AICreateProfile {
  if (typeof profile === 'string' && VALID_PROFILES.has(profile as AICreateProfile)) {
    return profile as AICreateProfile;
  }
  return defaultProfile(framework);
}

export function resolveCreationProfile(profile: unknown, framework: unknown): AICreateProfile {
  return normalizeCreationProfile(profile, normalizeCreationFramework(framework));
}

function normalizeInstallMethod(value: unknown): AICreationPlan['installMethod'] {
  if (
    typeof value === 'string' &&
    VALID_INSTALL_METHODS.has(value as AICreationPlan['installMethod'])
  ) {
    return value as AICreationPlan['installMethod'];
  }
  return 'auto';
}

function normalizeSecondaryProject(
  raw: unknown,
  prompt: string,
  primaryFramework: ScaffoldFramework,
  stackIntent?: import('./creationStackIntent').CreationStackIntent
): AICreationPlan['secondaryProject'] | undefined {
  const heuristicFallback = () =>
    inferPolyglotCompanionProject(prompt, primaryFramework, stackIntent);

  const reconcileWithExplicitIntent = (
    candidate: AICreationPlan['secondaryProject'] | undefined
  ): AICreationPlan['secondaryProject'] | undefined => {
    const explicitFrameworks = inferExplicitCreationFrameworks(prompt);
    const explicitCompanion = explicitFrameworks.find(
      (framework) => framework !== primaryFramework
    );
    if (!explicitCompanion) {
      return candidate;
    }

    const fallback = heuristicFallback();
    const projectName = sanitizeKebab(
      candidate?.projectName || fallback?.projectName || 'companion-project'
    );
    return {
      framework: explicitCompanion,
      kit: normalizeCreationKit(undefined, explicitCompanion),
      projectName,
    };
  };

  if (!raw || typeof raw !== 'object') {
    return reconcileWithExplicitIntent(heuristicFallback());
  }

  const record = raw as Record<string, unknown>;
  const framework = normalizeCreationFramework(record.framework, undefined);
  const kit = normalizeCreationKit(record.kit, framework);
  const projectName = sanitizeKebab(
    typeof record.projectName === 'string' ? record.projectName : 'companion-project'
  );

  if (framework === primaryFramework) {
    return reconcileWithExplicitIntent(heuristicFallback());
  }

  return reconcileWithExplicitIntent({ framework, kit, projectName });
}

export function validateCreationPlanForExecution(plan: AICreationPlan): AICreationPlan {
  if (!isCreateFramework(plan.framework)) {
    throw new Error(`Unsupported project framework in creation plan: ${String(plan.framework)}`);
  }
  if (!FRAMEWORK_TO_KITS[plan.framework].includes(plan.kit)) {
    throw new Error(
      `Creation plan kit ${plan.kit} does not belong to framework ${plan.framework}.`
    );
  }
  if (plan.secondaryProject) {
    const secondary = plan.secondaryProject;
    if (!isCreateFramework(secondary.framework)) {
      throw new Error(
        `Unsupported companion framework in creation plan: ${String(secondary.framework)}`
      );
    }
    if (!FRAMEWORK_TO_KITS[secondary.framework].includes(secondary.kit)) {
      throw new Error(
        `Companion kit ${secondary.kit} does not belong to framework ${secondary.framework}.`
      );
    }
    if (secondary.framework === plan.framework) {
      throw new Error('Primary and companion projects must use different framework lanes.');
    }
  }
  return plan;
}

function normalizeSuggestedModules(
  modules: unknown,
  liveModules: LiveModuleEntry[] | null,
  framework?: ScaffoldFramework
): string[] {
  // Go, Spring Boot, .NET, and frontend kits do not support the RapidKit module marketplace.
  if (
    framework === 'go' ||
    framework === 'springboot' ||
    framework === 'dotnet' ||
    framework === 'rust' ||
    framework === 'laravel' ||
    isDesktopScaffoldFramework(framework) ||
    isExtensionScaffoldFramework(framework) ||
    (framework && isFrontendScaffoldFramework(framework))
  ) {
    return [];
  }

  const allowedSet = liveModules?.length
    ? new Set(liveModules.map((m) => m.slug))
    : STATIC_MODULE_SLUGS;
  const allowedList = [...allowedSet];

  const normalized = Array.isArray(modules)
    ? modules
        .filter((m): m is string => typeof m === 'string')
        .map((m) => m.trim().toLowerCase())
        .filter((m) => /^(?:[a-z0-9-]+)\/[a-z0-9_-]+\/[a-z0-9_-]+$/.test(m))
        .map((m) => {
          if (allowedSet.has(m)) {
            return m;
          }
          return findClosestModuleSlug(m, allowedList);
        })
        .filter((m): m is string => Boolean(m))
    : [];

  const unique = [...new Set(normalized)].slice(0, 6);
  if (!unique.includes('free/essentials/settings')) {
    unique.unshift('free/essentials/settings');
  }
  return unique.slice(0, 6);
}

function findClosestModuleSlug(input: string, allowed: string[]): string | null {
  if (allowed.length === 0) {
    return null;
  }

  let bestSlug: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of allowed) {
    const distance = levenshteinDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlug = candidate;
    }
  }

  // Keep correction conservative: only near-miss typos are auto-corrected.
  return bestDistance <= 4 ? bestSlug : null;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

/**
 * Parse the user's natural-language description into a structured creation plan.
 * Uses the LLM API (non-streaming) with a strict JSON system prompt.
 */
export async function parseCreationIntent(
  prompt: string,
  mode: 'workspace' | 'project',
  frameworkHint?: string,
  workspacePath?: string,
  token?: vscode.CancellationToken,
  textProvider?: (
    messages: AIMessage[],
    token?: vscode.CancellationToken
  ) => Promise<{ text: string; modelId: string }>,
  stackIntent?: import('./creationStackIntent').CreationStackIntent
): Promise<{ plan: AICreationPlan; modelId: string; planSource: 'llm' | 'heuristic' }> {
  const logger = Logger.getInstance();
  const unsupportedCapability = detectUnsupportedCreationStack(prompt, frameworkHint);
  if (unsupportedCapability) {
    throw new UnsupportedCreationStackError(
      labelCreatePlannerCapability(unsupportedCapability),
      unsupportedCapability
    );
  }

  const liveModules = await getWorkspaceAwareLiveModules(workspacePath);
  const modulesSection = buildModuleListForPrompt(liveModules);
  const installedElsewhere = await collectWorkspaceInstalledModules(workspacePath);
  const installedElsewhereSection = buildWorkspaceInstalledModulesSection(installedElsewhere);

  const SYSTEM = `You are a Workspai project scaffolding assistant. Parse the user description and respond with ONLY a valid JSON object — no markdown, no explanation.

Available workspace profiles:
  "minimal"      — files only, no runtime
  "python-only"  — Python backend (FastAPI)
  "node-only"    — Node.js backend or frontend apps
  "go-only"      — Go backend
  "java-only"    — Java backend (Spring Boot)
  "dotnet-only"  — .NET backend
  "polyglot"     — mixed Python + Node + Go + Java
  "enterprise"   — multi-team governance

Available frameworks:
  Backend: "fastapi" | "nestjs" | "go" | "springboot" | "dotnet" | "rust" | "laravel"
  Frontend: "nextjs" | "remix" | "vite-react" | "vite-vue" | "vite-svelte" | "vite-solid" | "vite-vanilla" | "nuxt" | "angular" | "astro" | "sveltekit"
  Desktop: "tauri" | "electron"
  Extension: "vscode-extension"

Unsupported create targets:
  WordPress, Symfony, Ruby / Rails, and unlisted ecosystems are not executable create targets.
  Never translate these requests into an unrelated available kit.
  If the user explicitly asks for an unsupported stack, the host will stop the create flow and guide them to create/adopt/import instead.

Available kits (use EXACT names):
  "fastapi.standard"  — FastAPI flat structure (default for Python)
  "fastapi.ddd"       — FastAPI clean-architecture DDD (use for complex/layered/domain-driven)
  "nestjs.standard"   — NestJS feature module (default for Node backend)
  "gofiber.standard"  — Go + Fiber v2 HTTP (fast, minimal)
  "gogin.standard"    — Go + Gin HTTP (classic REST)
  "springboot.standard" — Spring Boot service (default for Java)
  "dotnet.webapi.clean" — .NET Web API clean architecture service (default for C#)
  "rust.axum" — Rust Axum backend
  "php.laravel" — Laravel via the official Composer generator
  "desktop.tauri" | "desktop.electron"
  "extension.vscode"
  "frontend.nextjs" | "frontend.remix" | "frontend.vite-react" | "frontend.vite-vue" | "frontend.vite-svelte" | "frontend.vite-solid" | "frontend.vite-vanilla" | "frontend.nuxt" | "frontend.angular" | "frontend.astro" | "frontend.sveltekit"

${modulesSection}

${installedElsewhereSection}

IMPORTANT — slugs shown above are the ONLY valid values. Do NOT invent slugs. If unsure, omit.
LEGACY REMOVED — old slugs like free/users/users, free/observability/observability_core are invalid; use the exact slugs listed above.

Required JSON schema (return EXACTLY this):
{
  "workspaceName": "<kebab-case, 2-30 chars, reflects the product>",
  "profile": "<one of the profiles above>",
  "installMethod": "auto",
  "framework": "<framework id>",
  "kit": "<kit name>",
  "projectName": "<kebab-case service name, e.g. product-api>",
  "suggestedModules": ["<slug>", ...],
  "description": "<one sentence describing what this project does>",
  "secondaryProject": {
    "framework": "<companion framework id>",
    "kit": "<companion kit name>",
    "projectName": "<kebab-case companion name>"
  }
}

Rules:
- For fastapi/nestjs, ALWAYS include "free/essentials/settings" in suggestedModules
- For go/springboot/dotnet/rust/laravel/frontend/desktop/extension frameworks, set suggestedModules to []
- Use fastapi.ddd kit when: DDD / clean-arch / domain / layered / complex mentioned
- Use polyglot profile when: full-stack / polyglot / frontend+backend / multiple runtimes mentioned
- Choose the smallest accurate stack from the user's wording; do not blindly convert product-domain requests into full-stack
- Use frontend-only when the user asks for UI, dashboard, website, frontend, landing pages, or client app without backend/API needs
- Use backend-only when the user asks for API, backend, service, database, integration service, or automation without UI/client needs
- Use polyglot profile when both a user-facing app and backend/API/data workflow are requested or clearly implied
- For polyglot / full-stack workspace mode, include secondaryProject with the companion stack (frontend + API)
- Omit secondaryProject when only one runtime is needed
- Use enterprise profile when: enterprise / compliance / multi-team / audit mentioned WITHOUT full-stack intent
- Frontend frameworks (nextjs, vite-*, nuxt, angular, astro, sveltekit, remix) → profile node-only, kit frontend.*, projectName ends with -app
- Backend APIs → projectName ends with -api (or -service for go/springboot/dotnet)
- Profile follows framework unless polyglot / enterprise intent is explicit
- Include db module when: database / postgres / mongo / store / persist mentioned
- Include auth module when: auth / user / login / jwt / oauth / session mentioned
- Include redis when: cache / redis / session / rate-limit mentioned
- workspaceName reflects the product domain (e.g. "invoice-tracker", "ecommerce-platform")
- projectName is the first project in the workspace (e.g. "product-api", "marketing-app", "billing-service")`;

  const USER = [
    frameworkHint ? `Framework: ${frameworkHint}` : '',
    stackIntent && stackIntent !== 'balanced' ? `Stack intent: ${stackIntent}` : '',
    `Mode: ${mode}`,
    `Description: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n');

  let rawText = '';
  let modelId = 'heuristic';
  let planSource: 'llm' | 'heuristic' = 'heuristic';

  try {
    if (textProvider) {
      const response = await textProvider(
        [
          { role: 'user', content: SYSTEM },
          { role: 'assistant', content: 'I will respond with only the JSON object.' },
          { role: 'user', content: USER },
        ],
        token
      );
      modelId = response.modelId;
      rawText = response.text;
    } else {
      const { model, modelId: selectedModelId } = await selectModelAuto();
      modelId = selectedModelId;
      const lmMessages = [
        vscode.LanguageModelChatMessage.User(SYSTEM),
        vscode.LanguageModelChatMessage.Assistant('I will respond with only the JSON object.'),
        vscode.LanguageModelChatMessage.User(USER),
      ];
      const response = await model.sendRequest(lmMessages, {}, token);
      rawText = await readLanguageModelResponseText(response, token);
    }
    if (rawText.trim()) {
      planSource = 'llm';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[AI] Creation intent LLM request failed, using heuristic planner: ${msg}`);
  }

  // Parse JSON with graceful fallback
  let parsed: Partial<AICreationPlan> = {};
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(extractJSON(rawText));
    } catch {
      logger.warn('[AI] Creation intent JSON parse failed, using heuristic planner');
      parsed = buildHeuristicCreationDraft(prompt, mode, frameworkHint, stackIntent);
      planSource = 'heuristic';
    }
  } else {
    logger.warn('[AI] Creation intent LLM returned empty text, using heuristic planner');
    parsed = buildHeuristicCreationDraft(prompt, mode, frameworkHint, stackIntent);
    planSource = 'heuristic';
  }

  const heuristicDraft = buildHeuristicCreationDraft(prompt, mode, frameworkHint, stackIntent);
  const explicitFrameworks = inferExplicitCreationFrameworks(prompt);
  const parsedFramework = normalizeCreationFramework(parsed.framework, frameworkHint);
  const fw =
    explicitFrameworks.length > 0 && !explicitFrameworks.includes(parsedFramework)
      ? heuristicDraft.framework
      : parsedFramework;
  const rawName = addWspSuffix(sanitizeKebab(parsed.workspaceName ?? 'my-workspace'));
  const uniqueName = await resolveUniqueWorkspaceName(rawName);
  const heuristicProfile = heuristicDraft.profile;
  const inferredStackIntent = inferStackIntentFromPrompt(prompt.toLowerCase(), stackIntent);
  const companionStackIntent = stackIntent;
  const plan: AICreationPlan = {
    type: mode,
    workspaceName: uniqueName,
    profile:
      mode === 'workspace'
        ? inferredStackIntent === 'polyglot'
          ? 'polyglot'
          : normalizeCreationProfile(parsed.profile ?? heuristicProfile, fw)
        : normalizeCreationProfile(parsed.profile, fw),
    installMethod: normalizeInstallMethod(parsed.installMethod),
    framework: fw,
    kit: normalizeCreationKit(parsed.kit, fw),
    projectName: sanitizeKebab(parsed.projectName ?? 'api'),
    suggestedModules: normalizeSuggestedModules(parsed.suggestedModules, liveModules, fw),
    description:
      typeof parsed.description === 'string' && parsed.description.trim()
        ? parsed.description.trim().slice(0, 240)
        : prompt.trim().slice(0, 240),
    secondaryProject:
      mode === 'workspace'
        ? normalizeSecondaryProject(parsed.secondaryProject, prompt, fw, companionStackIntent)
        : undefined,
  };

  return { plan: validateCreationPlanForExecution(plan), modelId, planSource };
}

/**
 * Resolve a unique workspace name by checking if the default installation
 * directory (~/.workspai/workspaces/<name>) already exists on disk.
 * If it does, append -2, -3, ... until a free slot is found.
 */
async function resolveUniqueWorkspaceName(name: string): Promise<string> {
  const base = getCanonicalWorkspacesDirectory();
  let candidate = name;
  let counter = 2;
  // Safety cap: stop after 99 attempts to avoid infinite loop.
  while (counter <= 99) {
    try {
      await fs.promises.access(path.join(base, candidate));
      // Directory exists — try next suffix.
      // Strip any previous numeric suffix (-2, -3 …) before appending new one.
      const baseName = name.replace(/-\d+(-wsp)?$/, '').replace(/-wsp$/, '');
      candidate = `${baseName}-${counter}-wsp`;
      counter++;
    } catch {
      // access() threw → path does not exist → candidate is free.
      break;
    }
  }
  return candidate;
}

/** Ensure workspace name always ends with -wsp (convention across all RapidKit workspaces). */
function addWspSuffix(name: string): string {
  return name.endsWith('-wsp') ? name : `${name}-wsp`;
}

/** Ensure a string is safe kebab-case. */
function sanitizeKebab(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'my-project'
  );
}
