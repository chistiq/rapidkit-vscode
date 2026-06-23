import { describe, expect, it } from 'vitest';

import {
  clearPendingEvidenceForCommand,
  evidenceCardPendingLabel,
  reconcilePendingEvidenceCardIds,
  resolveSettledEvidenceCardIds,
} from '../../webview-ui/src/lib/dashboardEvidencePending';
import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';

describe('dashboardEvidencePending', () => {
  it('clears pending cards when evidence resolves', () => {
    const payload: DashboardEvidencePayload = {
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
          generatedAt: '2026-06-10T10:00:00.000Z',
        },
      ],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(reconcilePendingEvidenceCardIds(['doctor', 'analyze'], payload)).toEqual(['analyze']);
  });

  it('clears pending cards when activity completes or fails', () => {
    const payload: DashboardEvidencePayload = {
      cards: [],
      activity: [
        {
          id: 'checkWorkspaceHealth-1',
          command: 'checkWorkspaceHealth',
          label: 'Workspace Doctor',
          scope: 'workspace',
          status: 'completed',
          timestamp: Date.now(),
        },
      ],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(resolveSettledEvidenceCardIds(payload)).toEqual(new Set(['doctor']));
    expect(reconcilePendingEvidenceCardIds(['doctor'], payload)).toEqual([]);
  });

  it('clears pending cards for failed dashboard commands', () => {
    expect(clearPendingEvidenceForCommand(['bootstrap', 'analyze'], 'workspaceBootstrap')).toEqual([
      'analyze',
    ]);
  });

  it('clears pending refresh cards when a patch response returns', () => {
    const payload: DashboardEvidencePayload = {
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'missing',
          summary: 'still missing',
          scope: 'workspace',
        },
      ],
      activity: [],
      refreshMode: 'patch',
      patchCardIds: ['doctor'],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(reconcilePendingEvidenceCardIds(['doctor', 'analyze'], payload)).toEqual(['analyze']);
  });

  it('clears all pending refresh cards after a full evidence response', () => {
    const payload: DashboardEvidencePayload = {
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
        },
        {
          id: 'analyze',
          label: 'Analyze',
          status: 'missing',
          summary: 'missing',
          scope: 'workspace',
        },
      ],
      activity: [],
      refreshMode: 'full',
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(reconcilePendingEvidenceCardIds(['doctor', 'analyze', 'readiness'], payload)).toEqual([
      'readiness',
    ]);
  });

  it('labels refresh and run pending states separately', () => {
    expect(evidenceCardPendingLabel('doctor', ['doctor'], [])).toBe('Running');
    expect(evidenceCardPendingLabel('doctor', [], ['doctor'])).toBe('Refreshing');
    expect(evidenceCardPendingLabel('doctor', ['doctor'], ['doctor'])).toBe('Refreshing');
  });
});
