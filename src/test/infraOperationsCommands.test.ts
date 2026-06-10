import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registeredCommands,
  terminalMock,
  showQuickPickMock,
  showWarningMock,
  showErrorMock,
  showInfoMock,
  execaMock,
} = vi.hoisted(() => ({
  registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
  terminalMock: vi.fn(),
  showQuickPickMock: vi.fn(),
  showWarningMock: vi.fn(),
  showErrorMock: vi.fn(),
  showInfoMock: vi.fn(),
  execaMock: vi.fn(),
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
    showWarningMessage: showWarningMock,
    showErrorMessage: showErrorMock,
    showInformationMessage: showInfoMock,
    showTextDocument: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: (value: string) => ({ value }),
    file: (value: string) => ({ fsPath: value }),
  },
}));

vi.mock('../utils/terminalExecutor', () => ({
  runRapidkitCommandsInTerminal: terminalMock,
}));

vi.mock('execa', () => ({
  execa: execaMock,
}));

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn().mockResolvedValue(false),
  },
}));

import { registerInfraOperationsCommands } from '../commands/infraOperations';

function setupHarness() {
  registeredCommands.clear();
  terminalMock.mockClear();
  showQuickPickMock.mockReset();
  showWarningMock.mockReset();
  showErrorMock.mockReset();
  execaMock.mockReset();
  execaMock.mockResolvedValue({ exitCode: 0 });

  const workspaceExplorer = {
    getSelectedWorkspace: () => ({ path: '/tmp/team-ws', name: 'team-ws' }),
  };

  registerInfraOperationsCommands({
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any,
    getWorkspaceExplorer: () => workspaceExplorer,
  });

  return {
    getCommand(id: string) {
      const command = registeredCommands.get(id);
      expect(command).toBeTypeOf('function');
      return command!;
    },
  };
}

describe('infra operations commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs infra plan with selected optional flags', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce([{ value: 'verbose' }, { value: 'json' }]);

    await getCommand('workspai.infraPlan')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['infra', 'plan', '--verbose', '--json']],
      })
    );
  });

  it('runs infra plan without flags when none are selected', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce([]);

    await getCommand('workspai.infraPlan')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['infra', 'plan']],
      })
    );
  });

  it('aborts infra plan when the flag picker is dismissed', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.infraPlan')();

    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('runs infra up with rebuild flag after docker pre-flight succeeds', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce([{ value: 'build' }]);

    await getCommand('workspai.infraUp')();

    expect(execaMock).toHaveBeenCalledWith('docker', ['--version'], expect.any(Object));
    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['infra', 'up', '--build']],
      })
    );
  });

  it('blocks infra up when docker is not available', async () => {
    const { getCommand } = setupHarness();

    execaMock.mockResolvedValue({ exitCode: 1 });
    showErrorMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.infraUp')();

    expect(showErrorMock).toHaveBeenCalled();
    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('requires modal confirmation before removing infra volumes', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'volumes' });
    showWarningMock.mockResolvedValueOnce('Remove Volumes');

    await getCommand('workspai.infraDown')();

    expect(showWarningMock).toHaveBeenCalledWith(
      expect.stringContaining('Remove infra volumes'),
      { modal: true },
      'Remove Volumes'
    );
    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['infra', 'down', '--volumes']],
      })
    );
  });

  it('cancels volume removal when confirmation is declined', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'volumes' });
    showWarningMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.infraDown')();

    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('stops the stack without volumes when stop mode is selected', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'stop' });

    await getCommand('workspai.infraDown')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['infra', 'down']],
      })
    );
  });

  it('runs infra status without prompting', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.infraStatus')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['infra', 'status']],
      })
    );
  });

  it('offers to run plan when the compose file does not exist', async () => {
    const { getCommand } = setupHarness();

    showInfoMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.infraOpenCompose')();

    expect(showInfoMock).toHaveBeenCalledWith(
      expect.stringContaining('No infra compose file exists'),
      'Run Infra Plan'
    );
    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('shows an error when no workspace is selected', async () => {
    registeredCommands.clear();
    terminalMock.mockClear();
    showErrorMock.mockReset();

    registerInfraOperationsCommands({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as any,
      getWorkspaceExplorer: () => ({ getSelectedWorkspace: () => null }),
    });

    await registeredCommands.get('workspai.infraStatus')!();

    expect(showErrorMock).toHaveBeenCalledWith(
      'No workspace selected. Select a workspace in the sidebar first.'
    );
    expect(terminalMock).not.toHaveBeenCalled();
  });
});
