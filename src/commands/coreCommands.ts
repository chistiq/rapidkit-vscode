import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { createWorkspaceCommand } from './createWorkspace';
import { createProjectCommand } from './createProject';
import { importProjectCommand } from './importProject';
import { addModuleCommand } from './addModule';
import { previewTemplateCommand } from './previewTemplate';
import { doctorCommand } from './doctor';
import { checkSystemCommand } from './checkSystem';
import { showWelcomeCommand } from './showWelcome';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { SetupPanel } from '../ui/panels/setupExperiencePanel';
import type { ModuleData } from '../data/modules';

type WorkspaceLike = { path: string; name?: string };
type ProjectLike = { path: string; name: string; type: string; workspacePath?: string };

type WorkspaceExplorerLike = {
  refresh: () => void;
  getSelectedWorkspace: () => WorkspaceLike | null | undefined;
};

type ProjectExplorerLike = {
  refresh: () => void;
  getSelectedProject?: () => ProjectLike | null | undefined;
};

type ArchitectureCommandItem = {
  project?: {
    path?: unknown;
    name?: unknown;
    type?: unknown;
    workspacePath?: unknown;
  };
  workspace?: {
    path?: unknown;
    name?: unknown;
  };
};

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeWorkspaceInput(value: unknown): string | Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asArchitectureCommandItem(item: unknown): ArchitectureCommandItem | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  return item as ArchitectureCommandItem;
}

function isModuleDataLike(value: unknown): value is ModuleData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    (typeof record.name === 'string' || typeof record.display_name === 'string')
  );
}

export function registerCoreCommands(options: {
  context: vscode.ExtensionContext;
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
}): vscode.Disposable[] {
  const { context, logger, getWorkspaceExplorer, getProjectExplorer } = options;

  return [
    vscode.commands.registerCommand('workspai.test', () => {
      vscode.window.showInformationMessage('✅ Workspai commands are working!');
    }),

    vscode.commands.registerCommand(
      'workspai.createWorkspace',
      async (workspaceInput?: string | Record<string, unknown>) => {
        try {
          logger.info(
            'Executing createWorkspace command',
            workspaceInput ? `with input: ${JSON.stringify(workspaceInput)}` : ''
          );
          await createWorkspaceCommand(normalizeWorkspaceInput(workspaceInput));
          getWorkspaceExplorer()?.refresh();
        } catch (error) {
          logger.error('Failed to create workspace', error);
          vscode.window.showErrorMessage(
            `Failed to create workspace: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'workspai.createProject',
      async (workspacePathOrUri?: string | vscode.Uri) => {
        try {
          logger.info('Executing createProject command');
          const workspaceExplorer = getWorkspaceExplorer();
          if (!workspaceExplorer) {
            vscode.window.showErrorMessage('Extension not fully initialized');
            return;
          }

          let workspacePath: string | undefined;
          if (typeof workspacePathOrUri === 'string') {
            workspacePath = workspacePathOrUri;
          } else if (workspacePathOrUri instanceof vscode.Uri) {
            workspacePath = workspacePathOrUri.fsPath;
          }

          if (!workspacePath) {
            const selectedWorkspace = workspaceExplorer.getSelectedWorkspace();
            workspacePath = selectedWorkspace?.path;
          }

          await createProjectCommand(workspacePath);
          getProjectExplorer()?.refresh();
        } catch (error) {
          logger.error('Failed to create project', error);
          vscode.window.showErrorMessage(
            `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand('workspai.importProject', async (seed?: unknown) => {
      try {
        logger.info('Executing importProject command');
        await importProjectCommand(
          {
            getWorkspaceExplorer,
            getProjectExplorer,
          },
          seed
        );
      } catch (error) {
        logger.error('Failed to import project', error);
        vscode.window.showErrorMessage(
          `Failed to import project: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }),

    vscode.commands.registerCommand('workspai.openArchitectureMap', async (item?: unknown) => {
      const selectedProject = getProjectExplorer()?.getSelectedProject?.();
      const selectedWorkspace = getWorkspaceExplorer()?.getSelectedWorkspace();

      const itemPayload = asArchitectureCommandItem(item);

      const projectFromItem = itemPayload?.project;
      const workspaceFromItem = itemPayload?.workspace;

      const projectName = toNonEmptyString(projectFromItem?.name) || selectedProject?.name;
      const projectPath = toNonEmptyString(projectFromItem?.path) || selectedProject?.path;
      const projectType = toNonEmptyString(projectFromItem?.type) || selectedProject?.type;

      const workspacePath =
        toNonEmptyString(workspaceFromItem?.path) ||
        toNonEmptyString(projectFromItem?.workspacePath) ||
        selectedWorkspace?.path;
      const workspaceName = toNonEmptyString(workspaceFromItem?.name) || selectedWorkspace?.name;

      if (!workspacePath) {
        vscode.window.showWarningMessage('Select a workspace first.');
        return;
      }

      if (projectPath && projectName) {
        await vscode.commands.executeCommand('workspai.openIncidentStudio', {
          workspacePath,
          workspaceName,
          projectPath,
          projectName,
          projectType,
          preferredDisplayMode: 'full',
          preferredArchitectureLensView: 'tree',
          initialQuery:
            `Build an architecture map for project ${projectName}. ` +
            'Start with the tree view, then expand to dependency graph and runtime flow, highlighting top production risks and verify-safe next actions.',
        });
        return;
      }

      await vscode.commands.executeCommand('workspai.openIncidentStudio', {
        workspacePath,
        workspaceName: workspaceName ?? 'Workspace',
        preferredDisplayMode: 'full',
        preferredArchitectureLensView: 'tree',
        initialQuery:
          'Build a workspace-level architecture map. Start with the tree view, then highlight project boundaries, dependencies, runtime flows, top risks, and safe verification paths.',
      });
    }),

    vscode.commands.registerCommand(
      'workspai.createFastAPIProject',
      async (projectName?: string) => {
        try {
          logger.info('Executing createFastAPIProject command', { projectName });
          const workspaceExplorer = getWorkspaceExplorer();
          if (!workspaceExplorer) {
            vscode.window.showErrorMessage('Extension not fully initialized');
            return;
          }

          const selectedWorkspace = workspaceExplorer.getSelectedWorkspace();
          await createProjectCommand(selectedWorkspace?.path, 'fastapi', projectName);
          getProjectExplorer()?.refresh();
        } catch (error) {
          logger.error('Failed to create FastAPI project', error);
          vscode.window.showErrorMessage(
            `Failed to create FastAPI project: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'workspai.createNestJSProject',
      async (projectName?: string) => {
        try {
          logger.info('Executing createNestJSProject command', { projectName });
          const workspaceExplorer = getWorkspaceExplorer();
          if (!workspaceExplorer) {
            vscode.window.showErrorMessage('Extension not fully initialized');
            return;
          }

          const selectedWorkspace = workspaceExplorer.getSelectedWorkspace();
          await createProjectCommand(selectedWorkspace?.path, 'nestjs', projectName);
          getProjectExplorer()?.refresh();
        } catch (error) {
          logger.error('Failed to create NestJS project', error);
          vscode.window.showErrorMessage(
            `Failed to create NestJS project: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'workspai.createSpringBootProject',
      async (projectName?: string) => {
        try {
          logger.info('Executing createSpringBootProject command', { projectName });
          const workspaceExplorer = getWorkspaceExplorer();
          if (!workspaceExplorer) {
            vscode.window.showErrorMessage('Extension not fully initialized');
            return;
          }

          const selectedWorkspace = workspaceExplorer.getSelectedWorkspace();
          await createProjectCommand(selectedWorkspace?.path, 'springboot', projectName);
          getProjectExplorer()?.refresh();
        } catch (error) {
          logger.error('Failed to create Spring Boot project', error);
          vscode.window.showErrorMessage(
            `Failed to create Spring Boot project: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand('workspai.openDocs', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.dev/learn'));
    }),

    vscode.commands.registerCommand('workspai.addModule', addModuleCommand),
    vscode.commands.registerCommand('workspai.showModuleInstallModal', (moduleData: unknown) => {
      if (!isModuleDataLike(moduleData)) {
        vscode.window.showWarningMessage('Invalid module payload for install modal.');
        return;
      }
      WelcomePanel.showModuleInstallModal(moduleData);
    }),
    vscode.commands.registerCommand('workspai.previewTemplate', previewTemplateCommand),
    vscode.commands.registerCommand('workspai.doctor', doctorCommand),
    vscode.commands.registerCommand('workspai.checkSystem', checkSystemCommand),

    vscode.commands.registerCommand('workspai.clearRequirementCache', async () => {
      try {
        const { requirementCache } = await import('../utils/requirementCache.js');
        requirementCache.invalidateAll();
        logger.info('Requirement cache cleared (Python & Poetry)');
        vscode.window.showInformationMessage(
          '✅ Cache Cleared\n\nPython and Poetry checks will be performed fresh on next workspace creation.'
        );
      } catch (error) {
        logger.error('Failed to clear cache', error);
        vscode.window.showErrorMessage('Failed to clear cache');
      }
    }),

    vscode.commands.registerCommand('workspai.showWelcome', () => showWelcomeCommand(context)),

    vscode.commands.registerCommand(
      'workspai.openProjectModal',
      (framework: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet') => {
        WelcomePanel.openProjectModal(context, framework);
      }
    ),

    vscode.commands.registerCommand('workspai.openWorkspaceModal', () => {
      WelcomePanel.openWorkspaceModal(context);
    }),

    vscode.commands.registerCommand('workspai.openSetup', () => SetupPanel.show(context)),
  ];
}
