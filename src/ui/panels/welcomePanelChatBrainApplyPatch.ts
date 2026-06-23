import path from 'node:path';
import * as vscode from 'vscode';

import { extractPatchesFromAiResponse, applyPatches } from '../../core/patchApplyEngine';
import {
  getWebviewMessageDataRecord,
  readBooleanField,
  readStringArrayField,
  readStringField,
  readTrimmedStringField,
  type WebviewFromExtensionMessage,
} from '../../contracts/webviewProtocol';
import { runPostPatchShipLoopRefresh } from './incidentStudioPatchReverifyBridge';
import type { ChatBrainConversation } from './welcomePanelChatBrainQuery';

export type ChatBrainApplyPatchHost = {
  context: vscode.ExtensionContext;
  chatBrainConversations: Map<string, ChatBrainConversation>;
  postChatBrainWebviewMessage: (message: WebviewFromExtensionMessage) => void;
  resolveChatBrainWebview: () => vscode.Webview;
};

export async function handleApplyPatch(
  host: ChatBrainApplyPatchHost,
  data: Record<string, unknown>,
  requestId?: string
) {
  const input = getWebviewMessageDataRecord({ command: 'aiChatApplyPatch', data });
  const conversationId = readStringField(input, 'conversationId');
  const patchId = readStringField(input, 'patchId') ?? `patch-${Date.now()}`;
  const acceptedPaths = readStringArrayField(input, 'acceptedPaths') ?? [];
  const branchSafeApply = readBooleanField(input, 'branchSafeApply') === true;

  const conv = conversationId ? host.chatBrainConversations.get(conversationId) : undefined;
  const workspacePath = readTrimmedStringField(input, 'workspacePath') ?? conv?.workspacePath;

  if (!workspacePath) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId,
        code: 'INVALID_INPUT',
        message: 'workspacePath is required to apply patches.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  if (conv?.lastUnknownScopeMutationBlocked || conv?.lastScopeKnown === false) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId,
        code: 'SCOPE_UNKNOWN_MUTATION_BLOCKED',
        message:
          'Patch apply blocked: impacted scope is unknown. Run change-impact-lite and verify before mutation.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  const lastResponse = conv?.lastActionResponseText ?? '';
  const rawPatches = lastResponse
    ? extractPatchesFromAiResponse(lastResponse, { actionId: patchId, workspacePath })
    : [];

  if (rawPatches.length === 0) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId,
        code: 'NO_PATCHES',
        message: 'No patches found to apply.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  const result = await applyPatches({
    actionId: patchId,
    workspacePath,
    patches: rawPatches,
    branchSafeApply,
    acceptedPaths: acceptedPaths.length > 0 ? acceptedPaths : undefined,
  });

  host.postChatBrainWebviewMessage({
    command: 'aiChatPatchApplied',
    data: { conversationId, patchId, result },
    meta: { requestId, version: 'v1' },
  });

  const workspaceName =
    conv?.projectName ||
    conv?.workspacePath?.split(/[\\/]/).filter(Boolean).pop() ||
    path.basename(workspacePath);
  await runPostPatchShipLoopRefresh({
    webview: host.resolveChatBrainWebview(),
    context: host.context,
    workspace: { workspacePath, workspaceName },
    projectPath: conv?.projectPath,
    patchSucceeded: result.appliedCount > 0 && result.failedCount === 0,
    requestId,
  });
}
