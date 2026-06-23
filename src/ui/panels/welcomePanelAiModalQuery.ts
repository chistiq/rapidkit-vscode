import * as vscode from 'vscode';

import { buildRapidkitDisplayCommand } from '../../utils/platformCapabilities';
import { askConfiguredAIProvider } from '../../core/aiProviderService';
import { readWorkspaiSettings } from '../../core/workspaiSettingsBridge';
import type { AIModalContext } from '../../core/aiService';
import type { AIOutputScenario } from '../../core/aiOutputQuality';
import {
  getWebviewMessageDataRecord,
  readAIQueryMode,
  readNumberField,
  readStringField,
} from '../../contracts/webviewProtocol';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import type { DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import { isConversationMessageEntry, normalizeRequestedModelId } from './welcomePanel.shared.js';

export type AiModalQueryHost = {
  context: vscode.ExtensionContext;
  getAiQueryTokenSource: () => vscode.CancellationTokenSource | undefined;
  setAiQueryTokenSource: (value: vscode.CancellationTokenSource | undefined) => void;
  getActiveAiQueryRequestId: () => number | undefined;
  setActiveAiQueryRequestId: (value: number | undefined) => void;
  trackAIQueryRequestStart: (requestId: number) => void;
  postAIStreamDoneOnce: (requestId?: number, error?: string) => void;
  postWebviewMessage: (command: string, data?: unknown) => void;
  readDoctorEvidenceSnapshot: (
    workspacePath?: string
  ) => Promise<DoctorEvidenceSnapshot | undefined>;
};

export function resolveAiModalOutputScenario(
  mode: 'ask' | 'debug',
  question: string,
  contextType?: string
): AIOutputScenario {
  const normalized = question.toLowerCase();

  if (/\b(release|ship|go\/no-go|go-no-go|deploy)\b/.test(normalized)) {
    return contextType === 'workspace' ? 'release-workspace' : 'release-project';
  }

  if (/\b(command failed|failing command|exit code|stderr|stdout|traceback)\b/.test(normalized)) {
    return 'command-failure';
  }

  return mode === 'debug' ? 'debug' : 'ask';
}

export async function handleAiModalQueryMessage(
  host: AiModalQueryHost,
  messageData: unknown
): Promise<void> {
  const payload = getWebviewMessageDataRecord({ command: 'aiQuery', data: messageData });
  const aiCtx = payload?.context;
  const history = payload?.history;
  const requestedModelIdRaw = payload?.modelId;

  const requestedModelId = normalizeRequestedModelId(requestedModelIdRaw);
  const queryRequestId = readNumberField(payload, 'requestId') ?? Date.now();
  host.trackAIQueryRequestStart(queryRequestId);
  const normalizedMode = readAIQueryMode(payload);
  const normalizedQuestion = readStringField(payload, 'question') ?? '';
  const aiContext = aiCtx && typeof aiCtx === 'object' ? (aiCtx as AIModalContext) : undefined;
  const conversationHistory = Array.isArray(history)
    ? history.filter(isConversationMessageEntry).slice(-8)
    : [];

  const canTrackTelemetry =
    typeof (vscode.window as { createOutputChannel?: unknown }).createOutputChannel === 'function';

  const trackAIModalOutcome = async (
    result: 'success' | 'empty' | 'prepare-error' | 'clarification-needed' | 'cancelled' | 'error',
    extraProps?: Record<string, unknown>
  ) => {
    if (!canTrackTelemetry) {
      return;
    }

    try {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        `workspai.aimodal.${normalizedMode}`,
        typeof aiContext?.path === 'string' ? aiContext.path : undefined,
        {
          source: 'ai-modal',
          result,
          hasPrompt: Boolean(normalizedQuestion.trim()),
          historyTurns: conversationHistory.length,
          ...extraProps,
        }
      );
    } catch {
      // Telemetry should never interrupt AI modal UX.
    }
  };

  if (!normalizedQuestion.trim() || !aiContext) {
    await trackAIModalOutcome('empty', {
      hasContext: Boolean(aiContext),
    });
    host.postAIStreamDoneOnce(queryRequestId);
    return;
  }

  const previousTokenSource = host.getAiQueryTokenSource();
  previousTokenSource?.cancel();
  previousTokenSource?.dispose();
  const tokenSource = new vscode.CancellationTokenSource();
  host.setAiQueryTokenSource(tokenSource);
  host.setActiveAiQueryRequestId(queryRequestId);
  let currentStage: 'prepare' | 'stream' = 'prepare';
  let chunkBuffer = '';
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let streamDoneSent = false;
  let fullAIResponse = '';

  const flushBufferedChunks = () => {
    if (chunkBuffer && !tokenSource.token.isCancellationRequested) {
      host.postWebviewMessage('aiChunkUpdate', { text: chunkBuffer, requestId: queryRequestId });
    }
    chunkBuffer = '';
  };

  const stopFlushTimer = () => {
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  };

  const sendDoneOnce = (error?: string) => {
    if (streamDoneSent) {
      return;
    }
    streamDoneSent = true;
    host.postAIStreamDoneOnce(queryRequestId, error);
  };

  try {
    const { streamAIResponse, prepareAIConversation, extractContractTelemetry } =
      await import('../../core/aiService.js');
    const { validateAIOutputQuality } = await import('../../core/aiOutputQuality.js');

    const aiQueryDoctorSnapshot =
      aiContext?.path || aiContext?.workspaceRootPath
        ? await host
            .readDoctorEvidenceSnapshot(aiContext.workspaceRootPath ?? aiContext.path)
            .catch(() => undefined)
        : undefined;

    const prepared = await prepareAIConversation(
      normalizedMode,
      normalizedQuestion,
      aiContext,
      conversationHistory,
      aiQueryDoctorSnapshot ?? undefined
    );

    if (prepared.validation.clarificationNeeded) {
      const clarificationText =
        prepared.validation.clarificationReason ??
        `Context evidence is missing. Please select a workspace and run ${buildRapidkitDisplayCommand(['doctor', 'workspace'])}, then ask again.`;

      if (canTrackTelemetry) {
        try {
          await WorkspaceUsageTracker.getInstance().trackCommandEvent(
            'workspai.aimodal.clarification_gate',
            typeof aiContext?.path === 'string' ? aiContext.path : undefined,
            {
              source: 'ai-modal',
              mode: normalizedMode,
              missingFields: prepared.validation.missing,
            }
          );
        } catch {
          // Telemetry should never interrupt AI modal UX.
        }
      }

      host.postWebviewMessage('aiChunkUpdate', {
        text: `${clarificationText}\n\nPlease share the selected workspace/project path so I can continue with evidence-based guidance.`,
        requestId: queryRequestId,
      });
      host.postAIStreamDoneOnce(queryRequestId);
      await trackAIModalOutcome('clarification-needed', {
        stage: 'prepare',
        missingFields: prepared.validation.missing,
      });
      return;
    }

    currentStage = 'stream';

    if (aiContext) {
      host.postWebviewMessage('aiContextContract', {
        requestId: queryRequestId,
        ...extractContractTelemetry(prepared.contract),
        persona_level: prepared.contract.persona,
        evidence_confidence: prepared.contract.evidence_confidence,
      });
    }

    flushTimer = setInterval(() => {
      flushBufferedChunks();
    }, 50);

    let modelId = '';
    if (readWorkspaiSettings().aiProvider === 'openai-compatible') {
      const providerResponse = await askConfiguredAIProvider(
        host.context,
        prepared.messages,
        tokenSource.token
      );
      modelId = providerResponse.provider;
      fullAIResponse += providerResponse.text;
      chunkBuffer += providerResponse.text;
      stopFlushTimer();
      flushBufferedChunks();
    } else {
      const streamResult = await streamAIResponse(
        prepared.messages,
        (chunk: { text: string; done: boolean }) => {
          if (chunk.text) {
            fullAIResponse += chunk.text;
            chunkBuffer += chunk.text;
          }
          if (chunk.done) {
            stopFlushTimer();
            flushBufferedChunks();
          }
        },
        tokenSource.token,
        requestedModelId
      );
      modelId = streamResult.modelId;
    }

    if (tokenSource.token.isCancellationRequested) {
      await trackAIModalOutcome('cancelled', { stage: 'after-stream' });
    } else {
      const qualityResult = validateAIOutputQuality(
        fullAIResponse,
        resolveAiModalOutputScenario(normalizedMode, normalizedQuestion, aiContext.type)
      );

      if (!qualityResult.isAcceptable) {
        const topViolations = qualityResult.violations
          .filter((violation) => violation.severity === 'error')
          .slice(0, 3)
          .map((violation) => `- ${violation.detail}`)
          .join('\n');

        if (topViolations) {
          host.postWebviewMessage('aiChunkUpdate', {
            text: `\n\n## Output Quality Gate\n${topViolations}\n\nNext safe step: ask me to regenerate with verification evidence, execution directory, and rollback path.`,
            requestId: queryRequestId,
          });
        }

        if (canTrackTelemetry) {
          try {
            await WorkspaceUsageTracker.getInstance().trackCommandEvent(
              'workspai.aimodal.output_quality_gate',
              typeof aiContext?.path === 'string' ? aiContext.path : undefined,
              {
                source: 'ai-modal',
                mode: normalizedMode,
                violationCount: qualityResult.violations.length,
                topRules: qualityResult.violations.slice(0, 5).map((violation) => violation.rule),
              }
            );
          } catch {
            // Telemetry should never interrupt AI modal UX.
          }
        }
      }

      await trackAIModalOutcome('success', {
        modelId,
        outputQuality: qualityResult.isAcceptable ? 'accepted' : 'flagged',
      });
      sendDoneOnce();
    }

    host.postWebviewMessage('aiModelUsed', { modelId, requestId: queryRequestId });
  } catch (err) {
    if (tokenSource.token.isCancellationRequested) {
      await trackAIModalOutcome('cancelled', { stage: currentStage });
      if (host.getActiveAiQueryRequestId() === queryRequestId) {
        sendDoneOnce();
      }
      return;
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    await trackAIModalOutcome(currentStage === 'prepare' ? 'prepare-error' : 'error', {
      error: errMsg.slice(0, 180),
      stage: currentStage,
    });

    sendDoneOnce(errMsg);
  } finally {
    stopFlushTimer();
    chunkBuffer = '';
    if (host.getAiQueryTokenSource() === tokenSource) {
      host.setAiQueryTokenSource(undefined);
    }
    if (host.getActiveAiQueryRequestId() === queryRequestId) {
      host.setActiveAiQueryRequestId(undefined);
    }
    tokenSource.dispose();
  }
}
