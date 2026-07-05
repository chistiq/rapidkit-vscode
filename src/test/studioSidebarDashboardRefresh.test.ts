import { describe, expect, it, vi } from 'vitest';

import { computeBlockerSignature } from '../contracts/blocker-resolution-contract.js';
import { reconcileStudioBlockerLedgerAfterVerify } from '../core/studioBlockerCommandLedger.js';
import {
  formatStudioCardRefreshToast,
  refreshDashboardAfterStudioVerify,
  resolveDashboardCardIdsForStudioHandoff,
} from '../core/studioSidebarDashboardRefresh.js';
import { STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION } from '../contracts/studio-blocker-handoff-contract.js';

vi.mock('../core/dashboardEvidenceCardRefresh.js', () => ({
  buildDashboardEvidenceCardsForIds: vi.fn(async () => [
    {
      id: 'doctor',
      label: 'Workspace Doctor',
      status: 'pass',
      summary: 'ready',
      scope: 'workspace',
    },
  ]),
}));

describe('studio sidebar dashboard refresh', () => {
  it('resolves related dashboard card ids for verify handoffs', () => {
    expect(
      resolveDashboardCardIdsForStudioHandoff({
        cardId: 'doctor',
        verifyCommand:
          'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json',
      })
    ).toEqual(['doctor', 'workspaceVerify']);
  });

  it('formats pass vs blocked refresh toasts', () => {
    expect(
      formatStudioCardRefreshToast({
        verifySucceeded: true,
        primaryCard: {
          id: 'doctor',
          label: 'Workspace Doctor',
          status: 'pass',
          summary: 'ready',
          scope: 'workspace',
        },
      }).message
    ).toContain('ready');
    expect(
      formatStudioCardRefreshToast({
        verifySucceeded: true,
        primaryCard: {
          id: 'doctor',
          label: 'Workspace Doctor',
          status: 'fail',
          summary: 'blocked',
          scope: 'workspace',
          blockers: ['tests failed'],
        },
      }).kind
    ).toBe('warning');
  });

  it('resets ledger entries when blocker signature changes after verify', async () => {
    const store = new Map<string, unknown>();
    const context = {
      workspaceState: {
        get: <T>(key: string) => store.get(key) as T | undefined,
        update: async (key: string, value: unknown) => {
          store.set(key, value);
        },
      },
    } as never;

    const priorSignature = computeBlockerSignature({ blockers: ['doctor: fail'] });
    await context.workspaceState.update('workspai.studioBlockerCommandLedger.v1', {
      entries: [
        {
          cardId: 'doctor',
          sourceCommand: 'npx rapidkit doctor --json',
          blockerSignature: priorSignature,
          count: 2,
        },
      ],
    });

    const result = await reconcileStudioBlockerLedgerAfterVerify(context, {
      cardId: 'doctor',
      blockers: ['doctor: pass'],
      priorSignature,
      exitCode: 0,
    });

    expect(result.signatureChanged).toBe(true);
    const ledger = store.get('workspai.studioBlockerCommandLedger.v1') as {
      entries: Array<{ count: number; blockerSignature: string }>;
    };
    expect(ledger.entries).toHaveLength(0);
  });

  it('pins handoff schema used by card refresh payloads', () => {
    expect(STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION).toBe('rapidkit-studio-blocker-handoff-v1');
  });

  it('invokes dashboard patch refresh before reading card status', async () => {
    const refreshDashboardCards = vi.fn(async () => undefined);
    const result = await refreshDashboardAfterStudioVerify({
      workspacePath: '/tmp/ws',
      handoff: {
        schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
        cardId: 'doctor',
        cardStatus: 'fail',
        blockers: ['doctor: fail'],
        artifactPath: '.rapidkit/reports/doctor-last-run.json',
        sourceCommand: 'npx rapidkit doctor --json',
        scope: 'workspace',
        blockerSignature: 'abc123456789abcd',
      },
      verifyExitCode: 0,
      refreshDashboardCards,
    });

    expect(refreshDashboardCards).toHaveBeenCalledWith({
      workspacePath: '/tmp/ws',
      cardIds: ['doctor'],
    });
    expect(result.primaryCard?.status).toBe('pass');
  });
});
