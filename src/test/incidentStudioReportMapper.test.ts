import { describe, expect, it } from 'vitest';

import { mapAnalyzeReportToStudioState } from '../../webview-ui/src/lib/incidentStudioReportMapper';

describe('incidentStudioReportMapper', () => {
  it('maps a blocking analyze report into vNext Studio state without demo fixtures', () => {
    const state = mapAnalyzeReportToStudioState(
      {
        generatedAt: '2026-06-11T20:00:00.000Z',
        workspacePath: '/tmp/workspai',
        summary: {
          score: 62,
          verdict: 'blocked',
          projectCount: 3,
          runtimeCount: 2,
          findings: {
            fail: 1,
            warn: 2,
            info: 4,
          },
        },
        findings: [
          {
            id: 'doctor-fail',
            severity: 'fail',
            target: 'apps/api',
            title: 'Doctor gate failed',
            remediation: 'Run doctor and verify before apply.',
          },
          {
            id: 'stale-evidence',
            severity: 'warn',
            target: '.rapidkit/reports/analyze-last-run.json',
            title: 'Evidence needs refresh',
          },
        ],
        enterpriseControls: {
          evidencePath: '.rapidkit/reports/analyze-last-run.json',
        },
      },
      'Customer Workspace'
    );

    expect(state.workspaceName).toBe('Customer Workspace');
    expect(state.currentPhase).toBe('diagnose');
    expect(state.releasePosture).toBe('no-go');
    expect(state.policyGates).toMatchObject({
      flowState: 'blocking',
      telemetryState: 'complete',
      artifactId: '.rapidkit/reports/analyze-last-run.json',
    });
    expect(state.health).toMatchObject({
      modulesOk: 4,
      modulesWarning: 2,
      modulesError: 1,
    });
    expect(state.relatedFiles?.[0]).toMatchObject({
      path: 'apps/api',
      health: 'error',
    });
    expect(state.messages?.[0].content).toContain('Verdict: blocked');
    expect(state.messages?.[0].content).toContain('Doctor gate failed');
  });
});
