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
  resolveWorkspaceIntelligencePhase4Available,
} from '../core/workspaceIntelligenceRuntime';

const mockedFetchSurface = vi.mocked(fetchRuntimeCommandSurface);

describe('workspaceIntelligenceRuntime', () => {
  beforeEach(() => {
    mockedFetchSurface.mockReset();
  });

  it('builds canonical core intelligence chain commands through explain', () => {
    expect(buildWorkspaceIntelligenceCoreChainCommands()).toEqual([
      ['workspace', 'model', '--json', '--write'],
      ['workspace', 'snapshot', '--json'],
      ['workspace', 'diff', '--from', '.rapidkit/reports/workspace-model-snapshot.json', '--json'],
      [
        'workspace',
        'impact',
        '--from',
        '.rapidkit/reports/workspace-model-diff-last-run.json',
        '--json',
      ],
      [
        'workspace',
        'verify',
        '--from-impact',
        '.rapidkit/reports/workspace-impact-last-run.json',
        '--json',
      ],
      ['workspace', 'context', '--for-agent', '--json', '--write'],
      [
        'workspace',
        'agent-sync',
        '--write',
        '--refresh-context',
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
    const coreSubcommands = buildWorkspaceIntelligenceCoreChainCommands().map(
      ([, subcommand]) => subcommand
    );

    for (const subcommand of coreSubcommands) {
      expect(
        REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS as readonly string[],
        subcommand
      ).toContain(subcommand);
    }
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
      ['workspace', 'diff', '--from', '.rapidkit/reports/workspace-model-snapshot.json', '--json'],
      [
        'workspace',
        'impact',
        '--from',
        '.rapidkit/reports/workspace-model-diff-last-run.json',
        '--json',
      ],
    ]);
  });

  it('scopes workspace advisor commands to a project when requested', async () => {
    const { buildWorkspaceImpactLensCommands } =
      await import('../core/workspaceIntelligenceRuntime');
    expect(buildWorkspaceImpactLensCommands('project:web')).toEqual([
      ['workspace', 'snapshot', '--json'],
      ['workspace', 'diff', '--from', '.rapidkit/reports/workspace-model-snapshot.json', '--json'],
      [
        'workspace',
        'impact',
        '--from',
        '.rapidkit/reports/workspace-model-diff-last-run.json',
        '--json',
        '--scope',
        'project:web',
      ],
    ]);
  });
});
