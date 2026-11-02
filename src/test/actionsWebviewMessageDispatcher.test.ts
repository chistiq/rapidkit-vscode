import { describe, expect, it, vi } from 'vitest';

import {
  dispatchActionsWebviewMessage,
  listActionsWebviewMessageCommands,
  type ActionsWebviewMessageDispatchHost,
} from '../ui/webviews/actionsWebviewMessageDispatcher.js';

function host(): ActionsWebviewMessageDispatchHost {
  return {
    runInlineAICreatePlan: vi.fn(async () => undefined),
    runInlineAICreateConfirm: vi.fn(async () => undefined),
    cancelInlineAICreatePlan: vi.fn(async () => undefined),
    runSidebarManualCreate: vi.fn(async () => undefined),
    runSidebarCreatedWorkspaceBootstrap: vi.fn(async () => undefined),
    runInlineImpactQuery: vi.fn(async () => undefined),
    runSidebarAdvisorAction: vi.fn(async () => undefined),
    runInlineStudioQuery: vi.fn(async () => undefined),
    reconcileSidebarStudioSessions: vi.fn(async () => undefined),
    runSidebarStudioAction: vi.fn(async () => undefined),
    resolveStudioToolApproval: vi.fn(async () => undefined),
    focusPrimarySidebarView: vi.fn(async () => undefined),
    openDashboardSection: vi.fn(async () => undefined),
    openWorkspaceFile: vi.fn(async () => undefined),
    openWorkspaceDiff: vi.fn(async () => undefined),
    reviewWorkspaceChanges: vi.fn(async () => undefined),
    undoAgentPatch: vi.fn(async () => undefined),
    openSetup: vi.fn(async () => undefined),
    sendInlineScope: vi.fn(async () => undefined),
    sendInlineModels: vi.fn(async () => undefined),
    setPreferredModel: vi.fn(async () => undefined),
    runSidebarAction: vi.fn(async () => undefined),
    warnUnknownSidebarAction: vi.fn(),
  };
}

describe('actions webview message dispatcher', () => {
  it('routes Agent Undo by opaque transaction identity only', async () => {
    const target = host();

    await dispatchActionsWebviewMessage(target, {
      command: 'sidebarStudioUndoPatch',
      data: { transactionId: 'tool-call-123' },
    });

    expect(target.undoAgentPatch).toHaveBeenCalledWith({ transactionId: 'tool-call-123' });
    expect(target.runSidebarStudioAction).not.toHaveBeenCalled();
    expect(listActionsWebviewMessageCommands()).toContain('sidebarStudioUndoPatch');
  });

  it('routes an inline Studio approval decision through its dedicated exact-request lane', async () => {
    const target = host();
    const decision = {
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      fingerprint: 'a'.repeat(64),
      approved: true,
      execution: 'once',
    };

    await dispatchActionsWebviewMessage(target, {
      command: 'sidebarStudioToolApprovalDecision',
      data: decision,
    });

    expect(target.resolveStudioToolApproval).toHaveBeenCalledWith(decision);
    expect(target.runSidebarStudioAction).not.toHaveBeenCalled();
    expect(listActionsWebviewMessageCommands()).toContain('sidebarStudioToolApprovalDecision');
  });

  it('reconciles persisted streaming sessions against host-owned live sessions', async () => {
    const target = host();
    const sessionIds = ['studio-1'];

    await dispatchActionsWebviewMessage(target, {
      command: 'sidebarReconcileStudioSessions',
      data: { sessionIds },
    });

    expect(target.reconcileSidebarStudioSessions).toHaveBeenCalledWith({ sessionIds });
  });

  it('routes an exact repair receipt to the native transaction diff lane', async () => {
    const target = host();
    const receipt = {
      transactionId: 'receipt-transaction-0001',
      relativePath: 'src/app.ts',
    };

    await dispatchActionsWebviewMessage(target, {
      command: 'sidebarOpenWorkspaceDiff',
      data: receipt,
    });

    expect(target.openWorkspaceDiff).toHaveBeenCalledWith(receipt);
    expect(target.openWorkspaceFile).not.toHaveBeenCalled();
    expect(listActionsWebviewMessageCommands()).toContain('sidebarOpenWorkspaceDiff');
  });

  it('routes Create prerequisite recovery to the native Setup surface', async () => {
    const target = host();

    await dispatchActionsWebviewMessage(target, {
      command: 'sidebarOpenSetup',
      data: {},
    });

    expect(target.openSetup).toHaveBeenCalledOnce();
    expect(listActionsWebviewMessageCommands()).toContain('sidebarOpenSetup');
  });

  it('routes Create planning cancellation without cancelling a filesystem transaction', async () => {
    const target = host();

    await dispatchActionsWebviewMessage(target, {
      command: 'sidebarCancelCreatePlanning',
      data: { sessionId: 'create-session-1' },
    });

    expect(target.cancelInlineAICreatePlan).toHaveBeenCalledWith({
      sessionId: 'create-session-1',
    });
    expect(target.runInlineAICreateConfirm).not.toHaveBeenCalled();
  });
});
