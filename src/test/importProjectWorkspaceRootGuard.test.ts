import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

const {
  showWarningMessageMock,
  showOpenDialogMock,
  executeCommandMock,
  runCanonicalNpmImportMock,
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showOpenDialogMock: vi.fn(),
  executeCommandMock: vi.fn(),
  runCanonicalNpmImportMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: showOpenDialogMock,
    withProgress: async (
      _options: unknown,
      task: (progress: { report: (value: unknown) => void }) => Promise<unknown>
    ) => task({ report: vi.fn() }),
  },
  commands: {
    executeCommand: executeCommandMock,
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

vi.mock('../core/canonicalProjectLifecycle', () => ({
  describeCanonicalCliFailure: vi.fn(),
  isCanonicalCliFailure: vi.fn().mockReturnValue(false),
  runCanonicalNpmImport: runCanonicalNpmImportMock,
}));

vi.mock('../core/rapidkitCliCapabilities', () => ({
  gateImportCli: vi.fn().mockResolvedValue(true),
}));

vi.mock('../core/moduleEnablementPrompt', () => ({
  resolveEnableModulesPreference: vi.fn().mockResolvedValue(false),
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../utils/workspaceUsageTracker', () => ({
  WorkspaceUsageTracker: {
    getInstance: () => ({
      trackCommandEvent: vi.fn(),
    }),
  },
}));

vi.mock('../core/workspaiContractRuntime', () => ({
  evaluateWorkspaiContractRuntime: vi.fn().mockResolvedValue({
    evaluated: false,
    errors: [],
    warnings: [],
    availableKinds: [],
  }),
}));

vi.mock('../core/npmProjectOnboardRefresh', () => ({
  refreshExtensionAfterNpmProjectOnboard: vi.fn(),
}));

vi.mock('../core/ensureManagedDefaultWorkspace', () => ({
  ensureManagedDefaultWorkspace: vi.fn().mockResolvedValue({ path: '/tmp/workspai' }),
  ensureWorkspaceSkeletonViaNpm: vi.fn(),
  registerManagedWorkspacePath: vi.fn().mockResolvedValue(true),
}));

import { importProjectCommand } from '../commands/importProject';

describe('importProjectCommand workspace-root guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects workspace folders to Import Workspace instead of importing them as projects', async () => {
    const sourceWorkspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-source-workspace-'));
    await fs.ensureDir(path.join(sourceWorkspacePath, '.rapidkit'));
    await fs.writeJSON(path.join(sourceWorkspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'source-workspace',
    });
    showOpenDialogMock.mockResolvedValueOnce([{ fsPath: sourceWorkspacePath }]);
    showWarningMessageMock.mockResolvedValueOnce('Import Workspace');

    await importProjectCommand(
      {
        getWorkspaceExplorer: () => ({
          refresh: vi.fn(),
          getSelectedWorkspace: () => null,
        }),
        getProjectExplorer: () => ({
          refresh: vi.fn(),
        }),
      },
      {
        source: 'local-folder',
        useDefaultWorkspace: true,
        enableModules: false,
      }
    );

    expect(runCanonicalNpmImportMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('This is a workspace. Import it as a workspace instead.'),
      'Import Workspace',
      'Cancel'
    );
    expect(executeCommandMock).toHaveBeenCalledWith('workspai.importWorkspace');
  });
});
