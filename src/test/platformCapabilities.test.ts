import { describe, expect, it } from 'vitest';
import {
  buildNpxRapidkitArgs,
  buildRapidkitDisplayCommand,
  buildRapidkitCommand,
  buildShellCommand,
  detectPlatformKind,
  quoteShellArg,
  toDisplayRapidkitCommand,
  toPinnedRapidkitExecutionCommand,
} from '../utils/platformCapabilities';

describe('platformCapabilities', () => {
  it('detects platform kind correctly', () => {
    expect(detectPlatformKind('win32')).toBe('windows');
    expect(detectPlatformKind('linux')).toBe('linux');
    expect(detectPlatformKind('darwin')).toBe('macos');
    expect(detectPlatformKind('aix')).toBe('other');
  });

  it('quotes shell args correctly on posix', () => {
    expect(quoteShellArg('rapidkit', 'linux')).toBe('rapidkit');
    expect(quoteShellArg('my project', 'linux')).toBe("'my project'");
    expect(quoteShellArg("it's", 'linux')).toBe("'it'\"'\"'s'");
    expect(quoteShellArg('', 'linux')).toBe('""');
  });

  it('quotes shell args correctly on windows', () => {
    expect(quoteShellArg('rapidkit', 'win32')).toBe('rapidkit');
    expect(quoteShellArg('my project', 'win32')).toBe('"my project"');
    expect(quoteShellArg('a"b', 'win32')).toBe('"a""b"');
    expect(quoteShellArg('', 'win32')).toBe('""');
  });

  it('builds shell commands with platform-aware quoting', () => {
    expect(buildShellCommand('npx', ['rapidkit', 'workspace', 'my folder'], 'linux')).toBe(
      "npx rapidkit workspace 'my folder'"
    );

    expect(buildShellCommand('npx', ['rapidkit', 'workspace', 'my folder'], 'darwin')).toBe(
      "npx rapidkit workspace 'my folder'"
    );

    expect(buildShellCommand('npx', ['rapidkit', 'workspace', 'my folder'], 'win32')).toBe(
      'npx rapidkit workspace "my folder"'
    );

    expect(buildShellCommand('echo', ['a&b'], 'win32')).toBe('echo "a&b"');
  });

  it('builds rapidkit commands consistently across platforms', () => {
    expect(buildRapidkitCommand(['doctor', 'workspace'], 'linux')).toBe(
      'npx --yes --package rapidkit rapidkit doctor workspace'
    );
    expect(buildRapidkitCommand(['doctor', 'workspace'], 'win32')).toBe(
      'npx --yes --package rapidkit rapidkit doctor workspace'
    );
    expect(buildRapidkitCommand(['create', 'workspace', 'my folder'], 'linux')).toBe(
      "npx --yes --package rapidkit rapidkit create workspace 'my folder'"
    );
  });

  it('builds user-facing rapidkit display commands without pinned npm wrapper noise', () => {
    expect(buildRapidkitDisplayCommand(['doctor', 'workspace'], 'linux')).toBe(
      'npx rapidkit doctor workspace'
    );
    expect(buildRapidkitDisplayCommand(['add', 'module', 'free/ai/agent_runtime'], 'win32')).toBe(
      'npx rapidkit add module free/ai/agent_runtime'
    );
    expect(buildRapidkitDisplayCommand(['create', 'workspace', 'my folder'], 'linux')).toBe(
      "npx rapidkit create workspace 'my folder'"
    );
  });

  it('normalizes pinned execution commands for display only', () => {
    expect(
      toDisplayRapidkitCommand(
        'Run npx --yes --package rapidkit rapidkit add module free/ai/agent_runtime'
      )
    ).toBe('Run npx rapidkit add module free/ai/agent_runtime');
  });

  it('normalizes simple display commands back to the pinned execution wrapper', () => {
    expect(toPinnedRapidkitExecutionCommand('npx rapidkit doctor workspace')).toBe(
      'npx --yes --package rapidkit rapidkit doctor workspace'
    );
    expect(
      toPinnedRapidkitExecutionCommand('Run npx rapidkit add module free/ai/agent_runtime')
    ).toBe('Run npx --yes --package rapidkit rapidkit add module free/ai/agent_runtime');
  });

  it('builds the pinned npx rapidkit argument contract for extension host calls', () => {
    expect(buildNpxRapidkitArgs(['doctor', 'workspace'])).toEqual([
      '--yes',
      '--package',
      'rapidkit',
      'rapidkit',
      'doctor',
      'workspace',
    ]);
  });

  it('keeps scenario command matrix stable across linux/macos/windows', () => {
    const platforms: NodeJS.Platform[] = ['linux', 'darwin', 'win32'];

    const noSpaceScenarios: string[][] = [
      ['init'],
      ['dev'],
      ['test'],
      ['build'],
      ['doctor', 'workspace'],
      ['doctor', 'workspace', '--fix'],
      ['workspace', 'policy', 'show'],
      ['workspace', 'policy', 'set', 'mode', 'strict'],
      ['cache', 'status'],
      ['cache', 'clear'],
      ['cache', 'prune'],
      ['cache', 'repair'],
      ['mirror', 'status'],
      ['mirror', 'sync'],
      ['mirror', 'verify'],
      ['mirror', 'rotate'],
      ['add', 'module', 'free/auth/auth_core'],
    ];

    for (const scenario of noSpaceScenarios) {
      for (const platform of platforms) {
        expect(buildRapidkitCommand(scenario, platform)).toBe(
          `npx --yes --package rapidkit rapidkit ${scenario.join(' ')}`
        );
      }
    }

    expect(
      buildRapidkitCommand(['workspace', 'policy', 'set', 'team name', 'strict'], 'linux')
    ).toBe("npx --yes --package rapidkit rapidkit workspace policy set 'team name' strict");
    expect(
      buildRapidkitCommand(['workspace', 'policy', 'set', 'team name', 'strict'], 'darwin')
    ).toBe("npx --yes --package rapidkit rapidkit workspace policy set 'team name' strict");
    expect(
      buildRapidkitCommand(['workspace', 'policy', 'set', 'team name', 'strict'], 'win32')
    ).toBe('npx --yes --package rapidkit rapidkit workspace policy set "team name" strict');
  });

  it('quotes snapshot command arguments without changing the CLI contract', () => {
    expect(
      buildRapidkitCommand(
        ['snapshot', 'create', 'before upgrade', '--reason', "owner's release prep"],
        'linux'
      )
    ).toBe(
      'npx --yes --package rapidkit rapidkit snapshot create ' +
        `'before upgrade' --reason 'owner'"'"'s release prep'`
    );

    expect(
      buildRapidkitCommand(
        ['snapshot', 'restore', 'before upgrade', '--force', '--reason', 'rollback & verify'],
        'win32'
      )
    ).toBe(
      'npx --yes --package rapidkit rapidkit snapshot restore ' +
        '"before upgrade" --force --reason "rollback & verify"'
    );
  });
});
