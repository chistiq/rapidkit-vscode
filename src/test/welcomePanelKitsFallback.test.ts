import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetKitsWithStatus } = vi.hoisted(() => ({
  mockGetKitsWithStatus: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  window: { showErrorMessage: vi.fn() },
}));

vi.mock('../core/kitsService', () => ({
  KitsService: {
    getInstance: () => ({ getKitsWithStatus: mockGetKitsWithStatus }),
  },
}));

vi.mock('../core/coreVersionService', () => ({
  CoreVersionService: { getInstance: () => ({ clearCache: vi.fn() }) },
}));

vi.mock('../core/modulesCatalogService', () => ({
  ModulesCatalogService: { getInstance: vi.fn() },
}));

vi.mock('fs-extra', () => ({
  default: { pathExists: vi.fn() },
  pathExists: vi.fn(),
}));

vi.mock('../utils/coreRuntimeResolver', () => ({
  resolveCatalogWorkspaceRoot: vi.fn(),
}));

vi.mock('../utils/platformCapabilities', () => ({
  getWorkspaceVenvRapidkitCandidates: vi.fn(() => []),
}));

import { sendAvailableKits } from '../ui/panels/welcomePanelModulesCatalog';

describe('welcome panel kit fallback reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends fallback kits together with their CLI failure reason', async () => {
    const kits = [{ name: 'fastapi.standard' }];
    mockGetKitsWithStatus.mockResolvedValue({
      kits,
      source: 'bundled-fallback',
      error: 'Workspai CLI timed out',
    });
    const postWebviewMessage = vi.fn();

    await sendAvailableKits({ postWebviewMessage }, 'request-1');

    expect(postWebviewMessage).toHaveBeenCalledWith('updateAvailableKits', {
      kits,
      requestId: 'request-1',
      loadError: 'Workspai CLI timed out',
    });
  });

  it('passes forced retry intent to the kit service', async () => {
    mockGetKitsWithStatus.mockResolvedValue({
      kits: [],
      source: 'live',
    });

    await sendAvailableKits({ postWebviewMessage: vi.fn() }, 'request-2', {
      forceRefresh: true,
    });

    expect(mockGetKitsWithStatus).toHaveBeenCalledWith({ forceRefresh: true });
  });
});
