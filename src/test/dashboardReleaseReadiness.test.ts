import { describe, expect, it } from 'vitest';

import {
  deriveDashboardReleaseGateReadiness,
  isWorkspaceEmptyForRelease,
} from '../../webview-ui/src/lib/dashboardReleaseReadiness';

describe('dashboardReleaseReadiness', () => {
  it('blocks release when workspace has zero registered projects', () => {
    const evidence = {
      cards: [
        {
          id: 'workspaceModel',
          label: 'Model',
          status: 'pass',
          summary: 'empty',
          scope: 'workspace',
          metrics: { projectCount: 0 },
        },
      ],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(isWorkspaceEmptyForRelease(evidence)).toBe(true);
    expect(deriveDashboardReleaseGateReadiness(evidence)).toMatchObject({
      releaseReady: false,
      projectCount: 0,
      needsStudioVerify: false,
    });
  });

  it('requires analyze and readiness green enough when projects exist', () => {
    const evidence = {
      cards: [
        {
          id: 'workspaceModel',
          label: 'Model',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
          metrics: { projectCount: 2 },
        },
        {
          id: 'readiness',
          label: 'Readiness',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
        },
        {
          id: 'analyze',
          label: 'Analyze',
          status: 'fail',
          summary: 'blocked',
          scope: 'workspace',
        },
      ],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(deriveDashboardReleaseGateReadiness(evidence).releaseReady).toBe(false);
  });

  it('blocks release when workspace verify fails', () => {
    const evidence = {
      cards: [
        {
          id: 'workspaceModel',
          label: 'Model',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
          metrics: { projectCount: 1 },
        },
        {
          id: 'readiness',
          label: 'Readiness',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
        },
        {
          id: 'analyze',
          label: 'Analyze',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
        },
        {
          id: 'workspaceVerify',
          label: 'Verify',
          status: 'fail',
          summary: 'blocked',
          scope: 'workspace',
        },
      ],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(deriveDashboardReleaseGateReadiness(evidence)).toMatchObject({
      releaseReady: false,
      blockedReason: 'Workspace verify failed — open Studio to re-run verify gates.',
      needsStudioVerify: true,
    });
  });
});
