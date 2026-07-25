import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registeredCommands, terminalMock, gatedTerminalMock, interruptMock, showWarningMock } =
  vi.hoisted(() => ({
    registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
    terminalMock: vi.fn(),
    gatedTerminalMock: vi.fn(),
    interruptMock: vi.fn(),
    showWarningMock: vi.fn(),
  }));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    },
    executeCommand: vi.fn(),
  },
  window: {
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showWarningMessage: showWarningMock,
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: (value: string) => ({ value }),
  },
}));

vi.mock('../utils/terminalExecutor', () => ({
  runRapidkitCommandsInTerminal: terminalMock,
  runCommandsInTerminal: vi.fn(),
  openTerminal: vi.fn(),
  interruptTerminal: interruptMock,
}));

vi.mock('../core/gatedRapidkitTerminal', () => ({
  runGatedRapidkitCommandsInTerminal: gatedTerminalMock.mockResolvedValue(true),
}));

vi.mock('../utils/poetryHelper', () => ({
  detectPythonVirtualenv: vi.fn().mockResolvedValue({ exists: true }),
}));

vi.mock('../core/projectLifecycleGate', () => ({
  gateProjectLifecycleCommand: vi.fn().mockResolvedValue(true),
}));

vi.mock('../ui/panels/welcomePanel', () => ({
  WelcomePanel: { currentPanel: undefined, updateWithProject: vi.fn() },
}));

import { registerProjectLifecycleCommands } from '../commands/projectLifecycle';

const PROJECT_ITEM = {
  project: { path: '/tmp/team-ws/api', name: 'api', type: 'fastapi' },
};

function setupHarness(runningServers = new Map<string, any>()) {
  registeredCommands.clear();
  terminalMock.mockClear();
  gatedTerminalMock.mockClear();
  interruptMock.mockClear();
  showWarningMock.mockReset();
  terminalMock.mockReturnValue({ name: 'mock-terminal' });
  gatedTerminalMock.mockResolvedValue(true);

  registerProjectLifecycleCommands({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as any,
    runningServers,
    getProjectExplorer: () => ({ refresh: vi.fn() }),
  });

  return {
    getCommand(id: string) {
      const command = registeredCommands.get(id);
      expect(command).toBeTypeOf('function');
      return command!;
    },
  };
}

describe('project lifecycle stage commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs rapidkit build for the project', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.projectBuild')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['build']],
      })
    );
  });

  it('runs rapidkit lint for the project', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.projectLint')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['lint']],
      })
    );
  });

  it('runs rapidkit format for the project', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.projectFormat')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['format']],
      })
    );
  });

  it('starts the production server and tracks the terminal', async () => {
    const runningServers = new Map<string, any>();
    const { getCommand } = setupHarness(runningServers);

    await getCommand('workspai.projectStart')(PROJECT_ITEM);

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['start']],
      })
    );
    expect(runningServers.get('/tmp/team-ws/api')).toBeDefined();
  });

  it('asks before replacing a tracked server terminal on start', async () => {
    const runningServers = new Map<string, any>([
      ['/tmp/team-ws/api', { name: 'existing-terminal' }],
    ]);
    const { getCommand } = setupHarness(runningServers);

    showWarningMock.mockResolvedValueOnce('Stop & Start');

    await getCommand('workspai.projectStart')(PROJECT_ITEM);

    expect(interruptMock).toHaveBeenCalled();
    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [['start']],
      })
    );
  });

  it('cancels start when the user declines replacing the tracked terminal', async () => {
    const runningServers = new Map<string, any>([
      ['/tmp/team-ws/api', { name: 'existing-terminal' }],
    ]);
    const { getCommand } = setupHarness(runningServers);

    showWarningMock.mockResolvedValueOnce(undefined);

    await getCommand('workspai.projectStart')(PROJECT_ITEM);

    expect(interruptMock).not.toHaveBeenCalled();
    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('does nothing without a project path', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.projectBuild')({});

    expect(terminalMock).not.toHaveBeenCalled();
  });

  it('runs project doctor through the gated RapidKit terminal', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.projectDoctor')({
      ...PROJECT_ITEM,
      preferredAction: 'check',
    });

    expect(gatedTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['doctor', 'project']],
      })
    );
  });

  it('runs project doctor fix through the gated RapidKit terminal', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.projectDoctor')({
      ...PROJECT_ITEM,
      preferredAction: 'fix',
    });

    expect(gatedTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws/api',
        commands: [['doctor', 'project', '--fix']],
      })
    );
  });
});
