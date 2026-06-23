import { describe, expect, it } from 'vitest';

import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';
import {
  applyDashboardEvidenceMessage,
  emptyEvidencePayloadForWorkspace,
  isStaleEvidenceResponse,
  mergeEvidenceCardPatch,
} from '../../webview-ui/src/lib/dashboardEvidenceSession';

const basePayload = (overrides?: Partial<DashboardEvidencePayload>): DashboardEvidencePayload => ({
  workspacePath: '/ws/a',
  cards: [
    {
      id: 'doctor',
      label: 'Doctor',
      status: 'pass',
      summary: 'ok',
      scope: 'workspace',
    },
    {
      id: 'bootstrap',
      label: 'Bootstrap',
      status: 'missing',
      summary: 'pending',
      scope: 'workspace',
    },
  ],
  activity: [],
  onboarding: {
    isFreshInstall: false,
    recentWorkspaceCount: 1,
    hasActiveWorkspace: true,
  },
  ...overrides,
});

describe('dashboardEvidenceSession', () => {
  it('merges patch cards without dropping unrelated cards', () => {
    const current = basePayload();
    const merged = mergeEvidenceCardPatch(current, {
      cards: [
        {
          id: 'bootstrap',
          label: 'Bootstrap',
          status: 'pass',
          summary: 'ready',
          scope: 'workspace',
          artifactPath: '/ws/a/.rapidkit/reports/bootstrap.json',
        },
      ],
    });

    expect(merged.cards.find((card) => card.id === 'doctor')?.status).toBe('pass');
    expect(merged.cards.find((card) => card.id === 'bootstrap')?.status).toBe('pass');
  });

  it('rejects stale workspace responses', () => {
    expect(
      isStaleEvidenceResponse(basePayload({ workspacePath: '/ws/old' }), {
        activeWorkspacePath: '/ws/new',
        expectedRequestId: 2,
      })
    ).toBe(true);
  });

  it('applies patch mode incrementally', () => {
    const current = basePayload();
    const next = applyDashboardEvidenceMessage(
      current,
      basePayload({
        refreshMode: 'patch',
        requestId: 3,
        cards: [
          {
            id: 'bootstrap',
            label: 'Bootstrap',
            status: 'warn',
            summary: 'partial',
            scope: 'workspace',
          },
        ],
      }),
      { expectedRequestId: 3, activeWorkspacePath: '/ws/a' }
    );

    expect(next?.cards.find((card) => card.id === 'bootstrap')?.status).toBe('warn');
    expect(next?.cards.find((card) => card.id === 'doctor')?.status).toBe('pass');
  });

  it('creates empty payload for workspace switch reset', () => {
    const empty = emptyEvidencePayloadForWorkspace('/ws/b', 4);
    expect(empty.workspacePath).toBe('/ws/b');
    expect(empty.cards).toEqual([]);
    expect(empty.requestId).toBe(4);
  });
});
