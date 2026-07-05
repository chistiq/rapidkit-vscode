import { describe, expect, it } from 'vitest';

import {
  buildSidebarStudioAuditReturnState,
  buildSidebarStudioReturnState,
} from '../../webview-ui/src/lib/sidebarStudioReturnState';

describe('sidebarStudioReturnState', () => {
  it('reports verified and refreshed only when verify passed and card is green', () => {
    expect(
      buildSidebarStudioReturnState({
        verifySucceeded: true,
        cardStatus: 'pass',
        refreshedCardIds: ['readiness', 'workspaceVerify'],
      })
    ).toEqual({
      status: 'verified-refreshed',
      title: 'Blocker resolved',
      detail: '2 dashboard card(s) refreshed. Return to Dashboard when you are ready.',
      refreshedCardIds: ['readiness', 'workspaceVerify'],
    });
  });

  it('reports partial progress when verify passed but refreshed evidence still blocks', () => {
    expect(
      buildSidebarStudioReturnState({
        verifySucceeded: true,
        cardStatus: 'fail',
        blockers: ['dependency gate failed'],
        refreshedCardIds: ['readiness'],
      })
    ).toMatchObject({
      status: 'still-blocked',
      title: 'Step verified, blocker remains',
      detail: 'dependency gate failed',
      refreshedCardIds: ['readiness'],
      topBlocker: 'dependency gate failed',
    });
  });

  it('reports the next blocker when verify itself did not pass', () => {
    expect(
      buildSidebarStudioReturnState({
        verifySucceeded: false,
        cardStatus: 'fail',
        blockers: ['doctor gate failed'],
        refreshedCardIds: ['doctor'],
      })
    ).toMatchObject({
      status: 'still-blocked',
      title: 'Next blocker found',
      detail: 'doctor gate failed',
      refreshedCardIds: ['doctor'],
      topBlocker: 'doctor gate failed',
    });
  });

  it('reports audit not saved without leaking workspace paths', () => {
    const state = buildSidebarStudioAuditReturnState({
      registryRecorded: true,
      feedbackRecorded: false,
      error: 'feedback write failed',
    });

    expect(state).toMatchObject({
      status: 'audit-not-saved',
      title: 'Audit not saved',
      detail: 'feedback write failed',
    });
    expect(JSON.stringify(state)).not.toContain('/home/');
  });
});
