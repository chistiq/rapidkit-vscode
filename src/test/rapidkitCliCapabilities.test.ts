import fs from 'fs';
import path from 'path';

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
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
  };
});

import { run } from '../utils/exec';
import * as vscode from 'vscode';
import { resolvePackageRunnerInvocation } from '../utils/platformCapabilities';
import {
  gateCoreBackedRapidkitCli,
  gateCreateFrontendCli,
  gateImportCli,
  gateProjectScopedRapidkitCli,
  gateRootRapidkitCli,
  gateTopLevelRapidkitCli,
  gateWorkspaceSubcommandCli,
  gateWorkspaceIntelligenceCli,
  probeAdoptCliCapabilities,
  probeCoreBackedCliCapability,
  probeCreateFrontendCliCapabilities,
  probeImportCliCapabilities,
  probeProjectScopedCliCapability,
  probeRootCliCapability,
  probeTopLevelCliCapability,
  probeWorkspaceSubcommandCliCapability,
  probeWorkspaceIntelligenceCliCapabilities,
  REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
} from '../core/rapidkitCliCapabilities';
import {
  gateIncidentStudioRapidkitCommand,
  gateRapidkitCliArgs,
} from '../core/rapidkitEnterpriseCliGate';
import { clearRuntimeCommandSurfaceCache } from '../core/runtimeCommandSurface';
import { MIN_RAPIDKIT_CLI_VERSION } from '../core/cliVersionCompatibilityContract';

const mockedRun = vi.mocked(run);

function commandsJson(
  overrides: {
    workspaceSubcommands?: string[];
    intelligenceSubcommands?: string[];
    commandMap?: string[];
    coreBacked?: string[];
    projectScoped?: string[];
    schemaVersion?: string;
  } = {}
): string {
  const intelligence = overrides.intelligenceSubcommands ?? [
    ...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
  ];
  const workspaceSubcommands = overrides.workspaceSubcommands ?? [
    ...intelligence,
    'graph',
    'watch',
  ];
  const commandMapIds = overrides.commandMap ?? [
    'create',
    'adopt',
    'agent',
    'import',
    'workspace',
    'project',
    'readiness',
    'doctor',
    'autopilot',
  ];
  const payload = {
    schemaVersion: overrides.schemaVersion ?? 'rapidkit-command-capabilities-v1',
    scope: 'global',
    cli: 'rapidkit-npm',
    version: MIN_RAPIDKIT_CLI_VERSION,
    cwd: '/tmp/ws',
    contracts: {
      runtimeCommandSurface: 'rapidkit-runtime-command-surface-v1',
      cliLogEvent: 'cli-log-event-v1',
      freshnessMetadata: 'rapidkit-freshness-metadata-v1',
    },
    commands: {
      npmOwned: [],
      coreBacked: overrides.coreBacked ?? [],
      projectScoped: overrides.projectScoped ?? [],
    },
    workspace: {
      command: 'workspace',
      subcommands: workspaceSubcommands,
      intelligenceSubcommands: intelligence,
    },
    commandMap: Object.fromEntries(commandMapIds.map((id) => [id, { command: id }])),
  };
  return `some progress noise\n${JSON.stringify(payload)}\n`;
}

describe('rapidkitCliCapabilities (commands --json driven)', () => {
  beforeEach(() => {
    mockedRun.mockReset();
    clearRuntimeCommandSurfaceCache();
    vi.mocked(vscode.window.showErrorMessage).mockReset();
  });

  it('detects workspace intelligence from workspai commands --json', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson(),
      stderr: '',
      exitCode: 0,
    });

    const probe = await probeWorkspaceIntelligenceCliCapabilities({ forceRefresh: true });
    expect(probe.available).toBe(true);
    expect(probe.missingFeatures).toEqual([]);
  });

  it('runs `workspai commands --json` through the portable npx resolver', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson(),
      stderr: '',
      exitCode: 0,
    });

    await probeWorkspaceIntelligenceCliCapabilities({ forceRefresh: true });
    expect(mockedRun).toHaveBeenCalledTimes(1);
    const invocation = resolvePackageRunnerInvocation('npx');
    expect(mockedRun.mock.calls[0]?.[0]).toBe(invocation.command);
    const args = mockedRun.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining([...invocation.prefixArgs, '--yes', 'workspai']));
    expect(args).toContain('commands');
    expect(args).toContain('--json');
    expect(args).not.toContain('--help');
  });

  it('reports missing intelligence subcommands when the CLI advertises an incomplete chain', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson({ intelligenceSubcommands: ['model', 'snapshot'] }),
      stderr: '',
      exitCode: 0,
    });

    const probe = await probeWorkspaceIntelligenceCliCapabilities({ forceRefresh: true });
    expect(probe.available).toBe(false);
    expect(probe.missingFeatures).toContain('workspace verify');
    expect(probe.missingFeatures).toContain('workspace context');
    expect(probe.missingFeatures).toContain('workspace impact');
  });

  it('treats an older CLI without the capability surface as unavailable', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: 'rapidkit 0.20.0\n',
      stderr: '',
      exitCode: 0,
    });

    const probe = await probeWorkspaceIntelligenceCliCapabilities({ forceRefresh: true });
    expect(probe.available).toBe(false);
    expect(probe.missingFeatures).toContain('workspace model');
    expect(probe.missingFeatures).toContain('workspace agent-sync');
  });

  it('treats a non-zero CLI exit as unavailable', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: '',
      stderr: 'command not found',
      exitCode: 1,
    });

    const probe = await probeWorkspaceIntelligenceCliCapabilities({ forceRefresh: true });
    expect(probe.available).toBe(false);
  });

  it('detects create-frontend, import, and adopt support from the command map', async () => {
    mockedRun.mockResolvedValue({
      stdout: commandsJson(),
      stderr: '',
      exitCode: 0,
    });

    await expect(probeCreateFrontendCliCapabilities({ forceRefresh: true })).resolves.toEqual({
      available: true,
    });
    await expect(probeImportCliCapabilities({ forceRefresh: true })).resolves.toEqual({
      available: true,
    });
    await expect(probeAdoptCliCapabilities({ forceRefresh: true })).resolves.toEqual({
      available: true,
    });
  });

  it('detects enterprise Studio root commands and workspace subcommands from commands --json', async () => {
    mockedRun.mockResolvedValue({
      stdout: commandsJson({
        workspaceSubcommands: [...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS, 'archive', 'graph'],
        projectScoped: ['test', 'build'],
        coreBacked: ['diff', 'rollback'],
      }),
      stderr: '',
      exitCode: 0,
    });

    await expect(probeTopLevelCliCapability('readiness', { forceRefresh: true })).resolves.toEqual({
      available: true,
    });
    await expect(
      probeWorkspaceSubcommandCliCapability('archive', { forceRefresh: true })
    ).resolves.toEqual({ available: true });
    await expect(probeProjectScopedCliCapability('test', { forceRefresh: true })).resolves.toEqual({
      available: true,
    });
    await expect(probeCoreBackedCliCapability('diff', { forceRefresh: true })).resolves.toEqual({
      available: true,
    });
    await expect(probeRootCliCapability('diff', { forceRefresh: true })).resolves.toEqual({
      available: true,
    });
  });

  it('reports create-frontend unavailable when the CLI omits the create command', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson({ commandMap: ['adopt', 'import', 'workspace'] }),
      stderr: '',
      exitCode: 0,
    });

    await expect(probeCreateFrontendCliCapabilities({ forceRefresh: true })).resolves.toEqual({
      available: false,
    });
  });
});

describe('rapidkitCliCapabilities gates', () => {
  beforeEach(() => {
    mockedRun.mockReset();
    clearRuntimeCommandSurfaceCache();
  });

  it('allows workspace intelligence when the CLI advertises the full chain', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson(),
      stderr: '',
      exitCode: 0,
    });

    await expect(gateWorkspaceIntelligenceCli('Intelligence Chain')).resolves.toBe(true);
  });

  it('allows create frontend when the CLI exposes the create command', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson(),
      stderr: '',
      exitCode: 0,
    });

    await expect(gateCreateFrontendCli('Create Frontend Project')).resolves.toBe(true);
  });

  it('allows import when the CLI exposes the import command', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson(),
      stderr: '',
      exitCode: 0,
    });

    await expect(gateImportCli('Import Project')).resolves.toBe(true);
  });

  it('allows Studio enterprise commands advertised by the runtime surface', async () => {
    mockedRun.mockResolvedValue({
      stdout: commandsJson({
        workspaceSubcommands: [...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS, 'archive', 'graph'],
        projectScoped: ['test'],
        coreBacked: ['diff'],
      }),
      stderr: '',
      exitCode: 0,
    });

    await expect(gateTopLevelRapidkitCli('Studio readiness', 'readiness')).resolves.toBe(true);
    await expect(gateWorkspaceSubcommandCli('Studio archive', 'archive')).resolves.toBe(true);
    await expect(gateProjectScopedRapidkitCli('Project Test', 'test')).resolves.toBe(true);
    await expect(gateCoreBackedRapidkitCli('Module Diff', 'diff')).resolves.toBe(true);
    await expect(gateRootRapidkitCli('Module Diff', 'diff')).resolves.toBe(true);
  });

  it('blocks workspace intelligence when required capabilities are missing', async () => {
    mockedRun.mockResolvedValueOnce({
      stdout: commandsJson({ intelligenceSubcommands: ['model'] }),
      stderr: '',
      exitCode: 0,
    });

    await expect(gateWorkspaceIntelligenceCli('Intelligence Chain')).resolves.toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Intelligence Chain is blocked'),
      'Open Setup'
    );
  });

  it('gates raw rapidkit args before enterprise evidence execution', async () => {
    mockedRun.mockResolvedValue({
      stdout: commandsJson({
        workspaceSubcommands: [...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS, 'contract'],
        projectScoped: ['test'],
        coreBacked: ['diff'],
      }),
      stderr: '',
      exitCode: 0,
    });

    await expect(
      gateRapidkitCliArgs({
        args: ['workspace', 'verify', '--json'],
        cwd: '/tmp/ws',
        featureLabel: 'Workspace Verify',
      })
    ).resolves.toEqual({ allowed: true });
    await expect(
      gateRapidkitCliArgs({
        args: ['agent', 'bootstrap', '--for-agent', 'generic', '--json'],
        cwd: '/tmp/ws',
        featureLabel: 'Project Agent Bootstrap',
      })
    ).resolves.toEqual({ allowed: true });
    await expect(
      gateRapidkitCliArgs({
        args: ['test'],
        cwd: '/tmp/ws',
        featureLabel: 'Project Test',
      })
    ).resolves.toEqual({ allowed: true });
    await expect(
      gateRapidkitCliArgs({
        args: ['diff', 'module', 'auth'],
        cwd: '/tmp/ws',
        featureLabel: 'Module Diff',
      })
    ).resolves.toEqual({ allowed: true });
  });

  it('allows Studio root commands when the CLI advertises them as top-level instead of core-backed', async () => {
    mockedRun.mockResolvedValue({
      stdout: commandsJson({
        commandMap: ['workspace', 'version'],
        coreBacked: [],
      }),
      stderr: '',
      exitCode: 0,
    });

    await expect(
      gateRapidkitCliArgs({
        args: ['version'],
        cwd: '/tmp/ws',
        featureLabel: 'Studio Version',
      })
    ).resolves.toEqual({ allowed: true });
  });

  it('allows trusted ecosystem remediation commands without RapidKit capability probing', async () => {
    await expect(
      gateIncidentStudioRapidkitCommand({
        command: 'cd "/tmp/ws/api" && dotnet restore',
        cwd: '/tmp/ws',
        featureLabel: 'Incident Studio command',
      })
    ).resolves.toEqual({ allowed: true });

    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('blocks raw rapidkit args when the runtime surface omits the command capability', async () => {
    mockedRun.mockResolvedValue({
      stdout: commandsJson({ commandMap: ['workspace'] }),
      stderr: '',
      exitCode: 0,
    });

    await expect(
      gateRapidkitCliArgs({
        args: ['readiness'],
        cwd: '/tmp/ws',
        featureLabel: 'Release Readiness',
      })
    ).resolves.toMatchObject({
      allowed: false,
      error: expect.stringContaining('does not advertise readiness'),
    });
  });
});

describe('workspace intelligence capability contract alignment', () => {
  it('pins the required intelligence chain to runtime-command-surface.v1', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const contractPath = path.join(repoRoot, 'contracts', 'runtime-command-surface.v1.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
      workspaceIntelligenceSubcommands: string[];
    };

    expect([...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS]).toEqual(
      contract.workspaceIntelligenceSubcommands
    );
  });
});
