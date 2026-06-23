import { describe, expect, it, vi } from 'vitest';

const { executeCommandMock, openIncidentStudioMock, showWarningMessageMock, showErrorMessageMock } =
  vi.hoisted(() => ({
    executeCommandMock: vi.fn(),
    openIncidentStudioMock: vi.fn(),
    showWarningMessageMock: vi.fn(),
    showErrorMessageMock: vi.fn(),
  }));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: executeCommandMock,
  },
  window: {
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
  },
}));

vi.mock('../ui/panels/welcomePanel', () => ({
  WelcomePanel: {
    openIncidentStudio: openIncidentStudioMock,
  },
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { showIncidentStudioNextCommand } from '../commands/incidentStudioNext';

describe('incident studio consolidation', () => {
  it('routes incidentStudioNext to the Workspai sidebar Studio command', async () => {
    executeCommandMock.mockReset();
    openIncidentStudioMock.mockReset();
    showWarningMessageMock.mockReset();
    showErrorMessageMock.mockReset();

    await showIncidentStudioNextCommand({} as import('vscode').ExtensionContext, {
      getSelectedWorkspace: () => ({ path: '/tmp/demo-ws', name: 'demo-ws' }),
    });

    expect(executeCommandMock).toHaveBeenCalledWith(
      'workspai.openIncidentStudio',
      expect.objectContaining({
        workspacePath: '/tmp/demo-ws',
        workspaceName: 'demo-ws',
      })
    );
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('asks for workspace selection when no workspace is selected', async () => {
    openIncidentStudioMock.mockReset();
    executeCommandMock.mockReset();
    showWarningMessageMock.mockReset();
    showErrorMessageMock.mockReset();

    await showIncidentStudioNextCommand({} as import('vscode').ExtensionContext, {
      getSelectedWorkspace: () => null,
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith('Select a workspace first.');
    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(openIncidentStudioMock).not.toHaveBeenCalled();
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });
});
