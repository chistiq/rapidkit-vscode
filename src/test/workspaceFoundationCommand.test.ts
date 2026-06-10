import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registeredCommands, terminalMock, showQuickPickMock, showWarningMock } = vi.hoisted(() => ({
  registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
  terminalMock: vi.fn(),
  showQuickPickMock: vi.fn(),
  showWarningMock: vi.fn(),
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
    showInputBox: vi.fn(),
    showWarningMessage: showWarningMock,
    showErrorMessage: vi.fn(),
  },
}));

vi.mock('../utils/terminalExecutor', () => ({
  runRapidkitCommandsInTerminal: terminalMock,
  runShellCommandInTerminal: vi.fn(),
}));

import { registerWorkspaceOperationsCommands } from '../commands/workspaceOperations';

function setupHarness() {
  registeredCommands.clear();
  terminalMock.mockClear();
  showQuickPickMock.mockReset();
  showWarningMock.mockReset();

  registerWorkspaceOperationsCommands({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as any,
    getWorkspaceExplorer: () => ({
      getSelectedWorkspace: () => ({ path: '/tmp/team-ws', name: 'team-ws' }),
    }),
    context: {} as any,
  });

  return {
    getCommand(id: string) {
      const command = registeredCommands.get(id);
      expect(command).toBeTypeOf('function');
      return command!;
    },
  };
}

describe('workspace foundation ensure command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs foundation ensure in non-destructive mode', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'ensure' });

    await getCommand('workspai.workspaceFoundationEnsure')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['workspace', 'foundation', 'ensure']],
      })
    );
  });

  it('requires modal confirmation before force re-sync', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'force' });
    showWarningMock.mockResolvedValueOnce('Re-sync Foundation');

    await getCommand('workspai.workspaceFoundationEnsure')();

    expect(showWarningMock).toHaveBeenCalledWith(
      expect.stringContaining('Force re-sync foundation files'),
      { modal: true },
      'Re-sync Foundation'
    );
    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['workspace', 'foundation', 'ensure', '--force']],
      })
    );
  });

  it('cancels force re-sync when confirmation is declined', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'force' });
    showWarningMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.workspaceFoundationEnsure')();

    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('aborts when the mode picker is dismissed', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.workspaceFoundationEnsure')();

    expect(terminalMock).not.toHaveBeenCalled();
  });
});
