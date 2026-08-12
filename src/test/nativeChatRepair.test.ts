import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildDashboardEvidenceBundleMock,
  buildStudioBlockerHandoffMock,
  decideCliOwnedRepairMock,
  executeCliOwnedCanonicalRepairMock,
  runNativeChatStudioAgentMock,
} = vi.hoisted(() => ({
  buildDashboardEvidenceBundleMock: vi.fn(),
  buildStudioBlockerHandoffMock: vi.fn(),
  decideCliOwnedRepairMock: vi.fn(),
  executeCliOwnedCanonicalRepairMock: vi.fn(),
  runNativeChatStudioAgentMock: vi.fn(),
}));

vi.mock('vscode', () => ({}));

vi.mock('../core/dashboardEvidenceBridge', () => ({
  buildDashboardEvidenceBundle: buildDashboardEvidenceBundleMock,
}));

vi.mock('../core/studioBlockerHandoffBuilder', () => ({
  buildStudioBlockerHandoff: buildStudioBlockerHandoffMock,
}));

vi.mock('../core/workspaceRepairCliClient', () => ({
  decideCliOwnedRepair: decideCliOwnedRepairMock,
  executeCliOwnedCanonicalRepair: executeCliOwnedCanonicalRepairMock,
}));

vi.mock('../core/nativeChatStudioAgent', () => ({
  runNativeChatStudioAgent: runNativeChatStudioAgentMock,
}));

import { runNativeChatRepair, selectNativeChatRepairCard } from '../core/nativeChatRepair';

describe('nativeChatRepair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildStudioBlockerHandoffMock.mockResolvedValue({
      verifyCommand: 'workspai workspace verify --strict --json',
      sourceCommand: 'workspai workspace intelligence run --strict --json',
      cardId: 'workspaceVerify',
      cardLabel: 'Workspace Verify',
      blockers: ['Missing evidence'],
      blockerSignature: 'signature',
    });
    runNativeChatStudioAgentMock.mockResolvedValue({
      status: 'completed',
      sessionId: 'native-agent-1',
      transactionIds: ['repair_source2'],
      changedPaths: ['project/src/index.ts'],
    });
  });

  it('prefers a named card, then canonical blocking priority', () => {
    const cards = [
      {
        id: 'doctor',
        label: 'Workspace Doctor',
        status: 'fail',
        summary: 'Doctor failed',
        scope: 'workspace',
        blockers: ['doctor blocker'],
      },
      {
        id: 'workspaceVerify',
        label: 'Workspace Verify',
        status: 'fail',
        blocking: true,
        summary: 'Verify failed',
        scope: 'workspace',
        blockers: ['verify blocker'],
      },
    ] as const;

    expect(selectNativeChatRepairCard(cards as any, 'fix doctor')?.id).toBe('doctor');
    expect(selectNativeChatRepairCard(cards as any, 'Workspace Doctor')?.id).toBe('doctor');
    expect(selectNativeChatRepairCard(cards as any, '')?.id).toBe('workspaceVerify');
  });

  it('runs a canonical repair and exposes only portable changed paths', async () => {
    buildDashboardEvidenceBundleMock.mockResolvedValue({
      cards: [
        {
          id: 'workspaceVerify',
          label: 'Workspace Verify',
          status: 'fail',
          blocking: true,
          summary: 'Verify failed',
          scope: 'workspace',
          blockers: ['Missing evidence'],
        },
      ],
    });
    executeCliOwnedCanonicalRepairMock.mockResolvedValue({
      transaction: {
        transactionId: 'repair_native1',
        state: 'closed',
        target: { cardId: 'workspaceVerify' },
      },
      changedPaths: ['/tmp/workspace/project/package.json', '/tmp/private/secret.txt'],
      fileChanges: [],
    });
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };

    const result = await runNativeChatRepair({
      prompt: 'Workspace Verify',
      context: {
        type: 'workspace',
        name: 'workspace',
        path: '/tmp/workspace',
        workspaceRootPath: '/tmp/workspace',
      },
      stream: stream as any,
      token: { isCancellationRequested: false } as any,
    });

    expect(executeCliOwnedCanonicalRepairMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: '/tmp/workspace',
        cardId: 'workspaceVerify',
        approvedBy: 'vscode:native-chat-repair',
      })
    );
    expect(stream.markdown).toHaveBeenLastCalledWith(
      expect.stringContaining('project/package.json')
    );
    expect(stream.markdown).toHaveBeenLastCalledWith(
      expect.not.stringContaining('/tmp/private/secret.txt')
    );
    expect(result).toMatchObject({ state: 'closed', transactionId: 'repair_native1' });
  });

  it('renders exact CLI decision options as native chat actions', async () => {
    decideCliOwnedRepairMock.mockResolvedValue({
      transaction: {
        transactionId: 'repair_native1',
        state: 'decision-required',
        target: { cardId: 'workspaceVerify' },
        decision: {
          reason: 'Guarded approval is required.',
          options: ['approve-guarded', 'cancel'],
        },
      },
      changedPaths: [],
      fileChanges: [],
    });
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };

    await runNativeChatRepair({
      prompt: 'approve-guarded repair_native1',
      context: {
        type: 'workspace',
        name: 'workspace',
        path: '/tmp/workspace',
        workspaceRootPath: '/tmp/workspace',
      },
      stream: stream as any,
      token: { isCancellationRequested: false } as any,
    });

    expect(decideCliOwnedRepairMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'repair_native1',
        decision: 'approve-guarded',
      })
    );
    expect(stream.button).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'workbench.action.chat.open',
        arguments: [
          expect.objectContaining({
            query: '@workspai /repair approve-guarded repair_native1',
            isPartialQuery: false,
          }),
        ],
      })
    );
  });

  it('continues a typed source-repair decision through the shared Studio agent loop', async () => {
    buildDashboardEvidenceBundleMock.mockResolvedValue({
      cards: [
        {
          id: 'workspaceVerify',
          label: 'Workspace Verify',
          status: 'fail',
          blocking: true,
          summary: 'Verify failed',
          scope: 'workspace',
          blockers: ['Source contract is incomplete'],
        },
      ],
    });
    executeCliOwnedCanonicalRepairMock.mockResolvedValue({
      transaction: {
        transactionId: 'repair_source1',
        state: 'decision-required',
        target: { cardId: 'workspaceVerify' },
        checkpoint: { files: [{ path: 'project/src/index.ts', existed: true }] },
        decision: {
          reason: 'Source repair is required.',
          options: ['manual-repair'],
          causes: [{ kind: 'source-repair-required' }],
        },
      },
      changedPaths: [],
      fileChanges: [],
    });
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };
    const extensionContext = { workspaceState: {} };

    const result = await runNativeChatRepair({
      prompt: 'Workspace Verify',
      context: {
        type: 'workspace',
        name: 'workspace',
        path: '/tmp/workspace',
        workspaceRootPath: '/tmp/workspace',
      },
      extensionContext: extensionContext as any,
      requestedModelId: 'copilot-model',
      stream: stream as any,
      token: { isCancellationRequested: false } as any,
    });

    expect(runNativeChatStudioAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionContext,
        workspacePath: '/tmp/workspace',
        requestedModelId: 'copilot-model',
        handoff: expect.objectContaining({ cardId: 'workspaceVerify' }),
      })
    );
    expect(result).toMatchObject({
      state: 'completed',
      transactionId: 'repair_source2',
      agentSessionId: 'native-agent-1',
    });
  });
});
