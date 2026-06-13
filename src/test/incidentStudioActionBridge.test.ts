import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock('../ui/panels/incidentStudioAnalyze', () => ({
  loadAnalyzeReport: vi.fn(),
  runWorkspaceAnalyze: vi.fn(),
}));

vi.mock('../ui/panels/incidentStudioTelemetryBridge', () => ({
  resolveIncidentStudioTelemetry: vi.fn(),
}));

vi.mock('../ui/panels/incidentStudioInlineCommandBridge', () => ({
  runIncidentInlineCommand: vi.fn(),
}));

import { executeVerifyGatesAction } from '../ui/panels/incidentStudioActionBridge';
import { loadAnalyzeReport } from '../ui/panels/incidentStudioAnalyze';
import { resolveIncidentStudioTelemetry } from '../ui/panels/incidentStudioTelemetryBridge';
import { runIncidentInlineCommand } from '../ui/panels/incidentStudioInlineCommandBridge';

describe('incidentStudioActionBridge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('runs release gate command instead of analyze for verify-gates', async () => {
    vi.mocked(loadAnalyzeReport).mockReturnValue({
      report: {
        schemaVersion: 'rapidkit.analyze.v1',
        generatedAt: '2026-06-10T12:00:00.000Z',
        workspacePath: '/tmp/demo',
        summary: {
          score: 88,
          verdict: 'needs-attention',
          projectCount: 1,
          runtimeCount: 1,
          findings: { fail: 0, warn: 1, info: 2 },
        },
        findings: [],
        enterpriseControls: {
          jsonReady: true,
          ciGateCommand: 'make ci-gate',
          releaseGateCommand: 'make release-gate',
        },
      },
      error: null,
    });
    vi.mocked(runIncidentInlineCommand).mockResolvedValue({
      command: 'make release-gate',
      success: true,
      output: 'gate ok',
    });
    vi.mocked(resolveIncidentStudioTelemetry).mockResolvedValue({
      commandSummary: null,
      onboardingSummary: null,
      studioHardGateStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: null,
        windowEndAt: '2026-06-10T12:00:00.000Z',
        thresholds: {
          verifyPhaseReachMin: 0.5,
          bridgeRouteCompletionMin: 0.5,
        },
        metrics: {
          loopStarted: 1,
          nextActionClicked: 1,
          actionExecuted: 1,
          verifyOutcomes: 1,
          verifyPhaseReach: 1,
          bridgeRouteCompletionRate: 1,
        },
        gates: {
          verifyPhaseReachPass: true,
          bridgeRouteCompletionPass: true,
          telemetryEvidencePass: true,
          overallPass: true,
        },
      },
    } as never);

    const result = await executeVerifyGatesAction({} as never, {
      workspacePath: '/tmp/demo',
      workspaceName: 'demo',
    });

    expect(runIncidentInlineCommand).toHaveBeenCalledWith({
      command: 'make release-gate',
      workspacePath: '/tmp/demo',
      actionId: 'verify-gates',
    });
    expect(result.gatePassed).toBe(true);
    expect(result.gateCommand).toBe('make release-gate');
    expect(result.summary).toContain('Telemetry policy gates: PASS');
  });
});
