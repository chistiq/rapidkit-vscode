import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_DAY0_FUNNEL_CONTRACT,
  buildDashboardDay0Funnel,
} from '../../webview-ui/src/lib/dashboardDay0Funnel';
import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';

function evidence(overrides: Partial<DashboardEvidencePayload> = {}): DashboardEvidencePayload {
  return {
    workspacePath: '/repo',
    cards: [],
    activity: [],
    onboarding: {
      isFreshInstall: false,
      recentWorkspaceCount: 1,
      hasActiveWorkspace: true,
    },
    ...overrides,
  };
}

describe('dashboardDay0Funnel', () => {
  it('defines one canonical day-0 funnel contract for Home, Run, Repair, and Studio', () => {
    expect(DASHBOARD_DAY0_FUNNEL_CONTRACT.map((step) => step.id)).toEqual([
      'workspace_selected',
      'first_artifact_generated',
      'first_blocker_selected',
      'studio_opened',
      'verify_passed',
    ]);
    expect(DASHBOARD_DAY0_FUNNEL_CONTRACT.map((step) => step.surface)).toEqual([
      'home',
      'run',
      'repair',
      'studio',
      'repair',
    ]);
    expect(DASHBOARD_DAY0_FUNNEL_CONTRACT.map((step) => step.cta)).toEqual([
      'Create or import workspace',
      'Generate first evidence',
      'Open Repair',
      'Fix by Workspai',
      'Run verify',
    ]);
  });

  it('starts with workspace selection on fresh installs', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: false } as never,
      evidence: evidence({
        workspacePath: undefined,
        onboarding: {
          isFreshInstall: true,
          recentWorkspaceCount: 0,
          hasActiveWorkspace: false,
        },
      }),
    });

    expect(funnel.summary).toBe('0/5 complete');
    expect(funnel.current).toMatchObject({
      id: 'workspace_selected',
      state: 'current',
    });
    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'select-workspace',
      section: 'overview',
      cta: 'Create or import',
    });
  });

  it('marks first evidence from local milestone snapshots', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/repo' } as never,
      evidence: evidence({
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
          milestones: {
            firstArtifactGenerated: true,
          },
        },
      }),
    });

    expect(funnel.steps.map((step) => [step.id, step.state])).toEqual([
      ['workspace_selected', 'complete'],
      ['first_artifact_generated', 'complete'],
      ['first_blocker_selected', 'pending'],
      ['studio_opened', 'pending'],
      ['verify_passed', 'pending'],
    ]);
    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'release-readiness',
      section: 'operate',
    });
  });

  it('promotes actionable blockers into the Repair target state', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/repo' } as never,
      evidence: evidence({
        cards: [
          {
            id: 'analyze',
            label: 'Analyze',
            status: 'fail',
            summary: 'Analyze blocked',
            scope: 'workspace',
            artifactPath: '/repo/.rapidkit/reports/analyze-last-run.json',
            blockers: ['score below policy'],
            incidentStudioTarget: 'analyze',
          },
        ],
      }),
    });

    expect(funnel.summary).toBe('2/5 complete');
    expect(funnel.steps.find((step) => step.id === 'first_blocker_selected')).toMatchObject({
      state: 'current',
    });
    expect(funnel.steps.find((step) => step.id === 'studio_opened')).toMatchObject({
      state: 'pending',
    });
    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'repair-blocker',
      section: 'repair',
      cta: 'Open Repair',
    });
  });

  it('uses verify and return milestones for completed repair-loop progress', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/repo' } as never,
      evidence: evidence({
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
          milestones: {
            firstArtifactGenerated: true,
            firstBlockerFixed: true,
            verifyPassAfterStudioFix: true,
            returnToDashboardAfterVerify: true,
          },
        },
      }),
    });

    expect(funnel.summary).toBe('5/5 complete');
    expect(funnel.steps.every((step) => step.state === 'complete')).toBe(true);
    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'release-readiness',
      section: 'operate',
    });
  });

  it('resumes at verify after Studio has opened for an actionable blocker', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/repo' } as never,
      evidence: evidence({
        cards: [
          {
            id: 'readiness',
            label: 'Release Readiness',
            status: 'fail',
            summary: 'Readiness blocked',
            scope: 'workspace',
            artifactPath: '/repo/.rapidkit/reports/release-readiness-last-run.json',
            blockers: ['dependency gate failed'],
            incidentStudioTarget: 'readiness',
          },
        ],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
          milestones: {
            firstArtifactGenerated: true,
            studioOpened: true,
          },
        },
      }),
    });

    expect(funnel.summary).toBe('4/5 complete');
    expect(funnel.steps.find((step) => step.id === 'first_blocker_selected')).toMatchObject({
      state: 'complete',
    });
    expect(funnel.steps.find((step) => step.id === 'studio_opened')).toMatchObject({
      state: 'complete',
    });
    expect(funnel.steps.find((step) => step.id === 'verify_passed')).toMatchObject({
      state: 'current',
    });
    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'repair-blocker',
      section: 'repair',
    });
  });

  it('guides fixed blockers to verify before release readiness', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/repo' } as never,
      evidence: evidence({
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
          milestones: {
            firstArtifactGenerated: true,
            firstBlockerFixed: true,
          },
        },
      }),
    });

    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'verify-fix',
      section: 'repair',
      cta: 'Verify in Repair',
    });
  });

  it('guides passed verify runs back to dashboard readiness refresh', () => {
    const funnel = buildDashboardDay0Funnel({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/repo' } as never,
      evidence: evidence({
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
          milestones: {
            firstArtifactGenerated: true,
            firstBlockerFixed: true,
            verifyPassAfterStudioFix: true,
          },
        },
      }),
    });

    expect(funnel.recommendedFocus).toMatchObject({
      reason: 'return-to-dashboard',
      section: 'operate',
      cta: 'Open Run',
    });
  });
});
