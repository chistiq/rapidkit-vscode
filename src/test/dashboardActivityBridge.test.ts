import { describe, expect, it } from 'vitest';

import { mergeDashboardActivityEntry } from '../core/dashboardActivityBridge';

describe('dashboardActivityBridge', () => {
  it('coalesces repeated commands within the merge window', () => {
    const base = Date.now();
    const current = [
      {
        id: 'workspaceAnalyze-1',
        command: 'workspaceAnalyze',
        label: 'Workspace Analyze',
        scope: 'workspace' as const,
        status: 'dispatched' as const,
        timestamp: base - 30_000,
        runCount: 1,
      },
    ];

    const next = mergeDashboardActivityEntry(current, {
      command: 'workspaceAnalyze',
      label: 'Workspace Analyze',
      scope: 'workspace',
      status: 'dispatched',
      timestamp: base,
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.runCount).toBe(2);
    expect(next[0]?.timestamp).toBe(base);
  });

  it('creates a new entry when the same command is outside the merge window', () => {
    const base = Date.now();
    const current = [
      {
        id: 'workspaceAnalyze-1',
        command: 'workspaceAnalyze',
        label: 'Workspace Analyze',
        scope: 'workspace' as const,
        status: 'dispatched' as const,
        timestamp: base - 300_000,
        runCount: 1,
      },
    ];

    const next = mergeDashboardActivityEntry(current, {
      command: 'workspaceAnalyze',
      label: 'Workspace Analyze',
      scope: 'workspace',
      status: 'dispatched',
      timestamp: base,
    });

    expect(next).toHaveLength(2);
    expect(next[0]?.runCount).toBe(1);
  });
});
