import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const { registeredCommands, terminalMock, showQuickPickMock, showInputBoxMock, showWarningMock } =
  vi.hoisted(() => ({
    registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
    terminalMock: vi.fn(),
    showQuickPickMock: vi.fn(),
    showInputBoxMock: vi.fn(),
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
    showInputBox: showInputBoxMock,
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
  showInputBoxMock.mockReset();
  showWarningMock.mockReset();

  const workspaceExplorer = {
    getSelectedWorkspace: () => ({ path: '/tmp/team-ws', name: 'team-ws' }),
  };

  registerWorkspaceOperationsCommands({
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any,
    getWorkspaceExplorer: () => workspaceExplorer,
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

describe('workspace snapshot commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates full snapshots with name and reason through rapidkit CLI', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'full' });
    showInputBoxMock.mockResolvedValueOnce('before-upgrade').mockResolvedValueOnce('release prep');

    await getCommand('workspai.workspaceSnapshotCreate')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [
          [
            'snapshot',
            'create',
            'before-upgrade',
            '--include-projects',
            '--reason',
            'release prep',
          ],
        ],
      })
    );
  });

  it('creates metadata snapshots with generated names when optional inputs are empty', async () => {
    const { getCommand } = setupHarness();

    showQuickPickMock.mockResolvedValueOnce({ value: 'metadata' });
    showInputBoxMock.mockResolvedValueOnce('').mockResolvedValueOnce('');

    await getCommand('workspai.workspaceSnapshotCreate')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['snapshot', 'create']],
      })
    );
  });

  it('lists workspace snapshots without prompting', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.workspaceSnapshotList')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['snapshot', 'list']],
      })
    );
  });

  it('runs workspace analyze with strict JSON output and writes report to .rapidkit/reports', async () => {
    const { getCommand } = setupHarness();

    await getCommand('workspai.workspaceAnalyze')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [
          [
            'analyze',
            '--json',
            '--strict',
            '--output',
            '/tmp/team-ws/.rapidkit/reports/analyze-last-run.json',
          ],
        ],
      })
    );
  });

  it('contributes workspace analyze to extension manifest and workspace context menu', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        menus?: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
      };
    };

    const contributedCommands = new Set(
      (manifest.contributes?.commands || []).map((item) => item.command)
    );
    const workspaceContextCommands = new Set(
      (manifest.contributes?.menus?.['view/item/context'] || [])
        .filter((item) => item.when === 'view == rapidkitWorkspaces && viewItem == workspace')
        .map((item) => item.command)
    );
    const workspaceRunCommands = new Set(
      (manifest.contributes?.menus?.['workspai.workspace.run'] || []).map((item) => item.command)
    );

    expect(contributedCommands.has('workspai.workspaceAnalyze')).toBe(true);
    expect(workspaceContextCommands.has('workspai.workspaceAnalyze')).toBe(false);
    expect(workspaceRunCommands.has('workspai.workspaceAnalyze')).toBe(true);
  });

  it('inspects a named snapshot', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('before-upgrade');

    await getCommand('workspai.workspaceSnapshotInspect')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['snapshot', 'inspect', 'before-upgrade']],
      })
    );
  });

  it('restores snapshots in dry-run mode by default path', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('before-upgrade');
    showQuickPickMock.mockResolvedValueOnce({ value: 'dry-run' });

    await getCommand('workspai.workspaceSnapshotRestore')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['snapshot', 'restore', 'before-upgrade', '--dry-run']],
      })
    );
  });

  it('requires modal confirmation before force restore', async () => {
    const { getCommand } = setupHarness();

    showInputBoxMock.mockResolvedValueOnce('before-upgrade').mockResolvedValueOnce('rollback');
    showQuickPickMock.mockResolvedValueOnce({ value: 'force' });
    showWarningMock.mockResolvedValueOnce('Restore Snapshot');

    await getCommand('workspai.workspaceSnapshotRestore')();

    expect(terminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/team-ws',
        commands: [['snapshot', 'restore', 'before-upgrade', '--force', '--reason', 'rollback']],
      })
    );
  });

  it('keeps snapshot commands contributed to the palette and workspace context menu', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        menus?: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
      };
    };

    const snapshotCommands = [
      'workspai.workspaceSnapshot',
      'workspai.workspaceSnapshotCreate',
      'workspai.workspaceSnapshotList',
      'workspai.workspaceSnapshotInspect',
      'workspai.workspaceSnapshotRestore',
    ];

    const contributedCommands = new Set(
      (manifest.contributes?.commands || []).map((item) => item.command)
    );
    const paletteCommands = new Set(
      (manifest.contributes?.menus?.commandPalette || []).map((item) => item.command)
    );
    const workspaceContextCommands = new Set(
      (manifest.contributes?.menus?.['view/item/context'] || [])
        .filter((item) => item.when === 'view == rapidkitWorkspaces && viewItem == workspace')
        .map((item) => item.command)
    );
    const workspaceContextSubmenus = new Set(
      (manifest.contributes?.menus?.['view/item/context'] || [])
        .filter((item) => item.when === 'view == rapidkitWorkspaces && viewItem == workspace')
        .map((item) => item.submenu)
    );
    const workspaceRecoveryCommands = new Set(
      (manifest.contributes?.menus?.['workspai.workspace.recovery'] || []).map(
        (item) => item.command
      )
    );

    for (const command of snapshotCommands) {
      expect(contributedCommands.has(command)).toBe(true);
      expect(paletteCommands.has(command)).toBe(true);
      expect(workspaceContextCommands.has(command)).toBe(false);
      expect(workspaceRecoveryCommands.has(command)).toBe(true);
    }
    expect(workspaceContextSubmenus.has('workspai.workspace.recovery')).toBe(true);
  });
});
