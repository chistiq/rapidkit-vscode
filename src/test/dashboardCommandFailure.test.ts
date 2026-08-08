import { describe, expect, it } from 'vitest';

import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';
import {
  applyDashboardCommandFailures,
  successfulEvidenceCardIds,
  type DashboardCommandFailureMap,
} from '../../webview-ui/src/lib/dashboardCommandFailure';

const payload: DashboardEvidencePayload = {
  workspacePath: '/ws',
  cards: [
    {
      id: 'analyze',
      label: 'Analyze',
      status: 'pass',
      summary: 'Score 100',
      scope: 'workspace',
      artifactPath: '/ws/.rapidkit/reports/analyze-last-run.json',
    },
  ],
  activity: [],
  onboarding: {
    isFreshInstall: false,
    recentWorkspaceCount: 1,
    hasActiveWorkspace: true,
  },
};

describe('dashboardCommandFailure', () => {
  it('overlays failed command state onto the affected evidence card', () => {
    const failures: DashboardCommandFailureMap = {
      analyze: {
        command: 'workspaceAnalyze',
        reason: 'Analyze failed (exit 1). bad config',
        cardIds: ['analyze'],
        exitCode: 1,
        stderrTail: 'bad config',
        suggestedNextAction: 'Repair evidence or open the Workspai Evidence output.',
      },
    };

    const next = applyDashboardCommandFailures(payload, failures);
    const analyze = next?.cards.find((card) => card.id === 'analyze');

    expect(analyze?.status).toBe('fail');
    expect(analyze?.blocking).toBe(false);
    expect(analyze?.summary).toContain('Last run failed');
    expect(analyze?.blockers?.[0]).toContain('Analyze failed');
    expect(analyze?.metrics).toMatchObject({
      commandId: 'workspaceAnalyze',
      exitCode: 1,
      stderrTail: 'bad config',
      failedRun: 1,
    });
    expect(analyze?.detailSections?.[0]?.body).toContain('exitCode: 1');
  });

  it('preserves an already-proven blocker when its refresh command fails', () => {
    const next = applyDashboardCommandFailures(
      {
        ...payload,
        cards: [{ ...payload.cards[0], status: 'fail', blocking: true }],
      },
      {
        analyze: {
          command: 'workspaceAnalyze',
          reason: 'Refresh failed.',
          cardIds: ['analyze'],
        },
      }
    );

    expect(next?.cards[0]?.blocking).toBe(true);
  });

  it('only clears failed-run overlays after a non-failing artifact-bearing card arrives', () => {
    expect(
      successfulEvidenceCardIds({
        ...payload,
        cards: [{ ...payload.cards[0], status: 'missing', artifactPath: undefined }],
      })
    ).toEqual([]);

    expect(successfulEvidenceCardIds(payload)).toEqual(['analyze']);
  });
});
