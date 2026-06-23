import { describe, expect, it, vi } from 'vitest';

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

import {
  buildWorkspaceImpactLensCommands,
  buildWorkspaceIntelligenceChainCommands,
} from '../core/workspaceIntelligenceRuntime';

describe('workspaceIntelligenceRuntime', () => {
  it('builds canonical npm intelligence chain commands including verify', () => {
    expect(buildWorkspaceIntelligenceChainCommands()).toEqual([
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
    ]);
  });

  it('builds workspace advisor commands without agent context', () => {
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

  it('scopes workspace advisor commands to a project when requested', () => {
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
