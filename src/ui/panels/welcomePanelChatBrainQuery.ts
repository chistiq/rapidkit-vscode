import * as vscode from 'vscode';

import type { AIActionContract } from '../../core/aiActionContract';
import type { WebviewFromExtensionMessage } from '../../contracts/webviewProtocol';
import { buildRapidkitDisplayCommand } from '../../utils/platformCapabilities';
import { publishStudioAIActionContractFromText } from './incidentStudioAIActionBridge';
import {
  buildIncidentMemoryPromptHint,
  prependIncidentMemoryReuseBlock,
  shouldAttachIncidentMemoryReuse,
  type IncidentMemoryReuseSnapshot,
  type IncidentRepeatSignal,
} from './incidentStudioMemory';
import { classifyIncidentActionPolicy } from './incidentStudioPromptPolicy';
import type { RoutingResult } from './incidentRouting';
import {
  buildChatBrainFallbackBoard,
  deriveChatBrainFailureCode,
  isRetryableChatBrainError,
} from './welcomePanelChatBrainFallback';
import {
  trackChatBrainRequestComplete,
  trackChatBrainRequestStart,
} from './welcomePanelChatBrainTracking';
import {
  buildStructuredIncidentPrompt,
  type StructuredIncidentPromptHost,
} from './welcomePanelStructuredIncidentPrompt';
import { normalizeRequestedModelId } from './welcomePanel.shared.js';

export type ChatBrainConversation = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
  startedAt: number;
  lastActivityAt: number;
  phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  queryCount: number;
  actionCount: number;
  verifyPassedAt?: number;
  repeatedIncidentDetected?: boolean;
  framework?: string;
  scopeMode?: 'workspace' | 'project';
  importedIncidentReplay?: {
    packId: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
    importedFrom?: string;
  };
  lastActionResponseText?: string;
  lastScopeKnown?: boolean;
  lastUnknownScopeMutationBlocked?: boolean;
};

export type ChatBrainQueryHost = {
  structuredIncidentPromptHost: StructuredIncidentPromptHost;
  chatBrainConversations: Map<string, ChatBrainConversation>;
  chatBrainInFlightRequestIds: Set<string>;
  chatBrainCompletedRequestIds: Set<string>;
  getChatBrainQueryTokenSource: () => vscode.CancellationTokenSource | undefined;
  setChatBrainQueryTokenSource: (value: vscode.CancellationTokenSource | undefined) => void;
  getActiveChatBrainRequestId: () => string | undefined;
  setActiveChatBrainRequestId: (value: string | undefined) => void;
  getActiveChatBrainConversationId: () => string | undefined;
  setActiveChatBrainConversationId: (value: string | undefined) => void;
  postChatBrainWebviewMessage: (message: WebviewFromExtensionMessage) => void;
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>;
  routeActionTypeFromMessage: (message: string) => RoutingResult;
  trackStudioEvent: (
    eventName: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) => void;
  buildIncidentMemoryReuseSnapshot: (input: {
    workspacePath?: string;
    queryText?: string;
    actionType?: string;
  }) => Promise<IncidentMemoryReuseSnapshot | null>;
  detectIncidentRepeatSignal: (input: {
    workspacePath: string;
    queryText?: string;
    actionType?: string;
  }) => Promise<IncidentRepeatSignal | null>;
  buildChatBrainAIContext: (options?: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeIntent?: 'workspace' | 'project';
  }) => Promise<import('../../core/aiService').AIModalContext>;
  readDoctorEvidenceSnapshot: (
    workspacePath?: string,
    options?: { projectPath?: string }
  ) => Promise<import('./incidentStudioDoctorEvidence').DoctorEvidenceSnapshot | undefined>;
  getChatBrainPrimaryActionLabel: (actionType: string, projectName?: string) => string;
  buildSuggestedQuestions: (
    actionType: string,
    message: string,
    scopeIntent?: 'workspace' | 'project'
  ) => string[];
  setLatestDashboardAIAction: (contract: AIActionContract | null, actionId: string | null) => void;
};

export type ChatBrainQueryPayload = Record<string, unknown>;

export async function handleAiChatQuery(
  host: ChatBrainQueryHost,
  data: ChatBrainQueryPayload,
  requestId?: string
): Promise<void> {
  const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  const normalizedRequestId =
    typeof requestId === 'string' && requestId.trim() ? requestId.trim() : undefined;
  const requestedModelId = normalizeRequestedModelId(data?.modelId);

  if (!conversationId || !message) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId: conversationId ?? '',
        code: 'INVALID_INPUT',
        message: 'conversationId and message are required.',
        retryable: true,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  if (!trackChatBrainRequestStart(normalizedRequestId, host.chatBrainInFlightRequestIds)) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatPartialFailure',
      data: {
        conversationId,
        code: 'DUPLICATE_REQUEST',
        message: 'Duplicate requestId detected. Ignoring replayed chat query.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });

    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId,
        code: 'DUPLICATE_REQUEST',
        message: 'Duplicate requestId detected. Ignoring replayed chat query.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  const existingConversation = host.chatBrainConversations.get(conversationId);
  const current = existingConversation || {
    workspacePath: typeof data?.workspacePath === 'string' ? data.workspacePath : undefined,
    projectPath:
      typeof data?.projectPath === 'string' && data.projectPath.trim()
        ? data.projectPath.trim()
        : undefined,
    projectName:
      typeof data?.projectName === 'string' && data.projectName.trim()
        ? data.projectName.trim()
        : undefined,
    projectType:
      typeof data?.projectType === 'string' && data.projectType.trim()
        ? data.projectType.trim()
        : undefined,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    phase: 'detect' as const,
    history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    queryCount: 0,
    actionCount: 0,
    repeatedIncidentDetected: false,
    framework: undefined as string | undefined,
    scopeMode:
      data?.scopeMode === 'project' || data?.scopeMode === 'workspace' ? data.scopeMode : undefined,
  };

  current.workspacePath =
    (typeof data?.workspacePath === 'string' && data.workspacePath.trim()) || current.workspacePath;
  current.projectPath =
    (typeof data?.projectPath === 'string' && data.projectPath.trim()) || current.projectPath;
  current.projectName =
    (typeof data?.projectName === 'string' && data.projectName.trim()) || current.projectName;
  current.projectType =
    (typeof data?.projectType === 'string' && data.projectType.trim()) || current.projectType;

  if (!current.framework) {
    current.framework = current.projectPath
      ? await host.inferFrameworkFromWorkspace(current.projectPath)
      : current.workspacePath
        ? await host.inferFrameworkFromWorkspace(current.workspacePath)
        : undefined;
  }

  current.lastActivityAt = Date.now();
  current.phase = 'diagnose';
  current.queryCount += 1;
  current.history = [...current.history, { role: 'user' as const, content: message }].slice(-12);
  host.chatBrainConversations.set(conversationId, current);

  const routingResult = host.routeActionTypeFromMessage(message);
  host.trackStudioEvent('workspai.studio.next_action_clicked', current.workspacePath, {
    framework: current.framework ?? 'unknown',
    conversationId,
    queryCount: current.queryCount,
    actionType: routingResult.actionType,
    fallbackReason: routingResult.fallbackReason,
    projectPath: current.projectPath,
    timeToFirstActionMs: Date.now() - current.startedAt,
  });

  host.getChatBrainQueryTokenSource()?.cancel();
  host.getChatBrainQueryTokenSource()?.dispose();
  const tokenSource = new vscode.CancellationTokenSource();
  host.setChatBrainQueryTokenSource(tokenSource);
  host.setActiveChatBrainRequestId(requestId);
  host.setActiveChatBrainConversationId(conversationId);

  const messageId = `msg-${Date.now()}`;
  const actionType = routingResult.actionType;
  const actionPolicy = classifyIncidentActionPolicy(actionType);
  const isFirstQuery = current.queryCount === 1;
  const memoryReuseSnapshot = isFirstQuery
    ? await host.buildIncidentMemoryReuseSnapshot({
        workspacePath: current.workspacePath,
        queryText: message,
        actionType,
      })
    : null;
  const memoryPromptHint = buildIncidentMemoryPromptHint(memoryReuseSnapshot);
  const repeatSignal =
    isFirstQuery && current.workspacePath
      ? await host.detectIncidentRepeatSignal({
          workspacePath: current.workspacePath,
          queryText: message,
          actionType,
        })
      : null;
  if (repeatSignal?.isRepeated) {
    current.repeatedIncidentDetected = true;
    host.chatBrainConversations.set(conversationId, current);
    host.trackStudioEvent('workspai.studio.repeated_incident_detected', current.workspacePath, {
      conversationId,
      actionType,
      repeatScore: repeatSignal.repeatScore,
      framework: current.framework ?? 'unknown',
      projectPath: current.projectPath,
    });
  }
  const repeatedIncidentHint =
    repeatSignal?.isRepeated && repeatSignal.matchedDecision
      ? [
          'REPEATED_INCIDENT_SIGNAL:',
          `- A similar incident was previously resolved in this workspace (similarity score: ${repeatSignal.repeatScore}).`,
          `- Matched pattern: "${repeatSignal.matchedDecision.slice(0, 140)}"`,
          '- Do NOT re-diagnose from scratch. Reuse the matched verified fix pattern.',
          '- Confirm whether the current incident matches this pattern before suggesting new steps.',
        ].join('\n')
      : '';
  let assistantText = '';
  let responseModelId: string | undefined;
  const expectedWorkspacePath = current.workspacePath;

  try {
    const { prepareAIConversation, streamAIResponse } = await import('../../core/aiService.js');
    // Derive scope intent from explicit scopeMode, then projectPath.
    const requestedScopeMode =
      data?.scopeMode === 'project' || data?.scopeMode === 'workspace'
        ? data.scopeMode
        : current.scopeMode === 'project' || current.scopeMode === 'workspace'
          ? current.scopeMode
          : current.projectPath
            ? 'project'
            : 'workspace';
    const scopeIntent: 'workspace' | 'project' = requestedScopeMode;
    current.scopeMode = scopeIntent;
    const aiContext = await host.buildChatBrainAIContext({
      workspacePath: current.workspacePath,
      projectPath: current.projectPath,
      projectName: current.projectName,
      projectType: current.projectType,
      scopeIntent,
    });
    const history = current.history.slice(-8);
    const structuredPrompt = await buildStructuredIncidentPrompt(
      host.structuredIncidentPromptHost,
      message,
      {
        workspacePath: current.workspacePath,
        projectPath: current.projectPath,
        projectName: current.projectName,
        projectType: current.projectType,
        scopeIntent,
      }
    );

    // Doctor snapshot is already read inside buildStructuredIncidentPrompt;
    // reuse it here for the contract rather than reading again.
    const chatDoctorSnapshot = await host
      .readDoctorEvidenceSnapshot(current.workspacePath, {
        projectPath: current.projectPath,
      })
      .catch(() => undefined);

    const prepared = await prepareAIConversation(
      'ask',
      [structuredPrompt, memoryPromptHint, repeatedIncidentHint].filter(Boolean).join('\n\n'),
      aiContext,
      history,
      chatDoctorSnapshot ?? undefined
    );

    if (prepared.validation.clarificationNeeded) {
      const clarificationText =
        prepared.validation.clarificationReason ??
        `Context evidence is missing. Select a workspace/project and run ${buildRapidkitDisplayCommand(['doctor', 'workspace'])}, then retry.`;

      const nextConversation = host.chatBrainConversations.get(conversationId);
      if (nextConversation) {
        nextConversation.history = [
          ...nextConversation.history,
          {
            role: 'assistant' as const,
            content: clarificationText,
          },
        ].slice(-12);
        nextConversation.lastActionResponseText = clarificationText;
        host.chatBrainConversations.set(conversationId, nextConversation);
      }

      host.postChatBrainWebviewMessage({
        command: 'aiChatDone',
        data: {
          conversationId,
          messageId,
          finalText: clarificationText,
          phase: 'detect',
          confidence: 100,
          nextActions: ['Select workspace/project', 'Run doctor workspace', 'Retry the same query'],
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const maxAttempts = 2;
    let streamSucceeded = false;
    let lastStreamError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (tokenSource.token.isCancellationRequested) {
        break;
      }

      let chunkBuffer = '';
      let attemptReceivedChunk = false;
      let flushTimer: ReturnType<typeof setInterval> | null = null;
      const attemptTokenSource = new vscode.CancellationTokenSource();
      const cancelSubscription = tokenSource.token.onCancellationRequested(() => {
        attemptTokenSource.cancel();
      });
      const firstChunkTimeout = setTimeout(() => {
        if (!attemptReceivedChunk && !attemptTokenSource.token.isCancellationRequested) {
          attemptTokenSource.cancel();
        }
      }, 45_000);

      try {
        flushTimer = setInterval(() => {
          const staleRequest =
            host.getActiveChatBrainRequestId() !== requestId ||
            host.getActiveChatBrainConversationId() !== conversationId ||
            (expectedWorkspacePath &&
              host.chatBrainConversations.get(conversationId)?.workspacePath !==
                expectedWorkspacePath);

          if (staleRequest && !attemptTokenSource.token.isCancellationRequested) {
            attemptTokenSource.cancel();
            return;
          }

          if (!chunkBuffer || attemptTokenSource.token.isCancellationRequested) {
            return;
          }
          host.postChatBrainWebviewMessage({
            command: 'aiChatChunk',
            data: {
              conversationId,
              messageId,
              chunk: chunkBuffer,
            },
            meta: { requestId, version: 'v1' },
          });
          chunkBuffer = '';
        }, 50);

        const streamResult = await streamAIResponse(
          prepared.messages,
          (chunk) => {
            const staleRequest =
              host.getActiveChatBrainRequestId() !== requestId ||
              host.getActiveChatBrainConversationId() !== conversationId ||
              (expectedWorkspacePath &&
                host.chatBrainConversations.get(conversationId)?.workspacePath !==
                  expectedWorkspacePath);

            if (staleRequest && !attemptTokenSource.token.isCancellationRequested) {
              attemptTokenSource.cancel();
              return;
            }

            if (chunk.text) {
              attemptReceivedChunk = true;
              assistantText += chunk.text;
              chunkBuffer += chunk.text;
            }
            if (!chunk.done) {
              return;
            }
            if (flushTimer) {
              clearInterval(flushTimer);
              flushTimer = null;
            }
            if (chunkBuffer && !attemptTokenSource.token.isCancellationRequested) {
              host.postChatBrainWebviewMessage({
                command: 'aiChatChunk',
                data: {
                  conversationId,
                  messageId,
                  chunk: chunkBuffer,
                },
                meta: { requestId, version: 'v1' },
              });
              chunkBuffer = '';
            }
          },
          attemptTokenSource.token,
          requestedModelId
        );

        if (
          attemptTokenSource.token.isCancellationRequested &&
          !tokenSource.token.isCancellationRequested &&
          !attemptReceivedChunk
        ) {
          throw new Error('First chunk timeout while streaming response.');
        }

        responseModelId = streamResult.modelId;
        streamSucceeded = true;
        break;
      } catch (streamErr) {
        lastStreamError = streamErr;
        const retryable = !attemptReceivedChunk && isRetryableChatBrainError(streamErr);
        const canRetry =
          attempt < maxAttempts && retryable && !tokenSource.token.isCancellationRequested;

        if (canRetry) {
          host.postChatBrainWebviewMessage({
            command: 'aiChatActionProgress',
            data: {
              conversationId,
              actionId: messageId,
              stage: 'retrying',
              progress: 45,
              note: `Transient stream interruption detected. Retrying (${attempt + 1}/${maxAttempts})...`,
            },
            meta: { requestId, version: 'v1' },
          });
          continue;
        }

        throw streamErr;
      } finally {
        if (flushTimer) {
          clearInterval(flushTimer);
          flushTimer = null;
        }
        clearTimeout(firstChunkTimeout);
        cancelSubscription.dispose();
        attemptTokenSource.dispose();
      }
    }

    if (!streamSucceeded) {
      throw lastStreamError instanceof Error
        ? lastStreamError
        : new Error('Chat stream failed before completion.');
    }

    if (tokenSource.token.isCancellationRequested) {
      return;
    }

    const nextConversation = host.chatBrainConversations.get(conversationId);
    const baseAssistantText = assistantText.trim() || 'No response generated.';
    const finalAssistantText = shouldAttachIncidentMemoryReuse(
      current.queryCount,
      memoryReuseSnapshot
    )
      ? prependIncidentMemoryReuseBlock(baseAssistantText, memoryReuseSnapshot)
      : baseAssistantText;

    if (nextConversation) {
      nextConversation.history = [
        ...nextConversation.history,
        {
          role: 'assistant' as const,
          content: finalAssistantText,
        },
      ].slice(-12);
      nextConversation.lastActionResponseText = finalAssistantText;
      host.chatBrainConversations.set(conversationId, nextConversation);
    }

    if (current.workspacePath) {
      const persisted = await publishStudioAIActionContractFromText({
        workspacePath: current.workspacePath,
        text: finalAssistantText,
        provider: 'chat-brain',
        postMessage: (command, payload) => {
          host.postChatBrainWebviewMessage({ command, data: payload });
        },
      });
      host.setLatestDashboardAIAction(persisted.activeContract, persisted.activeActionId);
    }

    host.postChatBrainWebviewMessage({
      command: 'aiChatActionBoard',
      data: {
        conversationId,
        messageId,
        board: {
          id: `board-${Date.now()}`,
          type: actionType === 'terminal-bridge' ? 'error' : 'solution',
          title: 'Next Safe Action',
          summary: current.projectName
            ? `Selected project: ${current.projectName} | ${host.getChatBrainPrimaryActionLabel(actionType, current.projectName)}`
            : host.getChatBrainPrimaryActionLabel(actionType),
          data: {
            route: actionType,
            confidence: 80,
            actionPolicy,
          },
          actions: [
            {
              id: `action-${Date.now()}`,
              label: host.getChatBrainPrimaryActionLabel(actionType, current.projectName),
              actionType: actionType === 'orchestrate' ? 'terminal-bridge' : actionType,
              riskLevel: actionPolicy.riskLevel,
              riskClass: actionPolicy.riskClass,
              requiresImpactReview: actionPolicy.requiresImpactReview,
              requiresVerifyPath: actionPolicy.requiresVerifyPath,
            },
            ...(actionType !== 'release-readiness-commander'
              ? [
                  {
                    id: `action-release-readiness-${Date.now()}`,
                    label: 'Generate release readiness Go/No-Go',
                    actionType: 'release-readiness-commander',
                    riskLevel: 'medium',
                  },
                ]
              : []),
            ...(actionType !== 'verify-pack-autopilot'
              ? [
                  {
                    id: `action-verify-pack-${Date.now()}`,
                    label: 'Generate deterministic verify command pack',
                    actionType: 'verify-pack-autopilot',
                    riskLevel: 'medium',
                  },
                ]
              : []),
            ...(actionType === 'terminal-bridge'
              ? [
                  {
                    id: `action-followup-${Date.now()}`,
                    label: 'Preview safe patch from this error',
                    actionType: 'apply-debug-patch',
                    riskLevel: 'medium',
                  },
                ]
              : []),
          ],
        },
      },
      meta: { requestId, version: 'v1' },
    });

    host.postChatBrainWebviewMessage({
      command: 'aiChatSuggestedQuestions',
      data: {
        conversationId,
        messageId,
        questions: host.buildSuggestedQuestions(actionType, message, scopeIntent),
      },
      meta: { requestId, version: 'v1' },
    });

    host.postChatBrainWebviewMessage({
      command: 'aiChatDone',
      data: {
        conversationId,
        messageId,
        modelId: responseModelId,
        finalText: finalAssistantText,
        phase: current.phase,
        confidence: 80,
        nextActions: [
          'Run the next safe action',
          'Generate verification evidence',
          'Ask a scoped follow-up',
        ],
      },
      meta: { requestId, version: 'v1' },
    });
  } catch (err) {
    if (!tokenSource.token.isCancellationRequested) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const failureCode = deriveChatBrainFailureCode(err);
      const retryable = isRetryableChatBrainError(err);
      host.postChatBrainWebviewMessage({
        command: 'aiChatPartialFailure',
        data: {
          conversationId,
          code: failureCode,
          message: errMsg,
          retryable,
          board: buildChatBrainFallbackBoard(actionType, current.projectName),
        },
        meta: { requestId, version: 'v1' },
      });

      host.postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: failureCode,
          message: errMsg,
          retryable,
        },
        meta: { requestId, version: 'v1' },
      });
    }
  } finally {
    if (host.getChatBrainQueryTokenSource() === tokenSource) {
      host.setChatBrainQueryTokenSource(undefined);
    }
    if (host.getActiveChatBrainRequestId() === requestId) {
      host.setActiveChatBrainRequestId(undefined);
    }
    if (host.getActiveChatBrainConversationId() === conversationId) {
      host.setActiveChatBrainConversationId(undefined);
    }
    trackChatBrainRequestComplete(
      normalizedRequestId,
      host.chatBrainInFlightRequestIds,
      host.chatBrainCompletedRequestIds
    );
    tokenSource.dispose();
  }
}
