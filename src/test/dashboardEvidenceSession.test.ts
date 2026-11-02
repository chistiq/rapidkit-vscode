import { describe, expect, it } from 'vitest';

import type { DashboardEvidenceCardId } from '@workspai-contracts/dashboardEvidenceCards';
import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';
import {
  applyDashboardEvidenceMessage,
  emptyEvidencePayloadForWorkspace,
  filterEvidencePatchToLatestCardRequests,
  isStaleEvidenceResponse,
  mergeEvidenceCardPatch,
  preserveNewerEvidenceCardRequests,
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

  it('rejects evidence scoped to a previously selected project', () => {
    expect(
      isStaleEvidenceResponse(basePayload({ projectPath: '/repo/project-a' }), {
        activeWorkspacePath: '/ws/a',
        activeProjectPath: '/repo/project-b',
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

  it('orders concurrent card patches independently', () => {
    const latestRequestIds = new Map<DashboardEvidenceCardId, number>([
      ['doctor', 4],
      ['bootstrap', 5],
    ]);
    const doctorResponse = basePayload({
      refreshMode: 'patch',
      requestId: 4,
      patchCardIds: ['doctor'],
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'warn',
          summary: 'updated',
          scope: 'workspace',
        },
      ],
    });

    expect(
      filterEvidencePatchToLatestCardRequests(doctorResponse, latestRequestIds)?.cards
    ).toEqual(doctorResponse.cards);
    expect(
      filterEvidencePatchToLatestCardRequests({ ...doctorResponse, requestId: 3 }, latestRequestIds)
    ).toBeNull();
    const mixedResponse = basePayload({
      refreshMode: 'patch',
      requestId: 5,
      patchCardIds: ['doctor', 'bootstrap'],
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'fail',
          summary: 'superseded',
          scope: 'workspace',
        },
        {
          id: 'bootstrap',
          label: 'Bootstrap',
          status: 'pass',
          summary: 'current',
          scope: 'workspace',
        },
      ],
    });
    expect(
      filterEvidencePatchToLatestCardRequests(mixedResponse, latestRequestIds)?.cards.map(
        (card) => card.id
      )
    ).toEqual(['bootstrap']);
  });

  it('keeps newer card refreshes when a full response arrives later', () => {
    const current = basePayload({
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'warn',
          summary: 'latest card refresh',
          scope: 'workspace',
        },
      ],
    });
    const incoming = basePayload({
      requestId: 7,
      refreshMode: 'full',
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'missing',
          summary: 'stale full response',
          scope: 'workspace',
        },
        {
          id: 'bootstrap',
          label: 'Bootstrap',
          status: 'pass',
          summary: 'full response',
          scope: 'workspace',
        },
      ],
    });
    const ordered = preserveNewerEvidenceCardRequests(
      current,
      incoming,
      new Map<DashboardEvidenceCardId, number>([
        ['doctor', 8],
        ['bootstrap', 7],
      ])
    );

    expect(ordered.cards.find((card) => card.id === 'doctor')?.summary).toBe('latest card refresh');
    expect(ordered.cards.find((card) => card.id === 'bootstrap')?.summary).toBe('full response');
  });

  it('rejects patch evidence from a previously selected project', () => {
    const current = basePayload({ projectPath: '/repo/project-b' });
    const next = applyDashboardEvidenceMessage(
      current,
      basePayload({
        projectPath: '/repo/project-a',
        refreshMode: 'patch',
        requestId: 6,
        patchCardIds: ['doctor'],
      }),
      {
        activeWorkspacePath: '/ws/a',
        activeProjectPath: '/repo/project-b',
        expectedRequestId: 6,
      }
    );

    expect(next).toBe(current);
  });

  it('preserves active project evidence when a workspace-only full payload arrives', () => {
    const current = basePayload({
      projectPath: '/repo/adopted-project',
      projectName: 'adopted-project',
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'pass',
          summary: 'workspace ok',
          scope: 'workspace',
        },
        {
          id: 'projectDoctor',
          label: 'Doctor',
          status: 'warn',
          summary: '83% health',
          scope: 'project',
          artifactPath: '/repo/adopted-project/.rapidkit/reports/doctor-project-last-run.json',
        },
      ],
    });

    const next = applyDashboardEvidenceMessage(
      current,
      basePayload({
        cards: [
          {
            id: 'doctor',
            label: 'Doctor',
            status: 'pass',
            summary: 'workspace ok',
            scope: 'workspace',
          },
          {
            id: 'projectDoctor',
            label: 'Doctor',
            status: 'missing',
            summary: 'No run yet',
            scope: 'project',
          },
        ],
        refreshMode: 'full',
        requestId: 4,
      }),
      {
        expectedRequestId: 4,
        activeWorkspacePath: '/ws/a',
        activeProjectPath: '/repo/adopted-project',
      }
    );

    expect(next?.projectPath).toBe('/repo/adopted-project');
    expect(next?.cards.find((card) => card.id === 'projectDoctor')?.status).toBe('warn');
    expect(next?.cards.find((card) => card.id === 'projectDoctor')?.artifactPath).toBe(
      '/repo/adopted-project/.rapidkit/reports/doctor-project-last-run.json'
    );
  });

  it('does not preserve project evidence after the active project changes', () => {
    const current = basePayload({
      projectPath: '/repo/old-project',
      cards: [
        {
          id: 'projectDoctor',
          label: 'Doctor',
          status: 'warn',
          summary: 'old',
          scope: 'project',
        },
      ],
    });

    const next = applyDashboardEvidenceMessage(
      current,
      basePayload({
        cards: [
          {
            id: 'projectDoctor',
            label: 'Doctor',
            status: 'missing',
            summary: 'No run yet',
            scope: 'project',
          },
        ],
        refreshMode: 'full',
        requestId: 5,
      }),
      {
        expectedRequestId: 5,
        activeWorkspacePath: '/ws/a',
        activeProjectPath: '/repo/new-project',
      }
    );

    expect(next?.projectPath).toBeUndefined();
    expect(next?.cards.find((card) => card.id === 'projectDoctor')?.status).toBe('missing');
  });

  it('creates empty payload for workspace switch reset', () => {
    const empty = emptyEvidencePayloadForWorkspace('/ws/b', 4);
    expect(empty.workspacePath).toBe('/ws/b');
    expect(empty.cards).toEqual([]);
    expect(empty.requestId).toBe(4);
  });
});
