import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
      name: 'Workspai: Intelligence Chain (auto) — ws-a',
    })),
  },
}));

vi.mock('../utils/terminalExecutor', () => ({
  runRapidkitCommandsInTerminal: vi.fn(() => ({
    show: vi.fn(),
    sendText: vi.fn(),
    name: 'Workspai: Intelligence Chain (auto) — ws-a',
  })),
}));

vi.mock('../core/runtimeCommandSurface', () => ({
  fetchRuntimeCommandSurface: vi.fn(),
}));

import { REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS } from '../core/rapidkitCliCapabilities';
import { fetchRuntimeCommandSurface } from '../core/runtimeCommandSurface';
import {
  buildWorkspaceIntelligenceChainCommands,
  buildWorkspaceIntelligenceCoreChainCommands,
  buildWorkspaceIntelligencePhase4ChainCommands,
  buildWorkspaceIntelligenceUnifiedRunnerCommand,
  resolveWorkspaceIntelligencePhase4Available,
  toWorkspaceIntelligenceSequenceSteps,
} from '../core/workspaceIntelligenceRuntime';

const mockedFetchSurface = vi.mocked(fetchRuntimeCommandSurface);

describe('workspaceIntelligenceRuntime', () => {
  beforeEach(() => {
    mockedFetchSurface.mockReset();
  });

  it('uses the authoritative unified runner for the extension intelligence action', () => {
    expect(buildWorkspaceIntelligenceUnifiedRunnerCommand()).toEqual([
      'workspace',
      'intelligence',
      'run',
      '--for-agent',
      'vscode',
      '--json',
    ]);
  });

  it('builds canonical core intelligence chain commands through explain', () => {
    expect(buildWorkspaceIntelligenceCoreChainCommands()).toEqual([
      ['workspace', 'model', '--json', '--write'],
      ['workspace', 'diff', '--from', '.workspai/reports/workspace-model-snapshot.json', '--json'],
      [
        'workspace',
        'impact',
        '--from',
        '.workspai/reports/workspace-model-diff-last-run.json',
        '--json',
      ],
      ['doctor', 'workspace', '--json'],
      ['workspace', 'contract', 'verify', '--strict', '--json'],
      ['analyze', '--json'],
      ['readiness', '--json', '--skip-verify'],
      [
        'workspace',
        'verify',
        '--from-impact',
        '.workspai/reports/workspace-impact-last-run.json',
        '--json',
      ],
      ['workspace', 'context', '--for-agent', '--json', '--write', '--no-agent-sync'],
      [
        'workspace',
        'agent-sync',
        '--write',
        '--json',
        '--preset',
        'enterprise',
        '--target',
        'vscode',
      ],
      ['workspace', 'explain', 'release-blocked', '--json', '--write'],
    ]);
  });

  it('keeps core chain steps within the CLI intelligence capability gate', () => {
    const intelligenceCommands = buildWorkspaceIntelligenceCoreChainCommands().filter(
      ([command, subcommand]) =>
        command === 'workspace' &&
        ['model', 'diff', 'impact', 'verify', 'context', 'agent-sync', 'explain'].includes(
          subcommand
        )
    );

    for (const [, subcommand] of intelligenceCommands) {
      expect(
        REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS as readonly string[],
        subcommand
      ).toContain(subcommand);
    }
  });

  it('refreshes verification evidence after impact and before the definitive gate', () => {
    const commands = buildWorkspaceIntelligenceCoreChainCommands();
    const impactIndex = commands.findIndex(
      ([command, subcommand]) => command === 'workspace' && subcommand === 'impact'
    );
    const verifyIndex = commands.findIndex(
      ([command, subcommand]) => command === 'workspace' && subcommand === 'verify'
    );

    expect(commands.slice(impactIndex + 1, verifyIndex)).toEqual([
      ['doctor', 'workspace', '--json'],
      ['workspace', 'contract', 'verify', '--strict', '--json'],
      ['analyze', '--json'],
      ['readiness', '--json', '--skip-verify'],
    ]);
  });

  it('appends Phase 4 why/trace only when explicitly requested', () => {
    expect(buildWorkspaceIntelligenceChainCommands()).toEqual(
      buildWorkspaceIntelligenceCoreChainCommands()
    );
    expect(buildWorkspaceIntelligenceChainCommands({ includePhase4: true })).toEqual([
      ...buildWorkspaceIntelligenceCoreChainCommands(),
      ...buildWorkspaceIntelligencePhase4ChainCommands(),
    ]);
  });

  it('derives canonical labels and verdict policies by command identity, not array position', () => {
    expect(
      toWorkspaceIntelligenceSequenceSteps([
        ['analyze', '--strict', '--json'],
        ['workspace', 'why', 'release-blocked', '--json', '--write'],
        ['workspace', 'diff', '--from', 'custom-snapshot.json', '--json'],
      ])
    ).toEqual([
      {
        command: ['analyze', '--strict', '--json'],
        label: 'Analyze Evidence',
        exitPolicy: 'continue-on-structured-verdict',
      },
      {
        command: ['workspace', 'why', 'release-blocked', '--json', '--write'],
        label: 'Why',
      },
      {
        command: ['workspace', 'diff', '--from', 'custom-snapshot.json', '--json'],
        label: 'Diff',
        exitPolicy: 'stop-on-error',
      },
    ]);
  });

  it('detects Phase 4 availability from workspace subcommands surface', async () => {
    mockedFetchSurface.mockResolvedValueOnce({
      schemaVersion: 'rapidkit-command-capabilities-v1',
      cli: 'rapidkit-npm',
      version: '0.39.0',
      contracts: {},
      topLevelCommands: ['workspace'],
      workspaceSubcommands: ['model', 'why', 'trace'],
      workspaceIntelligenceSubcommands: [...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS],
    });

    await expect(resolveWorkspaceIntelligencePhase4Available('/tmp/ws')).resolves.toBe(true);

    mockedFetchSurface.mockResolvedValueOnce({
      schemaVersion: 'rapidkit-command-capabilities-v1',
      cli: 'rapidkit-npm',
      version: '0.39.0',
      contracts: {},
      topLevelCommands: ['workspace'],
      workspaceSubcommands: ['model', 'explain'],
      workspaceIntelligenceSubcommands: [...REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS],
    });

    await expect(resolveWorkspaceIntelligencePhase4Available('/tmp/ws')).resolves.toBe(false);
  });

  it('builds workspace advisor commands without agent context', async () => {
    const { buildWorkspaceImpactLensCommands } =
      await import('../core/workspaceIntelligenceRuntime');
    expect(buildWorkspaceImpactLensCommands()).toEqual([
      ['workspace', 'snapshot', '--json'],
      ['workspace', 'diff', '--from', '.workspai/reports/workspace-model-snapshot.json', '--json'],
      [
        'workspace',
        'impact',
        '--from',
        '.workspai/reports/workspace-model-diff-last-run.json',
        '--json',
      ],
    ]);
  });

  it('scopes workspace advisor commands to a project when requested', async () => {
    const { buildWorkspaceImpactLensCommands } =
      await import('../core/workspaceIntelligenceRuntime');
    expect(buildWorkspaceImpactLensCommands('project:web')).toEqual([
      ['workspace', 'snapshot', '--json'],
      ['workspace', 'diff', '--from', '.workspai/reports/workspace-model-snapshot.json', '--json'],
      [
        'workspace',
        'impact',
        '--from',
        '.workspai/reports/workspace-model-diff-last-run.json',
        '--json',
        '--scope',
        'project:web',
      ],
    ]);
  });
});
