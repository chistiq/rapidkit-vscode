import { describe, expect, it } from 'vitest';
import {
  buildEvidenceCardCommandData,
  evidenceCardNeedsDirectRun,
} from '../../webview-ui/src/lib/dashboardEvidenceDirectRun';
import type { DashboardEvidenceCard } from '../../webview-ui/src/lib/dashboardEvidence';

function card(
  partial: Partial<DashboardEvidenceCard> & Pick<DashboardEvidenceCard, 'id' | 'status'>
): DashboardEvidenceCard {
  return {
    label: partial.id,
    summary: '',
    scope: 'workspace',
    ...partial,
  };
}

describe('dashboardEvidenceDirectRun', () => {
  it('treats bootstrap pending and missing cards as direct-run', () => {
    expect(
      evidenceCardNeedsDirectRun(
        card({
          id: 'bootstrap',
          status: 'missing',
          metrics: { pendingBootstrap: 1, profile: 'polyglot' },
        })
      )
    ).toBe(true);
    expect(evidenceCardNeedsDirectRun(card({ id: 'doctor', status: 'missing' }))).toBe(true);
    expect(
      evidenceCardNeedsDirectRun(
        card({ id: 'analyze', status: 'pass', artifactPath: '/tmp/analyze.json' })
      )
    ).toBe(false);
  });

  it('treats corrupt artifact cards as repair direct-runs even when an artifact path exists', () => {
    const corrupt = card({
      id: 'analyze',
      status: 'fail',
      artifactPath: '/ws/.rapidkit/reports/analyze-last-run.json',
      metrics: { corruptArtifact: 1 },
    });

    expect(evidenceCardNeedsDirectRun(corrupt)).toBe(true);

    const payload = buildEvidenceCardCommandData(corrupt, 'workspaceAnalyze', { path: '/ws' });

    expect(payload).toMatchObject({
      source: 'evidence',
      evidenceDirectRun: true,
      repairReason: 'corrupt-artifact',
      repairArtifactPath: '/ws/.rapidkit/reports/analyze-last-run.json',
      path: '/ws',
    });
  });

  it('builds bootstrap direct payload with saved profile hint flags', () => {
    const payload = buildEvidenceCardCommandData(
      card({
        id: 'bootstrap',
        status: 'missing',
        metrics: { pendingBootstrap: 1, profile: 'polyglot' },
      }),
      'workspaceBootstrap',
      { path: '/ws', name: 'Tests' }
    );

    expect(payload).toMatchObject({
      source: 'evidence',
      evidenceDirectRun: true,
      preferExistingProfile: true,
      path: '/ws',
      name: 'Tests',
    });
  });

  it('builds doctor direct payload without health menu', () => {
    const payload = buildEvidenceCardCommandData(
      card({ id: 'doctor', status: 'missing' }),
      'checkWorkspaceHealth',
      { path: '/ws' }
    );

    expect(payload).toMatchObject({
      source: 'evidence',
      preferredAction: 'check',
      path: '/ws',
    });
  });

  it('skips direct flags when artifact already exists', () => {
    const payload = buildEvidenceCardCommandData(
      card({
        id: 'analyze',
        status: 'pass',
        artifactPath: '/ws/.rapidkit/reports/analyze-last-run.json',
      }),
      'workspaceAnalyze',
      { path: '/ws' }
    );

    expect(payload).toEqual({ path: '/ws' });
    expect(payload?.evidenceDirectRun).toBeUndefined();
  });

  it('passes bootstrap profile hint from pending card metrics', () => {
    const payload = buildEvidenceCardCommandData(
      card({
        id: 'bootstrap',
        status: 'missing',
        metrics: { pendingBootstrap: 1, profile: 'polyglot' },
      }),
      'workspaceBootstrap',
      { path: '/ws' }
    );

    expect(payload?.profile).toBe('polyglot');
  });
});
