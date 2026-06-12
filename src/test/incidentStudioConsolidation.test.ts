import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

const { createOrShowMock, showWarningMessageMock, showErrorMessageMock } = vi.hoisted(() => ({
  createOrShowMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
  },
}));

vi.mock('../ui/panels/incidentStudioPanel', () => ({
  IncidentStudioPanel: {
    createOrShow: createOrShowMock,
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
  it('routes incidentStudioNext to canonical IncidentStudioPanel path', async () => {
    createOrShowMock.mockReset();
    showWarningMessageMock.mockReset();
    showErrorMessageMock.mockReset();

    await showIncidentStudioNextCommand({} as import('vscode').ExtensionContext, {
      getSelectedWorkspace: () => ({ path: '/tmp/demo-ws', name: 'demo-ws' }),
    });

    expect(createOrShowMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspacePath: '/tmp/demo-ws',
        workspaceName: 'demo-ws',
      })
    );
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('asks for workspace selection when no workspace is selected', async () => {
    createOrShowMock.mockReset();
    showWarningMessageMock.mockReset();
    showErrorMessageMock.mockReset();

    await showIncidentStudioNextCommand({} as import('vscode').ExtensionContext, {
      getSelectedWorkspace: () => null,
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith('Select a workspace first.');
    expect(createOrShowMock).not.toHaveBeenCalled();
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });
});

describe('studio feature flags', () => {
  it('defaults to vNext for the production Studio path', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../webview-ui/src/lib/studioFeatureFlags.ts'),
      'utf8'
    );
    expect(source).toContain("return 'vnext'");
    expect(source).not.toMatch(/\/\/[^\n]*return 'legacy'/);
  });
});
