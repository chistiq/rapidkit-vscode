import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registeredCommands,
  importProjectCommandMock,
  executeCommandMock,
  openIncidentStudioMock,
  showErrorMessageMock,
} = vi.hoisted(() => ({
  registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
  importProjectCommandMock: vi.fn(),
  executeCommandMock: vi.fn(),
  openIncidentStudioMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    },
    executeCommand: executeCommandMock,
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: showErrorMessageMock,
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: (value: string) => ({ toString: () => value }),
    file: (targetPath: string) => ({ fsPath: targetPath }),
  },
}));

vi.mock('../commands/createWorkspace', () => ({
  createWorkspaceCommand: vi.fn(),
}));

vi.mock('../commands/createProject', () => ({
  createProjectCommand: vi.fn(),
}));

vi.mock('../commands/importProject', () => ({
  importProjectCommand: importProjectCommandMock,
}));

vi.mock('../commands/addModule', () => ({
  addModuleCommand: vi.fn(),
}));

vi.mock('../commands/previewTemplate', () => ({
  previewTemplateCommand: vi.fn(),
}));

vi.mock('../commands/doctor', () => ({
  doctorCommand: vi.fn(),
}));

vi.mock('../commands/checkSystem', () => ({
  checkSystemCommand: vi.fn(),
}));

vi.mock('../commands/showWelcome', () => ({
  showWelcomeCommand: vi.fn(),
}));

vi.mock('../ui/panels/welcomePanel', () => ({
  WelcomePanel: {
    showModuleInstallModal: vi.fn(),
    openProjectModal: vi.fn(),
    openWorkspaceModal: vi.fn(),
    openIncidentStudio: openIncidentStudioMock,
    showAIModal: vi.fn(),
  },
}));

vi.mock('../ui/panels/setupExperiencePanel', () => ({
  SetupPanel: {
    show: vi.fn(),
  },
}));

import { registerCoreCommands } from '../commands/coreCommands';

describe('coreCommands importProject seed forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredCommands.clear();
  });

  it('forwards drag-drop seed payload to importProjectCommand', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as any;

    const getWorkspaceExplorer = () => ({
      refresh: vi.fn(),
      getSelectedWorkspace: () => ({ path: '/tmp/ws', name: 'ws' }),
    });

    const getProjectExplorer = () => ({
      refresh: vi.fn(),
      getSelectedProject: () => null,
    });

    registerCoreCommands({
      context: {} as any,
      logger,
      getWorkspaceExplorer,
      getProjectExplorer,
    });

    const handler = registeredCommands.get('workspai.importProject');
    expect(handler).toBeTypeOf('function');

    const seed = {
      source: 'drag-drop',
      droppedPaths: ['/tmp/a', '/tmp/b'],
    };

    await handler?.(seed);

    expect(importProjectCommandMock).toHaveBeenCalledTimes(1);
    expect(importProjectCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        getWorkspaceExplorer: expect.any(Function),
        getProjectExplorer: expect.any(Function),
      }),
      seed
    );
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('routes architecture map into full Incident Studio with graph preferences', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as any;

    const getWorkspaceExplorer = () => ({
      refresh: vi.fn(),
      getSelectedWorkspace: () => ({ path: '/tmp/ws', name: 'Workspace Alpha' }),
    });

    const getProjectExplorer = () => ({
      refresh: vi.fn(),
      getSelectedProject: () => ({
        path: '/tmp/ws/orders-api',
        name: 'orders-api',
        type: 'nestjs',
      }),
    });

    registerCoreCommands({
      context: {} as any,
      logger,
      getWorkspaceExplorer,
      getProjectExplorer,
    });

    const handler = registeredCommands.get('workspai.openArchitectureMap');
    expect(handler).toBeTypeOf('function');

    await handler?.();

    expect(executeCommandMock).toHaveBeenCalledWith(
      'workspai.openIncidentStudio',
      expect.objectContaining({
        workspacePath: '/tmp/ws',
        workspaceName: 'Workspace Alpha',
        projectPath: '/tmp/ws/orders-api',
        projectName: 'orders-api',
        projectType: 'nestjs',
        preferredDisplayMode: 'full',
        preferredArchitectureLensView: 'tree',
      })
    );
  });
});
