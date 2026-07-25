import { describe, expect, it } from 'vitest';

import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';
import { buildDashboardEvidenceBrief } from '../../webview-ui/src/lib/dashboardEvidenceBrief';
import { countEvidenceAttentionBuckets } from '../../webview-ui/src/lib/evidenceAgentContext';

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

  it('uses scaffold-ready posture for empty workspaces with only scaffold warnings', () => {
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
          },
          {
            id: 'bootstrap',
            label: 'Bootstrap',
            status: 'pass',
            summary: 'Bootstrap passed.',
            scope: 'workspace',
          },
          {
            id: 'workspaceModel',
            label: 'Workspace Model',
            status: 'warn',
            summary: '0 project(s) · validation warning',
            scope: 'workspace',
            metrics: { projectCount: 0 },
            blockers: ['workspace.projects.missing: no backend projects detected'],
          },
          {
            id: 'workspaceVerify',
            label: 'Workspace Verify',
            status: 'warn',
            summary: 'scaffold needs attention',
            scope: 'workspace',
            blockers: ['workspace.doctor: Doctor evidence is stale'],
          },
        ],
      },
      hasWorkspace: true,
      hasProject: false,
    });

    expect(brief.posture).toBe('attention');
    expect(brief.label).toBe('Scaffold ready');
    expect(brief.currentStep?.title).toBe('Add your first project');
  });

  it('keeps advisory evidence cards out of the blocked counter', () => {
    const brief = buildDashboardEvidenceBrief({
      evidence: {
        ...baseEvidence,
        cards: [
          {
            id: 'workspaceSync',
            label: 'Workspace Sync',
            status: 'warn',
            summary: 'No projects registered yet.',
            scope: 'workspace',
            metrics: { projectCount: 0 },
          },
          {
            id: 'workspaceDiff',
            label: 'Workspace Diff',
            status: 'pass',
            summary: 'Workspace model changed since baseline.',
            scope: 'workspace',
            blockers: ['Workspace model changed since baseline'],
            blocking: false,
          },
          {
            id: 'workspaceImpact',
            label: 'Workspace Impact',
            status: 'warn',
            summary: 'Review the verification plan.',
            scope: 'workspace',
            blockers: ['Use the verification plan before release actions.'],
            blocking: false,
          },
          {
            id: 'workspaceContextAgent',
            label: 'Agent Context',
            status: 'warn',
            summary: 'Optional evidence is not available.',
            scope: 'workspace',
            blockers: ['doctorFixResult', 'projectDoctor'],
            blocking: false,
          },
          {
            id: 'mirror',
            label: 'Mirror',
            status: 'warn',
            summary: 'Mirror config is optional and missing.',
            scope: 'workspace',
            blockers: ['Mirror config is missing'],
            blocking: false,
          },
        ],
      },
      hasWorkspace: true,
      hasProject: false,
    });

    expect(brief.posture).toBe('attention');
    expect(brief.label).toBe('Scaffold ready');
    expect(brief.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'blocked', value: 0 })])
    );
  });

  it('uses the same contract-backed counters as the attention queue', () => {
    const evidence: DashboardEvidencePayload = {
      ...baseEvidence,
      cards: [
        {
          id: 'workspaceModel',
          label: 'Workspace Model',
          status: 'pass',
          summary: '2 projects modeled.',
          scope: 'workspace',
          metrics: { projectCount: 2 },
          blocking: false,
        },
        {
          id: 'readiness',
          label: 'Readiness',
          status: 'pass',
          summary: 'All gates passed.',
          scope: 'workspace',
          blocking: false,
        },
        {
          id: 'analyze',
          label: 'Analyze',
          status: 'warn',
          summary: 'One advisory warning.',
          scope: 'workspace',
          blockers: ['Review advisory'],
          blocking: false,
        },
        {
          id: 'workspaceContextAgent',
          label: 'Agent Context',
          status: 'fail',
          summary: 'Optional context needs attention.',
          scope: 'workspace',
          blockers: ['Optional context unavailable'],
          blocking: false,
        },
        {
          id: 'autopilot',
          label: 'Autopilot release',
          status: 'missing',
          summary: 'Not run.',
          scope: 'workspace',
          blocking: false,
        },
      ],
    };

    const buckets = countEvidenceAttentionBuckets(evidence);
    const brief = buildDashboardEvidenceBrief({ evidence, hasWorkspace: true, hasProject: true });
    const metric = (label: string) => brief.metrics.find((entry) => entry.label === label)?.value;

    expect(buckets).toEqual({ blocked: 0, attention: 2, missing: 1, ok: 2 });
    expect(metric('blocked')).toBe(buckets.blocked);
    expect(metric('attention')).toBe(buckets.attention);
    expect(metric('missing')).toBe(buckets.missing);
  });

  it('uses scaffold-ready posture when empty workspace has scaffold-only fail cards', () => {
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
          },
          {
            id: 'bootstrap',
            label: 'Bootstrap',
            status: 'pass',
            summary: 'Bootstrap passed.',
            scope: 'workspace',
          },
          {
            id: 'workspaceModel',
            label: 'Workspace Model',
            status: 'warn',
            summary: '0 project(s) · validation warning',
            scope: 'workspace',
            metrics: { projectCount: 0 },
          },
          {
            id: 'analyze',
            label: 'Analyze',
            status: 'fail',
            summary: 'Analyze needs attention before release.',
            scope: 'workspace',
            blockers: ['analyze-last-run: not yet run'],
          },
          {
            id: 'readiness',
            label: 'Readiness',
            status: 'fail',
            summary: 'Readiness not run.',
            scope: 'workspace',
            blockers: ['release-readiness: missing evidence'],
          },
          {
            id: 'workspaceVerify',
            label: 'Workspace Verify',
            status: 'fail',
            summary: 'Verify blocked.',
            scope: 'workspace',
            blockers: ['workspace.doctor: Doctor evidence is stale'],
          },
        ],
      },
      hasWorkspace: true,
      hasProject: false,
    });

    expect(brief.posture).toBe('attention');
    expect(brief.label).toBe('Scaffold ready');
    expect(brief.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'blocked', value: 0 })])
    );
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
