import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeStudioActionById: vi.fn(),
  runIncidentInlineCommand: vi.fn(),
  resolveIncidentStudioTelemetry: vi.fn(),
  resolveStudioMutationBlockReason: vi.fn(),
}));

vi.mock('../ui/panels/incidentStudioActionBridge', () => ({
  executeStudioActionById: mocks.executeStudioActionById,
}));

vi.mock('../ui/panels/incidentStudioInlineCommandBridge', () => ({
  runIncidentInlineCommand: mocks.runIncidentInlineCommand,
}));

vi.mock('../ui/panels/incidentStudioTelemetryBridge', () => ({
  resolveIncidentStudioTelemetry: mocks.resolveIncidentStudioTelemetry,
}));

vi.mock('../ui/panels/incidentStudioMutationGate', () => ({
  resolveStudioMutationBlockReason: mocks.resolveStudioMutationBlockReason,
}));

vi.mock('../ui/panels/incidentStudioShipEvidenceBridge', () => ({
  postIncidentStudioShipEvidence: vi.fn(),
}));

vi.mock('../ui/panels/incidentStudioStabilizationLoopBridge', () => ({
  refreshIncidentStudioStabilizationLoop: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn() },
}));

import { dispatchIncidentStudioShipLoopStep } from '../ui/panels/incidentStudioShipLoopBridge';

describe('dispatchIncidentStudioShipLoopStep integration', () => {
  const webview = { postMessage: vi.fn() } as unknown as import('vscode').Webview;
  const context = {} as import('vscode').ExtensionContext;
  const workspace = { workspacePath: '/tmp/ws', workspaceName: 'ws' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIncidentStudioTelemetry.mockResolvedValue({});
    mocks.resolveStudioMutationBlockReason.mockReturnValue(null);
    mocks.executeStudioActionById.mockResolvedValue({
      actionResult: { gatePassed: true, summary: 'Analyze complete' },
    });
    mocks.runIncidentInlineCommand.mockResolvedValue({
      success: true,
      output: 'readiness ok',
    });
  });

  it('blocks mutating archive step when mutation gate fails', async () => {
    mocks.resolveStudioMutationBlockReason.mockReturnValue(
      'Policy gates are blocking mutating Studio actions.'
    );

    const result = await dispatchIncidentStudioShipLoopStep({
      stepId: 'archive',
      webview,
      context,
      workspace,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Policy gates');
    expect(mocks.runIncidentInlineCommand).not.toHaveBeenCalled();
    expect(mocks.executeStudioActionById).not.toHaveBeenCalled();
  });

  it('runs analyze via studio action and returns success', async () => {
    const result = await dispatchIncidentStudioShipLoopStep({
      stepId: 'analyze',
      webview,
      context,
      workspace,
    });

    expect(result.success).toBe(true);
    expect(mocks.executeStudioActionById).toHaveBeenCalledWith(
      context,
      workspace,
      'run-analyze',
      expect.any(Object)
    );
  });

  it('runs readiness via inline command', async () => {
    const result = await dispatchIncidentStudioShipLoopStep({
      stepId: 'readiness',
      webview,
      context,
      workspace,
    });

    expect(result.success).toBe(true);
    expect(mocks.runIncidentInlineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npx workspai readiness --json',
        workspacePath: '/tmp/ws',
      })
    );
  });

  it('runs archive via npm workspace export with an explicit output path', async () => {
    const result = await dispatchIncidentStudioShipLoopStep({
      stepId: 'archive',
      webview,
      context,
      workspace,
    });

    expect(result.success).toBe(true);
    expect(mocks.runIncidentInlineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command:
          'npx workspai workspace export --output team-workspace.workspai-archive.zip --json',
        workspacePath: '/tmp/ws',
      })
    );
  });
});
