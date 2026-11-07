import type * as vscode from 'vscode';
import { askConfiguredAIProviderForToolAction } from './aiProviderService.js';
import {
  ContractStudioAgentModelAdapter,
  type StudioAgentConversationMessage,
} from './studioAgentModelProtocol.js';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { AIMessagePathIdentity } from './aiService.js';

/** One provider/model adapter for sidebar, native Chat and governed continuations. */
export function createConfiguredStudioAgentModel(input: {
  context: vscode.ExtensionContext;
  objective: string;
  token?: vscode.CancellationToken;
  modelId?: string;
  pathIdentities?: ReadonlyArray<AIMessagePathIdentity>;
  restoredSession?: StudioAgentPersistedSession;
  history?: StudioAgentConversationMessage[];
  reviewAnswerDelivery?: boolean;
}): ContractStudioAgentModelAdapter {
  const model = new ContractStudioAgentModelAdapter(
    input.objective,
    async (_prompt, request) => {
      const response = await askConfiguredAIProviderForToolAction(
        input.context,
        request.messages,
        request.tools,
        input.token,
        input.modelId,
        input.pathIdentities,
        request.onProgress
      );
      const resolution = {
        provider: response.provider,
        modelId: response.modelId,
        requestedModelId: response.requestedModelId,
        fallback: response.fallback,
        attempts: response.attempts,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        tokenUsageSource: response.tokenUsageSource,
        ...(response.toolTransport ? { toolTransport: response.toolTransport } : {}),
      };
      return response.type === 'tool'
        ? {
            callId: response.callId,
            toolName: response.toolName,
            input: response.input,
            resolution,
          }
        : { type: 'text', text: response.text, resolution };
    },
    input.restoredSession,
    input.history
  );
  model.enableToolDeferral();
  model.enableEfficientContext();
  if (input.reviewAnswerDelivery) {
    model.enableAnswerDeliveryReview();
  }
  return model;
}
