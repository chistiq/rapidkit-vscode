import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registeredCommands,
  terminalMock,
  showQuickPickMock,
  showInputBoxMock,
  showWarningMock,
  showErrorMock,
  pathExistsMock,
  readJsonMock,
} = vi.hoisted(() => ({
  registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
  terminalMock: vi.fn(),
  showQuickPickMock: vi.fn(),
  showInputBoxMock: vi.fn(),
  showWarningMock: vi.fn(),
  showErrorMock: vi.fn(),
  pathExistsMock: vi.fn(),
  readJsonMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    },
  },
  window: {
    showQuickPick: showQuickPickMock,
    showInputBox: showInputBoxMock,
    showWarningMessage: showWarningMock,
    showErrorMessage: showErrorMock,
  },
}));

vi.mock('../utils/terminalExecutor', () => ({
  runRapidkitCommandsInTerminal: terminalMock,
}));

vi.mock('fs-extra', () => ({
  default: {
    pathExists: pathExistsMock,
    readJson: readJsonMock,
  },
}));

import {
  readInstalledModules,
  registerModuleMaintenanceCommands,
} from '../commands/moduleMaintenance';

const PROJECT_ITEM = { project: { path: '/tmp/team-ws/api', name: 'api' } };

function setupHarness() {
  registeredCommands.clear();
  terminalMock.mockClear();
  showQuickPickMock.mockReset();
  showInputBoxMock.mockReset();
  showWarningMock.mockReset();
  showErrorMock.mockReset();
  pathExistsMock.mockReset();
  readJsonMock.mockReset();

  // Default: no registry on disk, slug provided via input box.
  pathExistsMock.mockResolvedValue(false);

  registerModuleMaintenanceCommands({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as any,
    getProjectExplorer: () => ({
      getSelectedProject: () => ({ path: '/tmp/team-ws/api', name: 'api' }),
    }),
  });

  return {
    getCommand(id: string) {
      const command = registeredCommands.get(id);
      expect(command).toBeTypeOf('function');
      return command!;
    },
  };
}

describe('module maintenance commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a dry-run upgrade for a manually entered module', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('free/core/health');
    showQuickPickMock.mockResolvedValueOnce({ value: 'dry-run' });

    await getCommand('workspai.moduleUpgrade')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['upgrade', 'module', 'free/core/health', '--dry-run']],
      })
    );
  });

  it('requires modal confirmation before applying an upgrade', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('free/core/health');
    showQuickPickMock.mockResolvedValueOnce({ value: 'apply' });
    showWarningMock.mockResolvedValueOnce('Upgrade Module');

    await getCommand('workspai.moduleUpgrade')(PROJECT_ITEM);

    expect(showWarningMock).toHaveBeenCalledWith(
      expect.stringContaining('Upgrade module "free/core/health"'),
      { modal: true },
      'Upgrade Module'
    );
    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['upgrade', 'module', 'free/core/health']],
      })
    );
  });

  it('cancels destructive actions when confirmation is declined', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('free/core/health');
    showQuickPickMock.mockResolvedValueOnce({ value: 'apply' });
    showWarningMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.moduleUninstall')(PROJECT_ITEM);

    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('runs module diff with unified patch output', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('free/core/health');
    showQuickPickMock.mockResolvedValueOnce({ value: true });

    await getCommand('workspai.moduleDiff')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['diff', 'module', 'free/core/health', '--patch']],
      })
    );
  });

  it('runs module checkpoint without extra prompts', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('free/core/health');

    await getCommand('workspai.moduleCheckpoint')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['checkpoint', 'module', 'free/core/health']],
      })
    );
  });

  it('uses the module slug from the tree item without prompting', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.moduleCheckpoint')({
      ...PROJECT_ITEM,
      module: { slug: 'free/auth/jwt' },
    });

    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['checkpoint', 'module', 'free/auth/jwt']],
      })
    );
  });

  it('offers installed modules from the project registry as a quick pick', async () => {
    const { getCommand } = setupHarness();

    pathExistsMock.mockImplementation(async (target: string) =>
      target.endsWith('/tmp/team-ws/api/registry.json')
    );
    readJsonMock.mockResolvedValueOnce({
      installed_modules: [{ slug: 'free/core/health', version: '1.2.0' }],
    });

    showQuickPickMock
      .mockResolvedValueOnce({ slug: 'free/core/health', label: 'free/core/health' })
      .mockResolvedValueOnce({ value: 'dry-run' });

    await getCommand('workspai.moduleRollback')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['rollback', 'module', 'free/core/health', '--dry-run']],
      })
    );
  });

  it('falls back to selected project when item carries no path', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('free/core/health');

    await getCommand('workspai.moduleCheckpoint')(undefined);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
      })
    );
  });

  it('shows an error when no project is resolvable', async () => {
    registeredCommands.clear();
    terminalMock.mockClear();
    showErrorMock.mockReset();

    registerModuleMaintenanceCommands({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as any,
      getProjectExplorer: () => ({ getSelectedProject: () => null }),
    });

    await registeredCommands.get('workspai.moduleCheckpoint')!(undefined);

    expect(showErrorMock).toHaveBeenCalledWith(
      'No project selected. Select a project in the Projects view first.'
    );
    expect(terminalMock).not.toHaveBeenCalled();
  });
});

describe('readInstalledModules', () => {
  beforeEach(() => {
    pathExistsMock.mockReset();
    readJsonMock.mockReset();
  });

  it('returns an empty list when no registry exists', async () => {
    pathExistsMock.mockResolvedValue(false);

    await expect(readInstalledModules('/tmp/team-ws/api')).resolves.toEqual([]);
  });

  it('ignores malformed registry entries', async () => {
    pathExistsMock.mockResolvedValue(true);
    readJsonMock.mockResolvedValueOnce({
      installed_modules: [{ slug: 'free/core/health' }, { name: 'broken' }, null, 42],
    });

    await expect(readInstalledModules('/tmp/team-ws/api')).resolves.toEqual([
      { slug: 'free/core/health', version: undefined },
    ]);
  });

  it('swallows registry read failures', async () => {
    pathExistsMock.mockResolvedValue(true);
    readJsonMock.mockRejectedValueOnce(new Error('corrupt json'));

    await expect(readInstalledModules('/tmp/team-ws/api')).resolves.toEqual([]);
  });
});
