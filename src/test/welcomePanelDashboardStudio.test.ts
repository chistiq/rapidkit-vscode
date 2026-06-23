import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

import { buildDashboardStudioActionResult } from '../ui/panels/welcomePanelDashboardStudio';

describe('welcomePanelDashboardStudio', () => {
  it('builds dashboard studio action results via the shared bridge', () => {
    const result = buildDashboardStudioActionResult({
      actionId: 'doctor-workspace',
      workspacePath: '/tmp/ws',
      fallbackSummary: 'Doctor refreshed',
      status: 'completed',
      gatePassed: true,
      source: 'studio-action',
    });

    expect(result.summary).toBe('Doctor refreshed');
    expect(result.proofEvent).toMatchObject({
      actionId: 'doctor-workspace',
      status: 'completed',
      gatePassed: true,
      source: 'studio-action',
    });
  });
});
