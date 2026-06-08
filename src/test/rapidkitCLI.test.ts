/**
 * RapidKit CLI Tests
 */

import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { WorkspaiCLI } from '../core/rapidkitCLI';
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

  it('falls back to npx when direct rapidkit binary is unavailable in getVersion', async () => {
    vi.mocked(run)
      .mockRejectedValueOnce(new Error('rapidkit not found'))
      .mockResolvedValueOnce({ stdout: '0.24.1\n', stderr: '', exitCode: 0 } as any);

    const version = await cli.getVersion();

    expect(version).toBe('0.24.1');
    expect(vi.mocked(run)).toHaveBeenNthCalledWith(
      1,
      'rapidkit',
      ['--version'],
      expect.objectContaining({ stdio: 'pipe', timeout: 3000 })
    );
    expect(vi.mocked(run)).toHaveBeenNthCalledWith(
      2,
      'npx',
      ['--yes', '--package', 'rapidkit', 'rapidkit', '--version'],
      expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
    );
  });

  it('falls back to npx when direct rapidkit run fails', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-cli-fallback-'));

    vi.mocked(run)
      // direct rapidkit fallback attempt fails too
      .mockRejectedValueOnce(new Error('rapidkit missing'))
      // npx fallback succeeds
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 } as any);

    const result = await cli.run(['doctor', 'workspace'], workspacePath, true);

    expect(result.stdout).toBe('ok');
    expect(vi.mocked(run)).toHaveBeenLastCalledWith(
      'npx',
      ['--yes', '--package', 'rapidkit', 'rapidkit', 'doctor', 'workspace'],
      expect.objectContaining({ cwd: workspacePath, stdio: 'pipe' })
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('uses workspace .venv POSIX rapidkit runner when available', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-cli-posix-'));
    const expectedRunner = path.join(workspacePath, '.venv', 'bin', 'rapidkit');

    fs.mkdirSync(path.dirname(expectedRunner), { recursive: true });
    fs.writeFileSync(expectedRunner, '#!/usr/bin/env bash\n');

    vi.mocked(run).mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 } as any);

    const result = await cli.run(['doctor', 'workspace'], workspacePath, true);

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

    const result = await cli.run(['doctor', 'workspace'], workspacePath, true);

    expect(result.stdout).toBe('ok-win');
    expect(vi.mocked(run)).toHaveBeenCalledWith(
      expectedRunner,
      ['doctor', 'workspace'],
      expect.objectContaining({ cwd: workspacePath, stdio: 'pipe' })
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });
});
