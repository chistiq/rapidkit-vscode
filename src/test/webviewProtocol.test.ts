import { describe, expect, it } from 'vitest';

import {
  createExtensionWebviewMessage,
  createWebviewMessage,
  getWebviewMessageRequestId,
  normalizeExtensionWebviewMessage,
  normalizeWebviewMessage,
  readAICreationMode,
  readAICreationStackIntent,
  readAIQueryMode,
  readBooleanField,
  readDashboardEvidenceCardIds,
  readDashboardEvidenceRefreshMode,
  readIncidentFeedbackRating,
  readIncidentScopeMode,
  readStringArrayField,
} from '../contracts/webviewProtocol';

describe('webviewProtocol', () => {
  it('normalizes valid webview messages and rejects malformed envelopes', () => {
    expect(normalizeWebviewMessage(null)).toBeNull();
    expect(normalizeWebviewMessage({ data: {} })).toBeNull();

    const message = normalizeWebviewMessage(
      createWebviewMessage(
        'requestDashboardEvidence',
        { refreshMode: 'patch', requestId: 17 },
        { requestId: 'ai-chat-1', source: 'dashboard' }
      )
    );

    expect(message?.command).toBe('requestDashboardEvidence');
    expect(message?.data.refreshMode).toBe('patch');
    expect(getWebviewMessageRequestId(message!)).toBe('ai-chat-1');
  });

  it('normalizes extension-to-webview messages with protocol metadata', () => {
    const message = normalizeExtensionWebviewMessage(
      createExtensionWebviewMessage(
        'aiChatStarted',
        { conversationId: 'conv-1' },
        { requestId: 'cb-1', version: 'v1' }
      )
    );

    expect(message?.command).toBe('aiChatStarted');
    expect(message?.data.conversationId).toBe('conv-1');
    expect(message?.meta?.requestId).toBe('cb-1');
    expect(message?.meta?.version).toBe('v1');
  });

  it('normalizes dashboard host messages without losing top-level errors', () => {
    const message = normalizeExtensionWebviewMessage(
      createExtensionWebviewMessage('reportLoaded', null, undefined, 'Report file not found')
    );

    expect(message?.command).toBe('reportLoaded');
    expect(message?.data).toBeNull();
    expect(message?.error).toBe('Report file not found');
  });

  it('normalizes onboarding and modal host messages', () => {
    const catalogMessage = normalizeExtensionWebviewMessage(
      createExtensionWebviewMessage('updateAvailableKits', [{ name: 'FastAPI' }])
    );
    const modalMessage = normalizeExtensionWebviewMessage(
      createExtensionWebviewMessage('openAICreateModal', {
        mode: 'project',
        targetWorkspacePath: '/workspace',
      })
    );

    expect(catalogMessage?.command).toBe('updateAvailableKits');
    expect(catalogMessage?.data).toEqual([{ name: 'FastAPI' }]);
    expect(modalMessage?.command).toBe('openAICreateModal');
    expect(modalMessage?.data.mode).toBe('project');
    expect(modalMessage?.data.targetWorkspacePath).toBe('/workspace');
  });

  it('normalizes modules and example progress host messages', () => {
    const modulesMessage = normalizeExtensionWebviewMessage(
      createExtensionWebviewMessage('updateModulesCatalog', {
        modules: [{ slug: 'free/auth/core' }],
        meta: { rapidkitCoreVersion: '0.37.1' },
      })
    );
    const cloningMessage = normalizeExtensionWebviewMessage(
      createExtensionWebviewMessage('setCloning', { exampleName: null })
    );

    expect(modulesMessage?.command).toBe('updateModulesCatalog');
    expect(modulesMessage?.data.modules).toEqual([{ slug: 'free/auth/core' }]);
    expect(modulesMessage?.data.meta.rapidkitCoreVersion).toBe('0.37.1');
    expect(cloningMessage?.command).toBe('setCloning');
    expect(cloningMessage?.data.exampleName).toBeNull();
  });

  it('normalizes dashboard evidence refresh payloads through shared guards', () => {
    expect(readDashboardEvidenceRefreshMode({ refreshMode: 'patch' })).toBe('patch');
    expect(readDashboardEvidenceRefreshMode({ refreshMode: 'invalid' })).toBe('full');
    expect(readDashboardEvidenceCardIds({ cardId: 'doctor' })).toEqual(['doctor']);
    expect(readDashboardEvidenceCardIds({ cardIds: ['doctor', 'not-a-card'] })).toEqual(['doctor']);
    expect(readDashboardEvidenceCardIds({ cardIds: ['not-a-card'] })).toBeUndefined();
  });

  it('normalizes AI modal and incident studio payload fields through shared guards', () => {
    expect(readAICreationMode({ mode: 'project' })).toBe('project');
    expect(readAICreationMode({ mode: 'bad' })).toBe('workspace');
    expect(readAICreationStackIntent({ stackIntent: 'polyglot' })).toBe('polyglot');
    expect(readAICreationStackIntent({ stackIntent: 'invented' })).toBeUndefined();
    expect(readAIQueryMode({ mode: 'debug' })).toBe('debug');
    expect(readAIQueryMode({ mode: 'ask' })).toBe('ask');
    expect(readIncidentScopeMode({ scopeMode: 'project' })).toBe('project');
    expect(readIncidentScopeMode({ scopeMode: 'repo' })).toBeUndefined();
    expect(readIncidentFeedbackRating({ rating: 'not-helpful' })).toBe('not-helpful');
    expect(readIncidentFeedbackRating({ rating: 'unknown' })).toBe('helpful');
    expect(readBooleanField({ branchSafeApply: true }, 'branchSafeApply')).toBe(true);
    expect(readStringArrayField({ acceptedPaths: ['a.ts', 3, 'b.ts'] }, 'acceptedPaths')).toEqual([
      'a.ts',
      'b.ts',
    ]);
  });
});
