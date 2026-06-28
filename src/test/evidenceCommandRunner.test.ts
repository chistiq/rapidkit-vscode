import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
  },
}));

vi.mock('../utils/exec', () => ({
  run: vi.fn(),
}));

vi.mock('../utils/platformCapabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/platformCapabilities')>();
  return {
    ...actual,
    warmRapidkitNpmPackageResolution: vi.fn().mockResolvedValue(undefined),
    buildRapidkitExecutionSpec: vi.fn((args: string[] = []) => ({
      command: 'npx',
      args: ['--yes', '--package', 'file:/repo/rapidkit-npm', 'rapidkit', ...args],
      displayCommand: `npx rapidkit ${args.join(' ')}`.trim(),
      shell: false,
    })),
  };
});

vi.mock('../core/rapidkitEnterpriseCliGate', () => ({
  gateRapidkitCliArgs: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { run } from '../utils/exec';
import {
  buildRapidkitExecutionSpec,
  warmRapidkitNpmPackageResolution,
} from '../utils/platformCapabilities';
import { gateRapidkitCliArgs } from '../core/rapidkitEnterpriseCliGate';
import { runEvidenceCliCommand } from '../core/evidenceCommandRunner';

const mockedRun = vi.mocked(run);

describe('evidenceCommandRunner', () => {
  beforeEach(() => {
    mockedRun.mockReset();
    vi.mocked(gateRapidkitCliArgs).mockReset();
    vi.mocked(gateRapidkitCliArgs).mockResolvedValue({ allowed: true });
    vi.mocked(warmRapidkitNpmPackageResolution).mockClear();
    vi.mocked(buildRapidkitExecutionSpec).mockClear();
  });

  it('runs dashboard evidence commands through the pinned rapidkit npm helper', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '{}', stderr: '', exitCode: 0 });

    await runEvidenceCliCommand({
      workspacePath: '/tmp/ws',
      cliArgs: ['workspace', 'verify', '--json'],
      label: 'Workspace Verify',
      revealOutput: false,
    });

    expect(warmRapidkitNpmPackageResolution).toHaveBeenCalledTimes(1);
    expect(gateRapidkitCliArgs).toHaveBeenCalledWith({
      args: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      featureLabel: 'Workspace Verify',
    });
    expect(buildRapidkitExecutionSpec).toHaveBeenCalledWith(['workspace', 'verify', '--json']);
    expect(mockedRun).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        '--package',
        'file:/repo/rapidkit-npm',
        'rapidkit',
        'workspace',
        'verify',
        '--json',
      ],
      expect.objectContaining({ cwd: '/tmp/ws', shell: false })
    );
  });

  it('fails closed when the linked CLI lacks the required contract capability', async () => {
    vi.mocked(gateRapidkitCliArgs).mockResolvedValueOnce({
      allowed: false,
      error: 'Workspace Verify is blocked because workspace verify is missing.',
    });

    const result = await runEvidenceCliCommand({
      workspacePath: '/tmp/ws',
      cliArgs: ['workspace', 'verify', '--json'],
      label: 'Workspace Verify',
      revealOutput: false,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: '',
      stderr: 'Workspace Verify is blocked because workspace verify is missing.',
      displayCommand: 'rapidkit workspace verify --json',
    });
    expect(warmRapidkitNpmPackageResolution).not.toHaveBeenCalled();
    expect(buildRapidkitExecutionSpec).not.toHaveBeenCalled();
    expect(mockedRun).not.toHaveBeenCalled();
  });
});
