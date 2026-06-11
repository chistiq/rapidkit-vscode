import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockUpdate, mockExecuteCommand, mockResetModelSelectionCache } = vi.hoisted(
  () => ({
    mockGet: vi.fn(),
    mockUpdate: vi.fn(),
    mockExecuteCommand: vi.fn(),
    mockResetModelSelectionCache: vi.fn(),
  })
);

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockGet,
      update: mockUpdate,
    }),
  },
  ConfigurationTarget: {
    Global: 1,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

vi.mock('../core/aiModelSelection.js', () => ({
  resetModelSelectionCache: mockResetModelSelectionCache,
}));

import {
  openWorkspaiExtensionSettings,
  readWorkspaiSettings,
  setWorkspaiPreferredModel,
} from '../core/workspaiSettingsBridge.js';

describe('workspaiSettingsBridge', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockExecuteCommand.mockReset();
    mockResetModelSelectionCache.mockReset();
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'preferredModel') {
        return 'auto';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 45_000;
      }
      return defaultValue;
    });
    mockUpdate.mockResolvedValue(undefined);
    mockExecuteCommand.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads preferred model and stream timeout from VS Code settings', () => {
    mockGet.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'preferredModel') {
        return 'gpt-5.2';
      }
      if (key === 'aiStreamTimeoutMs') {
        return 60_000;
      }
      return defaultValue;
    });

    expect(readWorkspaiSettings()).toEqual({
      preferredModel: 'gpt-5.2',
      aiStreamTimeoutMs: 60_000,
    });
  });

  it('persists preferred model and clears model selection cache', async () => {
    await expect(setWorkspaiPreferredModel('claude-sonnet-4-6')).resolves.toBe('claude-sonnet-4-6');

    expect(mockUpdate).toHaveBeenCalledWith('preferredModel', 'claude-sonnet-4-6', 1);
    expect(mockResetModelSelectionCache).toHaveBeenCalledTimes(1);
  });

  it('opens filtered Workspai extension settings', async () => {
    await openWorkspaiExtensionSettings();

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:rapidkit.rapidkit-vscode workspai'
    );
  });
});
