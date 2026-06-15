import { describe, expect, it, vi } from 'vitest';

import {
  OPS_CHAIN_STEP_TIMEOUT_MS,
  advanceDashboardOpsChain,
  blockDashboardOpsChain,
  filterOpsChainForWorkspace,
  startDashboardOpsChain,
} from '../core/dashboardOpsChainBridge';
import type { DashboardEvidenceCard } from '../core/dashboardEvidenceBridge';

function createContext() {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get<T>(key: string, defaultValue: T): T {
        return (store.get(key) as T | undefined) ?? defaultValue;
      },
      async update(key: string, value: unknown) {
        store.set(key, value);
      },
    },
  } as unknown as import('vscode').ExtensionContext;
}

describe('dashboardOpsChainBridge', () => {
  it('advances the chain when the current step evidence is green', async () => {
    const context = createContext();
    await startDashboardOpsChain(context, {
      workspacePath: '/tmp/ws',
      triggeredBy: 'clone',
      steps: ['bootstrap', 'doctor'],
    });

    const cards: DashboardEvidenceCard[] = [
      {
        id: 'bootstrap',
        label: 'Bootstrap',
        status: 'pass',
        summary: 'ok',
        scope: 'workspace',
      },
    ];

    const advanced = await advanceDashboardOpsChain(context, cards, '/tmp/ws');
    expect(advanced?.currentStep).toBe('doctor');
    expect(advanced?.completedSteps).toContain('bootstrap');
  });

  it('filters ops chains to the active workspace', async () => {
    const context = createContext();
    const chain = await startDashboardOpsChain(context, {
      workspacePath: '/tmp/ws-a',
      triggeredBy: 'clone',
    });

    expect(filterOpsChainForWorkspace(chain, '/tmp/ws-a')).toEqual(chain);
    expect(filterOpsChainForWorkspace(chain, '/tmp/ws-b')).toBeNull();
    expect(filterOpsChainForWorkspace(chain)).toBeNull();
  });

  it('blocks the chain when step evidence is missing beyond the timeout', async () => {
    vi.useFakeTimers();
    const context = createContext();
    await startDashboardOpsChain(context, {
      workspacePath: '/tmp/ws',
      triggeredBy: 'clone',
      steps: ['bootstrap'],
    });

    const blocked = await advanceDashboardOpsChain(context, [], '/tmp/ws');
    expect(blocked?.status).toBe('running');

    vi.advanceTimersByTime(OPS_CHAIN_STEP_TIMEOUT_MS + 1);
    const timedOut = await advanceDashboardOpsChain(context, [], '/tmp/ws');
    expect(timedOut?.status).toBe('blocked');
    expect(timedOut?.lastDetail).toContain('bootstrap evidence did not arrive');
    vi.useRealTimers();
  });

  it('blocks a running chain when dispatch fails', async () => {
    const context = createContext();
    await startDashboardOpsChain(context, {
      workspacePath: '/tmp/ws',
      triggeredBy: 'clone',
    });

    const blocked = await blockDashboardOpsChain(
      context,
      '/tmp/ws',
      'Could not dispatch workspaceBootstrap.'
    );

    expect(blocked?.status).toBe('blocked');
    expect(blocked?.lastDetail).toContain('workspaceBootstrap');
  });
});
