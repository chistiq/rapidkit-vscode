import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildPackageRunnerInvocationEnv,
  buildPackageRunnerSubprocessEnv,
  buildNpmCliVersionVerifyCommands,
  buildNpxRapidkitArgs,
  buildNpxRapidkitPrefix,
  buildNpxRapidkitVersionProbeArgs,
  buildRapidkitDisplayCommand,
  buildRapidkitCommand,
  buildRapidkitExecutionSpec,
  buildShellCommand,
  detectPlatformKind,
  discoverInstalledNpmPackages,
  discoverPackageRunnerInvocations,
  discoverPythonExecutableCandidates,
  parseNpmCliVersionOutput,
  parseGlobalNpmPackageVersionOutput,
  parsePipxRapidkitCoreVersion,
  parseRapidkitCoreVersion,
  quoteShellArg,
  resetResolvedRapidkitNpmPackageSpecifier,
  resolvePackageRunnerInvocation,
  setResolvedRapidkitNpmPackageSpecifier,
  toDisplayRapidkitCommand,
  toPinnedRapidkitExecutionCommand,
} from '../utils/platformCapabilities';

describe('platformCapabilities', () => {
  beforeEach(() => {
    resetResolvedRapidkitNpmPackageSpecifier();
  });

  afterEach(() => {
    resetResolvedRapidkitNpmPackageSpecifier();
    delete process.env.WORKSPAI_NPM_PACKAGE;
    delete process.env.RAPIDKIT_NPM_PACKAGE;
  });

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

  it('builds Workspai commands with an explicit registry package by default', () => {
    expect(buildRapidkitCommand(['doctor', 'workspace'], 'linux')).toBe(
      'npx --yes --package workspai workspai doctor workspace'
    );
    expect(buildRapidkitCommand(['doctor', 'workspace'], 'win32')).toBe(
      'npx --yes --package workspai workspai doctor workspace'
    );
    expect(buildRapidkitCommand(['create', 'workspace', 'my folder'], 'linux')).toBe(
      "npx --yes --package workspai workspai create workspace 'my folder'"
    );
  });

  it('ignores ambient linked packages but honors an explicit package override', () => {
    setResolvedRapidkitNpmPackageSpecifier('file:/tmp/rapidkit-npm');
    expect(buildNpxRapidkitPrefix()).toEqual(['--yes', '--package', 'workspai', 'workspai']);
    process.env.WORKSPAI_NPM_PACKAGE = 'file:/tmp/rapidkit-npm';
    expect(buildNpxRapidkitArgs(['adopt', '--help'])).toEqual([
      '--yes',
      '--package',
      'file:/tmp/rapidkit-npm',
      'workspai',
      'adopt',
      '--help',
    ]);
  });

  it('builds user-facing Workspai display commands without pinned npm wrapper noise', () => {
    expect(buildRapidkitDisplayCommand(['doctor', 'workspace'], 'linux')).toBe(
      'npx workspai doctor workspace'
    );
    expect(buildRapidkitDisplayCommand(['add', 'module', 'free/ai/agent_runtime'], 'win32')).toBe(
      'npx workspai add module free/ai/agent_runtime'
    );
    expect(buildRapidkitDisplayCommand(['create', 'workspace', 'my folder'], 'linux')).toBe(
      "npx workspai create workspace 'my folder'"
    );
  });

  it('normalizes pinned execution commands for display only', () => {
    expect(
      toDisplayRapidkitCommand(
        'Run npx --yes --package file:/tmp/rapidkit-npm workspai add module free/ai/agent_runtime'
      )
    ).toBe('Run npx workspai add module free/ai/agent_runtime');
    expect(toDisplayRapidkitCommand('Run npx --yes workspai doctor workspace')).toBe(
      'Run npx workspai doctor workspace'
    );
  });

  it('normalizes simple display commands back to the execution wrapper', () => {
    expect(toPinnedRapidkitExecutionCommand('npx workspai doctor workspace')).toBe(
      'npx --yes --package workspai workspai doctor workspace'
    );
    expect(
      toPinnedRapidkitExecutionCommand('Run npx workspai add module free/ai/agent_runtime')
    ).toBe('Run npx --yes --package workspai workspai add module free/ai/agent_runtime');
  });

  it('builds the explicit npm package contract for extension host calls', () => {
    expect(buildNpxRapidkitArgs(['doctor', 'workspace'])).toEqual([
      '--yes',
      '--package',
      'workspai',
      'workspai',
      'doctor',
      'workspace',
    ]);
  });

  it('builds the canonical rapidkit execution spec with platform shell mode', () => {
    const linuxInvocation = resolvePackageRunnerInvocation('npx', 'linux');
    expect(buildRapidkitExecutionSpec(['workspace', 'verify', 'my folder'], 'linux')).toEqual({
      command: linuxInvocation.command,
      args: [
        ...linuxInvocation.prefixArgs,
        '--yes',
        '--package',
        'workspai',
        'workspai',
        'workspace',
        'verify',
        'my folder',
      ],
      displayCommand: "npx workspai workspace verify 'my folder'",
      shell: false,
    });

    const windowsInvocation = resolvePackageRunnerInvocation('npx', 'win32');
    expect(buildRapidkitExecutionSpec(['workspace', 'verify', 'my folder'], 'win32')).toEqual({
      command: windowsInvocation.command,
      args: [
        ...windowsInvocation.prefixArgs,
        '--yes',
        '--package',
        'workspai',
        'workspai',
        'workspace',
        'verify',
        'my folder',
      ],
      displayCommand: 'npx workspai workspace verify "my folder"',
      shell: true,
    });
  });

  it('resolves package runners as command-safe invocations for extension host subprocesses', () => {
    const invocation = resolvePackageRunnerInvocation('npm');

    expect(invocation.command).toBeTruthy();
    expect(invocation.command.includes(' ')).toBe(false);
    if (invocation.command === process.execPath) {
      expect(invocation.prefixArgs[0]).toMatch(/npm-cli\.js$/);
    } else if (invocation.command === 'corepack') {
      expect(invocation.prefixArgs).toEqual(['npm']);
    } else {
      expect(invocation.prefixArgs).toEqual([]);
    }
  });

  it('builds package-runner env without inherited npx package pins', () => {
    const env = buildPackageRunnerSubprocessEnv({
      PATH: '/usr/bin',
      npm_config_package: 'file:/tmp/rapidkit-npm',
      npm_config__package: 'file:/tmp/rapidkit-npm',
      HOME: '/home/dev',
    });

    expect(env.npm_config_package).toBeUndefined();
    expect(env.npm_config__package).toBeUndefined();
    expect(env.COREPACK_HOME).toBeTruthy();
    expect(env.HOME).toBe('/home/dev');
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
          `npx --yes --package workspai workspai ${scenario.join(' ')}`
        );
      }
    }

    expect(
      buildRapidkitCommand(['workspace', 'policy', 'set', 'team name', 'strict'], 'linux')
    ).toBe("npx --yes --package workspai workspai workspace policy set 'team name' strict");
    expect(
      buildRapidkitCommand(['workspace', 'policy', 'set', 'team name', 'strict'], 'darwin')
    ).toBe("npx --yes --package workspai workspai workspace policy set 'team name' strict");
    expect(
      buildRapidkitCommand(['workspace', 'policy', 'set', 'team name', 'strict'], 'win32')
    ).toBe('npx --yes --package workspai workspai workspace policy set "team name" strict');
  });

  it('quotes snapshot command arguments without changing the CLI contract', () => {
    expect(
      buildRapidkitCommand(
        ['snapshot', 'create', 'before upgrade', '--reason', "owner's release prep"],
        'linux'
      )
    ).toBe(
      'npx --yes --package workspai workspai snapshot create ' +
        `'before upgrade' --reason 'owner'"'"'s release prep'`
    );

    expect(
      buildRapidkitCommand(
        ['snapshot', 'restore', 'before upgrade', '--force', '--reason', 'rollback & verify'],
        'win32'
      )
    ).toBe(
      'npx --yes --package workspai workspai snapshot restore ' +
        '"before upgrade" --force --reason "rollback & verify"'
    );
  });

  it('uses unpinned npx args for npm CLI version probes only', () => {
    expect(buildNpxRapidkitVersionProbeArgs()).toEqual(['--yes', 'workspai', '--version']);
    expect(buildNpmCliVersionVerifyCommands('linux')).toEqual([
      'npx workspai --version',
      'npm list -g workspai --depth=0',
    ]);
  });

  it('parses npm CLI version output and ignores python core banners', () => {
    expect(parseNpmCliVersionOutput('0.34.0')).toBe('0.34.0');
    expect(parseNpmCliVersionOutput('RapidKit Version v0.5.4')).toBeNull();
    expect(parseNpmCliVersionOutput('rapidkit@0.34.0')).toBe('0.34.0');
  });

  it('parses the package version instead of an nvm directory version from npm list', () => {
    expect(
      parseGlobalNpmPackageVersionOutput(
        '/home/dev/.nvm/versions/node/v20.20.2/lib\n└── workspai@0.51.0\n'
      )
    ).toBe('0.51.0');
    expect(parseGlobalNpmPackageVersionOutput('└── (empty)')).toBeNull();
  });

  it('discovers npm and npx installed under nvm even when Extension Host PATH is stale', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-nvm-probe-'));
    try {
      const bin = path.join(home, '.nvm', 'versions', 'node', 'v20.20.2', 'bin');
      const platform = process.platform;
      const executableSuffix = platform === 'win32' ? '.cmd' : '';
      const stalePath = platform === 'win32' ? 'C:\\Windows\\System32' : '/usr/bin';
      fs.mkdirSync(bin, { recursive: true });
      for (const command of ['npm', 'npx']) {
        fs.writeFileSync(path.join(bin, `${command}${executableSuffix}`), '#!/bin/sh\n', {
          mode: 0o755,
        });
      }

      const npmInvocations = discoverPackageRunnerInvocations(
        'npm',
        platform,
        { PATH: stalePath },
        home
      );
      const npxInvocations = discoverPackageRunnerInvocations(
        'npx',
        platform,
        { PATH: stalePath },
        home
      );

      const npmInvocation = npmInvocations.find(
        (entry) => entry.command === path.join(bin, `npm${executableSuffix}`)
      );
      const npxInvocation = npxInvocations.find(
        (entry) => entry.command === path.join(bin, `npx${executableSuffix}`)
      );
      expect(npmInvocation).toBeTruthy();
      expect(npxInvocation).toBeTruthy();
      const invocationPath =
        buildPackageRunnerInvocationEnv(npmInvocation!, { PATH: stalePath }, platform).PATH ?? '';
      const pathEntries = invocationPath.split(path.delimiter);
      expect(pathEntries[0]).toBe(bin);
      expect(pathEntries).toEqual(
        expect.arrayContaining([stalePath, path.dirname(process.execPath)])
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('discovers a globally installed Workspai package from NVM metadata without PATH', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-nvm-package-'));
    try {
      const manifest = path.join(
        home,
        '.nvm',
        'versions',
        'node',
        'v20.20.2',
        'lib',
        'node_modules',
        'workspai',
        'package.json'
      );
      fs.mkdirSync(path.dirname(manifest), { recursive: true });
      fs.writeFileSync(manifest, JSON.stringify({ name: 'workspai', version: '0.52.2' }), 'utf8');

      expect(
        discoverInstalledNpmPackages('workspai', {
          platform: 'linux',
          env: { PATH: '/usr/bin' },
          homeDir: home,
        })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'global',
            version: '0.52.2',
            manifestPath: manifest,
          }),
        ])
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('discovers pyenv Python interpreters without relying on interactive shell PATH', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-pyenv-probe-'));
    try {
      const python = path.join(home, '.pyenv', 'versions', '3.10.19', 'bin', 'python');
      fs.mkdirSync(path.dirname(python), { recursive: true });
      fs.writeFileSync(python, '#!/bin/sh\n', { mode: 0o755 });

      expect(discoverPythonExecutableCandidates('linux', { PATH: '/usr/bin' }, home)).toContain(
        python
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('rejects broken pipx metadata prose as a RapidKit Core version', () => {
    expect(
      parsePipxRapidkitCoreVersion('package rapidkit-core has missing internal pipx metadata.')
    ).toBeNull();
    expect(
      parsePipxRapidkitCoreVersion('package rapidkit-core 0.6.0, installed using Python 3.10')
    ).toBe('0.6.0');
    expect(parseRapidkitCoreVersion('Version: 0.5.5')).toBe('0.5.5');
    expect(parseRapidkitCoreVersion('has')).toBeNull();
  });
});
