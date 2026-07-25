/**
 * RapidKit CLI Tests
 */

import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { WorkspaiCLI, buildProjectScaffoldArgs } from '../core/rapidkitCLI';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
}));

vi.mock('../utils/exec', () => ({
  run: vi.fn(),
}));

import { run } from '../utils/exec';

describe('WorkspaiCLI', () => {
  let cli: WorkspaiCLI;

  beforeAll(() => {
    cli = new WorkspaiCLI();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should check if CLI is available', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '0.14.2', stderr: '', exitCode: 0 } as any);
    const isAvailable = await cli.isAvailable();
    expect(typeof isAvailable).toBe('boolean');
    expect(isAvailable).toBe(true);
  });

  it('should get CLI version', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '0.14.2\n', stderr: '', exitCode: 0 } as any);
    const version = await cli.getVersion();
    expect(version).toBe('0.14.2');
  });

  it('falls back to npx when direct workspai binary is unavailable in getVersion', async () => {
    vi.mocked(run)
      .mockRejectedValueOnce(new Error('workspai not found'))
      .mockResolvedValueOnce({ stdout: '0.24.1\n', stderr: '', exitCode: 0 } as any);

    const version = await cli.getVersion();

    expect(version).toBe('0.24.1');
    expect(vi.mocked(run)).toHaveBeenNthCalledWith(
      1,
      'workspai',
      ['--version'],
      expect.objectContaining({ stdio: 'pipe', timeout: 3000 })
    );
    expect(vi.mocked(run)).toHaveBeenNthCalledWith(
      2,
      'npx',
      ['--yes', '--package', 'workspai', 'workspai', '--version'],
      expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
    );
  });

  it('does not fall back to the Python rapidkit runner when Workspai npm fails', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-cli-fallback-'));

    vi.mocked(run).mockRejectedValueOnce(new Error('npx failed'));

    await expect(cli.run(['doctor', 'workspace'], workspacePath, true)).rejects.toThrow(
      'npx failed'
    );

    expect(vi.mocked(run)).toHaveBeenCalledTimes(1);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('uses workspace .venv POSIX rapidkit runner when available', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-cli-posix-'));
    const expectedRunner = path.join(workspacePath, '.venv', 'bin', 'rapidkit');

    fs.mkdirSync(path.dirname(expectedRunner), { recursive: true });
    fs.writeFileSync(expectedRunner, '#!/usr/bin/env bash\n');

    vi.mocked(run).mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 } as any);

    const result = await cli.run(['doctor', 'workspace'], workspacePath, false);

    expect(result.stdout).toBe('ok');
    expect(vi.mocked(run)).toHaveBeenCalledWith(
      expectedRunner,
      ['doctor', 'workspace'],
      expect.objectContaining({ cwd: workspacePath, stdio: 'pipe' })
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('uses workspace .venv Windows rapidkit runner when available', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-cli-win-'));
    const expectedRunner = path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.exe');

    fs.mkdirSync(path.dirname(expectedRunner), { recursive: true });
    fs.writeFileSync(expectedRunner, '');

    vi.mocked(run).mockResolvedValueOnce({ stdout: 'ok-win', stderr: '', exitCode: 0 } as any);

    const result = await cli.run(['doctor', 'workspace'], workspacePath, false);

    expect(result.stdout).toBe('ok-win');
    expect(vi.mocked(run)).toHaveBeenCalledWith(
      expectedRunner,
      ['doctor', 'workspace'],
      expect.objectContaining({ cwd: workspacePath, stdio: 'pipe' })
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('builds frontend scaffold args without backend-only flags', () => {
    expect(
      buildProjectScaffoldArgs({
        kit: 'frontend.nextjs',
        name: 'my-next-front',
        outputDir: '.',
      })
    ).toEqual(['create', 'frontend', 'nextjs', 'my-next-front', '--output', '.', '--yes']);
  });

  it('keeps backend scaffold args cwd-based without unsupported output arguments', () => {
    expect(
      buildProjectScaffoldArgs({
        kit: 'fastapi.standard',
        name: 'my-api',
        outputDir: '/tmp/workspace',
      })
    ).toEqual(['create', 'project', 'fastapi.standard', 'my-api', '--yes']);
  });

  it('routes frontend workspace create through create frontend subcommand', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    await cli.createProjectInWorkspace({
      name: 'my-next-front',
      kit: 'frontend.nextjs',
      workspacePath: '/tmp/workspace',
    });

    expect(vi.mocked(run)).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        '--package',
        'workspai',
        'workspai',
        'create',
        'frontend',
        'nextjs',
        'my-next-front',
        '--output',
        '.',
        '--yes',
      ],
      expect.objectContaining({ cwd: '/tmp/workspace' })
    );
  });

  it('passes optional Python engine skip flag when creating lightweight workspaces', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    await cli.createWorkspace({
      name: 'node-ws',
      parentPath: '/tmp',
      profile: 'node-only',
      skipPythonEngine: true,
      skipGit: true,
    });

    expect(vi.mocked(run)).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        '--package',
        'workspai',
        'workspai',
        'create',
        'workspace',
        'node-ws',
        '--yes',
        '--output',
        '/tmp',
        '--profile',
        'node-only',
        '--skip-python-engine',
        '--skip-git',
      ],
      expect.objectContaining({ cwd: '/tmp' })
    );
  });

  it('sends an explicit minimal workspace command without unselected optional flags', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    await cli.createWorkspace({ name: 'minimal-ws', parentPath: '/srv/workspaces' });

    expect(vi.mocked(run)).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        '--package',
        'workspai',
        'workspai',
        'create',
        'workspace',
        'minimal-ws',
        '--yes',
        '--output',
        '/srv/workspaces',
      ],
      expect.objectContaining({ cwd: '/srv/workspaces' })
    );
  });

  it('forwards all selected workspace creation flags to the npm CLI', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    await cli.createWorkspace({
      name: 'enterprise-ws',
      parentPath: '/srv/workspaces',
      profile: 'enterprise',
      installMethod: 'poetry',
      skipPythonEngine: true,
      skipGit: true,
      dryRun: true,
    });

    expect(vi.mocked(run)).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        '--package',
        'workspai',
        'workspai',
        'create',
        'workspace',
        'enterprise-ws',
        '--yes',
        '--output',
        '/srv/workspaces',
        '--install-method',
        'poetry',
        '--profile',
        'enterprise',
        '--skip-python-engine',
        '--skip-git',
        '--dry-run',
      ],
      expect.objectContaining({ cwd: '/srv/workspaces' })
    );
  });

  it('uses outputParentPath as cwd when scaffolding inside workspace subfolders', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    await cli.createProjectInWorkspace({
      name: 'billing-api',
      kit: 'fastapi.standard',
      workspacePath: '/tmp/workspace',
      outputParentPath: '/tmp/workspace/services',
    });

    expect(vi.mocked(run)).toHaveBeenCalledWith(
      'npx',
      expect.any(Array),
      expect.objectContaining({ cwd: '/tmp/workspace/services' })
    );
  });
});
