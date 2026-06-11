import { describe, expect, it } from 'vitest';

import { advanceDashboardOpsChain, startDashboardOpsChain } from '../core/dashboardOpsChainBridge';
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
});
