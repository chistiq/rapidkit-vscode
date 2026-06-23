import { describe, expect, it } from 'vitest';

import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';
import { buildDashboardEvidenceBrief } from '../../webview-ui/src/lib/dashboardEvidenceBrief';

const baseEvidence: DashboardEvidencePayload = {
  workspacePath: '/workspace',
  cards: [],
  activity: [],
  onboarding: {
    isFreshInstall: false,
    recentWorkspaceCount: 1,
    hasActiveWorkspace: true,
  },
};

describe('dashboard evidence brief', () => {
  it('summarizes blocked evidence and points at the primary blocker', () => {
    const brief = buildDashboardEvidenceBrief({
      evidence: {
        ...baseEvidence,
        cards: [
          {
            id: 'doctor',
            label: 'Workspace Doctor',
            status: 'fail',
            summary: 'Doctor found a missing dependency.',
            scope: 'workspace',
            blockers: ['Missing runtime'],
          },
          {
            id: 'readiness',
            label: 'Readiness',
            status: 'missing',
            summary: 'Readiness has not run.',
            scope: 'workspace',
          },
        ],
      },
      hasWorkspace: true,
      hasProject: false,
    });

    expect(brief.posture).toBe('blocked');
    expect(brief.label).toBe('Blocked');
    expect(brief.primaryCard?.id).toBe('doctor');
    expect(brief.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'blocked', value: 1 })])
    );
  });

  it('keeps a quiet healthy brief when evidence has no blockers or warnings', () => {
    const brief = buildDashboardEvidenceBrief({
      evidence: {
        ...baseEvidence,
        cards: [
          {
            id: 'doctor',
            label: 'Workspace Doctor',
            status: 'pass',
            summary: 'Doctor passed.',
            scope: 'workspace',
            generatedAt: new Date().toISOString(),
          },
          {
            id: 'bootstrap',
            label: 'Bootstrap',
            status: 'pass',
            summary: 'Bootstrap compliance passed.',
            scope: 'workspace',
            generatedAt: new Date().toISOString(),
          },
        ],
      },
      hasWorkspace: true,
      hasProject: true,
    });

    expect(brief.posture).toBe('healthy');
    expect(brief.label).toBe('Healthy');
    expect(brief.summary).toContain('No blockers');
  });

  it('uses an empty posture before a workspace is selected', () => {
    const brief = buildDashboardEvidenceBrief({
      evidence: null,
      hasWorkspace: false,
      hasProject: false,
    });

    expect(brief.posture).toBe('empty');
    expect(brief.label).toBe('No workspace');
    expect(brief.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'blockers', value: 0 })])
    );
  });
});
