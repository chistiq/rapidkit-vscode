import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeCommandMock, showWarningMock, terminalMock, gateMock } = vi.hoisted(() => ({
  executeCommandMock: vi.fn(),
  showWarningMock: vi.fn(),
  terminalMock: vi.fn(),
  gateMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: executeCommandMock,
  },
  window: {
    showWarningMessage: showWarningMock,
  },
}));

vi.mock('../utils/terminalExecutor', () => ({
  runRapidkitCommandsInTerminal: terminalMock,
}));

vi.mock('../core/rapidkitEnterpriseCliGate', () => ({
  gateRapidkitCliArgs: gateMock,
}));

import { runGatedRapidkitCommandsInTerminal } from '../core/gatedRapidkitTerminal';

describe('runGatedRapidkitCommandsInTerminal', () => {
  beforeEach(() => {
    executeCommandMock.mockReset();
    showWarningMock.mockReset();
    terminalMock.mockReset();
    gateMock.mockReset();
    gateMock.mockResolvedValue({ allowed: true });
  });

  it('runs terminal commands after every RapidKit command passes the enterprise gate', async () => {
    const ran = await runGatedRapidkitCommandsInTerminal({
      name: 'Workspace Verify',
      cwd: '/tmp/ws',
      commands: [['workspace', 'verify', '--json']],
    });

    expect(ran).toBe(true);
    expect(gateMock).toHaveBeenCalledWith({
      args: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      featureLabel: 'Workspace Verify',
    });
    expect(terminalMock).toHaveBeenCalledWith({
      name: 'Workspace Verify',
      cwd: '/tmp/ws',
      commands: [['workspace', 'verify', '--json']],
    });
  });

  it('blocks terminal execution and offers setup recovery when the enterprise gate fails', async () => {
    gateMock.mockResolvedValueOnce({
      allowed: false,
      error: 'Workspace Verify is blocked.',
    });
    showWarningMock.mockResolvedValueOnce('Open Setup');

    const ran = await runGatedRapidkitCommandsInTerminal({
      name: 'Workspace Verify',
      cwd: '/tmp/ws',
      commands: [['workspace', 'verify', '--json']],
    });

    expect(ran).toBe(false);
    expect(terminalMock).not.toHaveBeenCalled();
    expect(showWarningMock).toHaveBeenCalledWith('Workspace Verify is blocked.', 'Open Setup');
    expect(executeCommandMock).toHaveBeenCalledWith('workspai.openSetup');
  });
});
