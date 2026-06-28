import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn(), showErrorMessage: vi.fn(), createTerminal: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../utils/exec', () => ({ run: vi.fn() }));

const fetchRuntimeCommandSurface = vi.fn();
vi.mock('../core/runtimeCommandSurface', () => ({
  fetchRuntimeCommandSurface: (...args: unknown[]) => fetchRuntimeCommandSurface(...args),
}));

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
    fetchRuntimeCommandSurface.mockReset();
  });

  it('prefers the version from the commands --json surface', async () => {
    fetchRuntimeCommandSurface.mockResolvedValueOnce({ version: '0.39.0' });
    expect(await resolveLinkedCliVersion('/tmp/ws')).toBe('0.39.0');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('falls back to --version --json when the surface is unavailable', async () => {
    fetchRuntimeCommandSurface.mockResolvedValueOnce(null);
    mockedRun.mockResolvedValueOnce({
      stdout: JSON.stringify({ schemaVersion: 'rapidkit-version-v1', version: '0.38.2' }),
      stderr: '',
      exitCode: 0,
    });
    expect(await resolveLinkedCliVersion('/tmp/ws')).toBe('0.38.2');
  });

  it('falls back to a bare semver token in --version output', async () => {
    fetchRuntimeCommandSurface.mockResolvedValueOnce(null);
    mockedRun.mockResolvedValueOnce({ stdout: 'rapidkit 0.40.1\n', stderr: '', exitCode: 0 });
    expect(await resolveLinkedCliVersion('/tmp/ws')).toBe('0.40.1');
  });

  it('returns null when no version can be detected', async () => {
    fetchRuntimeCommandSurface.mockResolvedValueOnce(null);
    mockedRun.mockResolvedValueOnce({ stdout: 'no version here', stderr: '', exitCode: 1 });
    expect(await resolveLinkedCliVersion('/tmp/ws')).toBeNull();
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
    fetchRuntimeCommandSurface.mockReset();
    vi.mocked(vscode.window.showErrorMessage).mockReset();
    vi.mocked(vscode.commands.executeCommand).mockReset();
  });

  it('allows compatible enterprise workflows', async () => {
    fetchRuntimeCommandSurface.mockResolvedValueOnce({ version: '0.99.0' });
    await expect(
      gateCompatibleCliVersion({ cwd: '/tmp/ws', featureLabel: 'Dashboard Evidence' })
    ).resolves.toBe(true);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('blocks below-minimum enterprise workflows without a continue option', async () => {
    fetchRuntimeCommandSurface.mockResolvedValueOnce({ version: '0.1.0' });
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
