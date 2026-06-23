import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { adoptProjectCommandMock } = vi.hoisted(() => ({
  adoptProjectCommandMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('../commands/adoptProject', () => ({
  adoptProjectCommand: adoptProjectCommandMock,
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showOpenDialog: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
  Uri: {
    file: (value: string) => ({ fsPath: value }),
  },
}));

import { resolveAdoptWorkspaceRouting } from '../commands/explorerFolderCommands';

describe('resolveAdoptWorkspaceRouting', () => {
  it('infers parent workspace from extension markers before default-workspace adopt', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-explorer-adopt-'));
    await fs.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.writeFile(path.join(workspacePath, '.rapidkit', 'workspace.json'), '{}', 'utf8');
    const projectPath = path.join(workspacePath, 'services', 'orders-api');
    await fs.ensureDir(projectPath);

    expect(resolveAdoptWorkspaceRouting({ projectPath })).toEqual({
      workspacePath,
      useDefaultWorkspace: false,
    });
  });

  it('detects workspace.json-only roots that CLI nearest lookup can miss', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-explorer-adopt-json-'));
    await fs.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.writeFile(
      path.join(workspacePath, '.rapidkit', 'workspace.json'),
      JSON.stringify({ schema_version: '1.0', name: 'demo' }),
      'utf8'
    );
    const projectPath = path.join(workspacePath, 'apps', 'web');
    await fs.ensureDir(projectPath);

    expect(resolveAdoptWorkspaceRouting({ projectPath }).workspacePath).toBe(workspacePath);
  });

  it('keeps explicit workspace routing from tree context menus', () => {
    expect(
      resolveAdoptWorkspaceRouting({
        projectPath: '/tmp/project',
        workspacePath: '/tmp/workspace',
      })
    ).toEqual({
      workspacePath: '/tmp/workspace',
      useDefaultWorkspace: false,
    });
  });

  it('honors default-workspace picker flow even when a parent workspace exists on disk', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-explorer-adopt-default-'));
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');
    const projectPath = path.join(workspacePath, 'external-app');
    await fs.ensureDir(projectPath);

    expect(
      resolveAdoptWorkspaceRouting({
        projectPath,
        useDefaultWorkspace: true,
      })
    ).toEqual({
      workspacePath: undefined,
      useDefaultWorkspace: true,
    });
  });

  it('falls back to default-workspace adopt for standalone folders', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-adopt-'));

    expect(resolveAdoptWorkspaceRouting({ projectPath })).toEqual({
      workspacePath: undefined,
      useDefaultWorkspace: true,
    });
  });
});

describe('adoptWithRapidkitCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes inferred workspace into adoptProjectCommand for explorer folder adoption', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-explorer-adopt-cmd-'));
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');
    const projectPath = path.join(workspacePath, 'packages', 'api');
    await fs.ensureDir(projectPath);

    const { adoptWithRapidkitCommand } = await import('../commands/explorerFolderCommands');
    await adoptWithRapidkitCommand(projectPath);

    expect(adoptProjectCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath,
        projectName: 'api',
        workspacePath,
        useDefaultWorkspace: false,
      })
    );
  });
});
