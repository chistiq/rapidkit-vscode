import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createdTerminals, createTerminalMock } = vi.hoisted(() => ({
  createdTerminals: [] as any[],
  createTerminalMock: vi.fn((options: { name: string; env?: Record<string, string> }) => {
    const terminal = {
      name: options.name,
      env: options.env,
      show: vi.fn(),
      sendText: vi.fn(),
    };
    createdTerminals.push(terminal);
    return terminal;
  }),
}));

vi.mock('vscode', () => ({
  window: {
    createTerminal: createTerminalMock,
  },
}));

import { resolveWorkspacePathForEvidenceTerminal } from '../core/evidenceTerminalTracker';
import { runRapidkitCommandsInTerminal } from '../utils/terminalExecutor';

describe('terminalExecutor evidence tracking', () => {
  beforeEach(() => {
    createdTerminals.length = 0;
    createTerminalMock.mockClear();
  });

  it('records workspace path for workspace evidence commands created through the executor', () => {
    const terminal = runRapidkitCommandsInTerminal({
      name: 'Workspai: Readiness — team-ws',
      cwd: '/workspaces/team-ws',
      commands: [['readiness', '--json']],
    });

    expect(terminal).toBe(createdTerminals[0]);
    expect(createdTerminals[0].env).toEqual({ RAPIDKIT_LOG_FORMAT: 'json' });
    expect(createdTerminals[0].sendText).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/workspaces/team-ws')
    );
    expect(resolveWorkspacePathForEvidenceTerminal(terminal)).toBe('/workspaces/team-ws');
  });

  it('does not record project-scoped doctor terminals as workspace evidence terminals', () => {
    const terminal = runRapidkitCommandsInTerminal({
      name: 'Workspai: Doctor - api',
      cwd: '/workspaces/team-ws/api',
      commands: [['doctor', 'project']],
    });

    expect(createdTerminals[0].env).toBeUndefined();
    expect(createdTerminals[0].sendText).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/workspaces/team-ws/api')
    );
    expect(resolveWorkspacePathForEvidenceTerminal(terminal)).toBeUndefined();
  });
});
