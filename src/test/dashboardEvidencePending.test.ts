import { describe, expect, it } from 'vitest';

import {
  clearPendingEvidenceForCommand,
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
});
