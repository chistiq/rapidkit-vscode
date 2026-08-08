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
    runSidebarManualCreate: vi.fn(async () => undefined),
    runSidebarCreatedWorkspaceBootstrap: vi.fn(async () => undefined),
    runInlineImpactQuery: vi.fn(async () => undefined),
    runSidebarAdvisorAction: vi.fn(async () => undefined),
    runInlineStudioQuery: vi.fn(async () => undefined),
    runSidebarStudioAction: vi.fn(async () => undefined),
    focusPrimarySidebarView: vi.fn(async () => undefined),
    openDashboardSection: vi.fn(async () => undefined),
    openWorkspaceFile: vi.fn(async () => undefined),
    openWorkspaceDiff: vi.fn(async () => undefined),
    undoAgentPatch: vi.fn(async () => undefined),
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
});
