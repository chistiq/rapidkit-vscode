import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showWarningMessageMock,
  showInformationMessageMock,
  showErrorMessageMock,
  withProgressMock,
  executeCommandMock,
  checkPythonEnvironmentCachedMock,
  isPoetryInstalledCachedMock,
  createWorkspaceMock,
  ensureDirMock,
  pathExistsMock,
  readJSONMock,
  updateWorkspaceMetadataMock,
  addWorkspaceMock,
  refreshRecentWorkspacesMock,
  getStatsMock,
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  withProgressMock: vi.fn(),
  executeCommandMock: vi.fn(),
  checkPythonEnvironmentCachedMock: vi.fn(),
  isPoetryInstalledCachedMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
  ensureDirMock: vi.fn(),
  pathExistsMock: vi.fn(),
  readJSONMock: vi.fn(),
  updateWorkspaceMetadataMock: vi.fn(),
  addWorkspaceMock: vi.fn(),
  refreshRecentWorkspacesMock: vi.fn(),
  getStatsMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
    showErrorMessage: showErrorMessageMock,
    withProgress: withProgressMock,
    showQuickPick: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      clear: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  commands: {
    executeCommand: executeCommandMock,
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    file: (targetPath: string) => ({ fsPath: targetPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

vi.mock('fs-extra', () => {
  const fsMock = {
    ensureDir: ensureDirMock,
    pathExists: pathExistsMock,
    readJSON: readJSONMock,
    remove: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    writeJSON: vi.fn(),
  };

  return {
    ...fsMock,
    default: fsMock,
  };
});

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => '/home/test',
  };
});

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../core/rapidkitCLI', () => ({
  WorkspaiCLI: vi.fn(function WorkspaiCLI(this: { createWorkspace: typeof createWorkspaceMock }) {
    this.createWorkspace = createWorkspaceMock;
  }),
}));

vi.mock('../core/workspaceManager', () => ({
  WorkspaceManager: {
    getInstance: () => ({
      addWorkspace: addWorkspaceMock,
    }),
  },
}));

vi.mock('../utils/firstTimeSetup', () => ({
  isFirstTimeSetup: vi.fn(async () => false),
  showFirstTimeSetupMessage: vi.fn(async () => true),
}));

vi.mock('../utils/workspaceMarker', () => ({
  updateWorkspaceMetadata: updateWorkspaceMetadataMock,
}));

vi.mock('../ui/panels/welcomePanel', () => ({
  WelcomePanel: {
    refreshRecentWorkspaces: refreshRecentWorkspacesMock,
  },
}));

vi.mock('../utils/poetryHelper', () => ({
  isPoetryInstalledCached: isPoetryInstalledCachedMock,
}));

vi.mock('../utils/pythonChecker', () => ({
  checkPythonEnvironmentCached: checkPythonEnvironmentCachedMock,
}));

vi.mock('../utils/terminalExecutor', () => ({
  runCommandsInTerminal: vi.fn(),
  runShellCommandInTerminal: vi.fn(),
}));

vi.mock('../utils/errorParser', () => ({
  parseRapidKitError: vi.fn(),
  formatErrorMessage: vi.fn((e: unknown) => String(e)),
  logDetailedError: vi.fn(),
}));

vi.mock('../utils/requirementCache.js', () => ({
  requirementCache: {
    getStats: getStatsMock,
    invalidateAll: vi.fn(),
  },
}));

vi.mock('../utils/constants.js', () => ({
  getExtensionVersion: vi.fn(() => '0.28.0'),
  MARKERS: {
    WORKSPACE_SIGNATURE: 'rapidkit.workspace',
    CREATED_BY_VSCODE: 'rapidkit-vscode',
  },
}));

import { createWorkspaceCommand } from '../commands/createWorkspace';

describe('createWorkspaceCommand profile-aware Python gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    withProgressMock.mockImplementation(
      async (
        _options: unknown,
        task: (progress: { report: (value: unknown) => void }) => Promise<unknown>
      ) => task({ report: vi.fn() })
    );

    getStatsMock.mockReturnValue({
      pythonCached: false,
      poetryCached: false,
    });

    checkPythonEnvironmentCachedMock.mockResolvedValue({
      available: false,
      meetsMinimumVersion: false,
      venvSupport: false,
      error: 'Python not installed',
    });

    isPoetryInstalledCachedMock.mockResolvedValue(true);
    createWorkspaceMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    readJSONMock.mockResolvedValue({ fallbackMode: false });
    showInformationMessageMock.mockResolvedValue(undefined);
  });

  it('prompts for confirmation when Python-required profile is selected but Python is missing', async () => {
    showWarningMessageMock.mockResolvedValue('Cancel');

    await createWorkspaceCommand({
      name: 'ws-python',
      profile: 'python-only',
      installMethod: 'auto',
    });

    expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
    expect(showWarningMessageMock.mock.calls[0]?.[0]).toContain(
      'Profile "python-only" typically needs Python tooling.'
    );
    expect(createWorkspaceMock).not.toHaveBeenCalled();
  });

  it('does not show Python warning for Python-free profile and proceeds with workspace flow', async () => {
    const configPath = '/home/test/rapidkit/workspaces/ws-node';
    const markerPath = `${configPath}/.rapidkit-workspace`;
    const pathCallCounts = new Map<string, number>();

    pathExistsMock.mockImplementation(async (targetPath: string) => {
      const seen = (pathCallCounts.get(targetPath) ?? 0) + 1;
      pathCallCounts.set(targetPath, seen);

      if (targetPath === configPath) {
        return seen >= 2;
      }
      if (targetPath === markerPath) {
        return false;
      }
      if (targetPath === `${configPath}/.rapidkit`) {
        return false;
      }
      return false;
    });

    await createWorkspaceCommand({
      name: 'ws-node',
      profile: 'node-only',
      installMethod: 'auto',
    });

    const pythonProfileWarnings = showWarningMessageMock.mock.calls.filter((call) =>
      String(call[0] ?? '').includes('typically needs Python tooling')
    );

    expect(pythonProfileWarnings).toHaveLength(0);
    expect(createWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ws-node',
        profile: 'node-only',
      })
    );
  });
});
