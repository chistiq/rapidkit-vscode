import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get })),
  },
}));

describe('agentSyncSettings', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'agentSync.preset') {
        return defaultValue ?? 'enterprise';
      }
      if (key === 'agentSync.experimentalHooks') {
        return defaultValue ?? false;
      }
      return defaultValue;
    });
  });

  it('defaults to enterprise preset without experimental hooks', async () => {
    const { readAgentSyncSettings, resolveAgentSyncCliOptions } =
      await import('../core/agentSyncSettings.js');

    expect(readAgentSyncSettings()).toEqual({
      preset: 'enterprise',
      experimentalHooks: false,
    });
    expect(resolveAgentSyncCliOptions()).toEqual({
      preset: 'enterprise',
      experimentalHooks: false,
    });
  });

  it('reads minimal preset and experimental hooks from workspai settings', async () => {
    get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'agentSync.preset') {
        return 'minimal';
      }
      if (key === 'agentSync.experimentalHooks') {
        return true;
      }
      return defaultValue;
    });

    const { resolveAgentSyncCliOptions } = await import('../core/agentSyncSettings.js');

    expect(
      resolveAgentSyncCliOptions({
        scope: 'billing',
        strict: true,
        target: 'copilot',
      })
    ).toEqual({
      scope: 'billing',
      strict: true,
      preset: 'minimal',
      target: 'copilot',
      experimentalHooks: true,
    });
  });
});
