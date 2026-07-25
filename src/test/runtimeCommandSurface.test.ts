import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../utils/exec', () => ({
  run: vi.fn(),
}));

vi.mock('../utils/platformCapabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/platformCapabilities')>();
  return {
    ...actual,
    warmRapidkitNpmPackageResolution: vi.fn().mockResolvedValue(undefined),
  };
});

import { run } from '../utils/exec';
import {
  COMMAND_CAPABILITIES_SCHEMA_VERSION,
  clearRuntimeCommandSurfaceCache,
  fetchRuntimeCommandSurface,
} from '../core/runtimeCommandSurface';

const mockedRun = vi.mocked(run);

function payload(): string {
  return JSON.stringify({
    schemaVersion: COMMAND_CAPABILITIES_SCHEMA_VERSION,
    cli: 'rapidkit-npm',
    version: '0.39.0',
    contracts: { runtimeCommandSurface: 'rapidkit-runtime-command-surface-v1' },
    workspace: {
      command: 'workspace',
      subcommands: ['model', 'graph', 'watch'],
      intelligenceSubcommands: ['model', 'impact', 'verify'],
    },
    commands: {
      coreBacked: ['diff', 'rollback'],
      projectScoped: ['init', 'test', 'build'],
    },
    commandMap: { create: {}, adopt: {}, workspace: {} },
  });
}

describe('fetchRuntimeCommandSurface', () => {
  beforeEach(() => {
    mockedRun.mockReset();
    clearRuntimeCommandSurfaceCache();
  });

  it('parses the trailing capability JSON into a normalized snapshot', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: `noise\n${payload()}`, stderr: '', exitCode: 0 });

    const surface = await fetchRuntimeCommandSurface({ cwd: '/tmp/a', forceRefresh: true });
    expect(surface).not.toBeNull();
    expect(surface?.version).toBe('0.39.0');
    expect(surface?.workspaceSubcommands).toEqual(['model', 'graph', 'watch']);
    expect(surface?.workspaceIntelligenceSubcommands).toEqual(['model', 'impact', 'verify']);
    expect(surface?.coreBackedCommands).toEqual(['diff', 'rollback']);
    expect(surface?.projectScopedCommands).toEqual(['init', 'test', 'build']);
    expect(surface?.topLevelCommands).toEqual(['create', 'adopt', 'workspace']);
    expect(surface?.contracts.runtimeCommandSurface).toBe('rapidkit-runtime-command-surface-v1');
  });

  it('caches a successful resolution per cwd', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: payload(), stderr: '', exitCode: 0 });

    const first = await fetchRuntimeCommandSurface({ cwd: '/tmp/a' });
    const second = await fetchRuntimeCommandSurface({ cwd: '/tmp/a' });
    expect(first).toBe(second);
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures (retries on next call)', async () => {
    mockedRun.mockResolvedValueOnce({ stdout: '', stderr: 'boom', exitCode: 1 });
    mockedRun.mockResolvedValueOnce({ stdout: payload(), stderr: '', exitCode: 0 });

    const first = await fetchRuntimeCommandSurface({ cwd: '/tmp/b' });
    expect(first).toBeNull();
    const second = await fetchRuntimeCommandSurface({ cwd: '/tmp/b' });
    expect(second).not.toBeNull();
    expect(mockedRun).toHaveBeenCalledTimes(2);
  });

  it('returns null for an unrecognized schema version', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: JSON.stringify({ schemaVersion: 'something-else' }),
      stderr: '',
      exitCode: 0,
    });

    const surface = await fetchRuntimeCommandSurface({ cwd: '/tmp/c', forceRefresh: true });
    expect(surface).toBeNull();
  });

  it('returns null when the CLI throws', async () => {
    mockedRun.mockRejectedValueOnce(new Error('spawn ENOENT'));

    const surface = await fetchRuntimeCommandSurface({ cwd: '/tmp/d', forceRefresh: true });
    expect(surface).toBeNull();
  });
});
