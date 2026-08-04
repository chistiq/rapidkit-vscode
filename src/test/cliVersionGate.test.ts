import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn(), showErrorMessage: vi.fn(), createTerminal: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../utils/exec', () => ({ run: vi.fn() }));

import { run } from '../utils/exec';
import {
  decideCliVersionGate,
  gateCompatibleCliVersion,
  resolveLinkedCliVersion,
} from '../core/cliVersionGate';
import { assessCliVersion } from '../core/cliVersionPolicy';
import * as vscode from 'vscode';

const mockedRun = vi.mocked(run);

describe('resolveLinkedCliVersion', () => {
  beforeEach(() => {
    mockedRun.mockReset();
  });

  it('prefers workspace-local package metadata without spawning a command', async () => {
    expect(
      await resolveLinkedCliVersion('/tmp/ws', {
        installedPackages: [
          {
            name: 'workspai',
            version: '0.52.2',
            manifestPath: '/tmp/ws/node_modules/workspai/package.json',
            source: 'workspace',
          },
        ],
      })
    ).toBe('0.52.2');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('reads --version --json from a directly executable CLI', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: JSON.stringify({ schemaVersion: 'rapidkit-version-v1', version: '0.38.2' }),
      stderr: '',
      exitCode: 0,
    });
    expect(await resolveLinkedCliVersion('/tmp/ws', { installedPackages: [] })).toBe('0.38.2');
  });

  it('falls back to a bare semver token in --version output', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: 'rapidkit 0.40.1\n', stderr: '', exitCode: 0 });
    expect(await resolveLinkedCliVersion('/tmp/ws', { installedPackages: [] })).toBe('0.40.1');
  });

  it('uses NVM package metadata when the Extension Host PATH is stale', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '', stderr: 'workspai not found', exitCode: 127 });

    await expect(
      resolveLinkedCliVersion('/tmp/ws', {
        installedPackages: [
          {
            name: 'workspai',
            version: '0.52.2',
            manifestPath:
              '/home/dev/.nvm/versions/node/v20.20.2/lib/node_modules/workspai/package.json',
            source: 'global',
          },
        ],
      })
    ).resolves.toBe('0.52.2');
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it('finds a global Workspai package when the Extension Host PATH is stale', async () => {
    mockedRun
      .mockResolvedValueOnce({ stdout: '', stderr: 'npx not found', exitCode: 127 })
      .mockResolvedValueOnce({
        stdout: '/home/dev/.nvm/versions/node/v20.20.2/lib\n└── workspai@0.51.0\n',
        stderr: '',
        exitCode: 0,
      });

    await expect(
      resolveLinkedCliVersion('/tmp/ws', { installedPackages: [], homeDir: '/missing-home' })
    ).resolves.toBe('0.51.0');
    expect(mockedRun).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.arrayContaining(['list', '-g', 'workspai', '--depth=0']),
      expect.objectContaining({
        env: expect.objectContaining({ PATH: expect.any(String) }),
      })
    );
  });

  it('returns null when no version can be detected', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: 'no version here', stderr: '', exitCode: 1 });
    expect(
      await resolveLinkedCliVersion('/tmp/ws', {
        installedPackages: [],
        homeDir: '/missing-home',
        env: { PATH: '/missing-bin' },
      })
    ).toBeNull();
  });
});

describe('decideCliVersionGate', () => {
  it('warns once for an incompatible version', () => {
    const belowMin = assessCliVersion('0.20.0');
    expect(decideCliVersionGate(belowMin, { alreadyWarned: false }).shouldWarn).toBe(true);
    expect(decideCliVersionGate(belowMin, { alreadyWarned: true }).shouldWarn).toBe(false);
    expect(decideCliVersionGate(belowMin, { alreadyWarned: true, force: true }).shouldWarn).toBe(
      true
    );
  });

  it('never warns for a compatible version', () => {
    const compatible = assessCliVersion('0.99.0');
    expect(decideCliVersionGate(compatible, { alreadyWarned: false }).shouldWarn).toBe(false);
    expect(decideCliVersionGate(compatible, { alreadyWarned: false, force: true }).shouldWarn).toBe(
      false
    );
  });

  it('warns for an undetectable (missing) version', () => {
    const missing = assessCliVersion(null);
    expect(decideCliVersionGate(missing, { alreadyWarned: false }).shouldWarn).toBe(true);
  });
});

describe('gateCompatibleCliVersion', () => {
  beforeEach(() => {
    mockedRun.mockReset();
    vi.mocked(vscode.window.showErrorMessage).mockReset();
    vi.mocked(vscode.commands.executeCommand).mockReset();
  });

  it('allows compatible enterprise workflows', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '0.99.0', stderr: '', exitCode: 0 });
    await expect(
      gateCompatibleCliVersion({ cwd: '/tmp/ws', featureLabel: 'Dashboard Evidence' })
    ).resolves.toBe(true);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('blocks below-minimum enterprise workflows without a continue option', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '0.1.0', stderr: '', exitCode: 0 });
    await expect(
      gateCompatibleCliVersion({ cwd: '/tmp/ws', featureLabel: 'Dashboard Evidence' })
    ).resolves.toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Dashboard Evidence is blocked'),
      'Update CLI',
      'Open Setup Recovery'
    );
  });
});
