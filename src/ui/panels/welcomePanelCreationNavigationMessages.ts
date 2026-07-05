import * as vscode from 'vscode';

import type { ScaffoldFramework } from '../../core/scaffoldKits';
import { recordRetentionMilestone } from '../../core/retentionMilestones';
import { asRecord } from './welcomePanel.shared.js';

export type WorkspaceProjectSummary = {
  path: string;
  name: string;
  type?: string;
};

export type CreationNavigationMessageHost = {
  context: vscode.ExtensionContext;
  postWebviewMessage: (command: string, data?: unknown) => void;
  openSetupTab: (context: vscode.ExtensionContext) => void;
  openDashboardTab: (context: vscode.ExtensionContext) => void;
  getSelectedWorkspacePath: () => string | undefined;
  getSelectedWorkspaceInfo: () => { name?: string; path?: string } | undefined;
  getSelectedProject: () => { path: string; name: string; type?: string } | null | undefined;
  listWorkspaceProjectsForWebview: (workspacePath: string) => Promise<WorkspaceProjectSummary[]>;
  updateWithProject: (
    projectPath: string,
    projectName: string,
    options?: { workspacePath?: string }
  ) => Promise<void>;
  syncAnalysisSelectionFromWebview: (data: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeMode?: 'project' | 'workspace';
  }) => Promise<void>;
};

const CREATION_NAVIGATION_WEBVIEW_COMMANDS = new Set([
  'createWorkspace',
  'openWorkspaceModal',
  'createFastAPIProject',
  'createNestJSProject',
  'createProjectWithKit',
  'openSetup',
  'openDashboardTab',
  'focusProjectExplorer',
  'requestWorkspaceProjects',
  'syncAnalysisSelection',
  'openCreateWithAITab',
  'openWorkspaceAdvisorTab',
  'openStudioSidebarTab',
  'openIncidentStudioTab',
]);

export function isCreationNavigationWebviewCommand(command: string): boolean {
  return CREATION_NAVIGATION_WEBVIEW_COMMANDS.has(command);
}

export async function tryDispatchCreationNavigationWebviewMessage(
  host: CreationNavigationMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isCreationNavigationWebviewCommand(command)) {
    return false;
  }

  const payload = asRecord(data);

  switch (command) {
    case 'createWorkspace':
      host.postWebviewMessage('setCreatingWorkspace', { isLoading: false });
      if (typeof payload?.name === 'string' && payload.name) {
        await vscode.commands.executeCommand('workspai.createWorkspace', data);
      } else {
        await vscode.commands.executeCommand('workspai.createWorkspace');
      }
      break;
    case 'openWorkspaceModal':
      host.postWebviewMessage('openWorkspaceModal');
      break;
    case 'createFastAPIProject':
      host.postWebviewMessage('closeProjectModal');
      if (typeof payload?.name === 'string' && payload.name) {
        await vscode.commands.executeCommand('workspai.createFastAPIProject', payload.name);
      } else {
        await vscode.commands.executeCommand('workspai.createFastAPIProject');
      }
      break;
    case 'createNestJSProject':
      host.postWebviewMessage('closeProjectModal');
      if (typeof payload?.name === 'string' && payload.name) {
        await vscode.commands.executeCommand('workspai.createNestJSProject', payload.name);
      } else {
        await vscode.commands.executeCommand('workspai.createNestJSProject');
      }
      break;
    case 'createProjectWithKit':
      if (
        typeof payload?.name === 'string' &&
        payload.name &&
        typeof payload?.framework === 'string' &&
        payload.framework &&
        typeof payload?.kit === 'string' &&
        payload.kit
      ) {
        console.log('[WelcomePanel] Creating project with kit:', payload);
        host.postWebviewMessage('closeProjectModal');
        const workspacePath = host.getSelectedWorkspacePath();
        const framework = payload.framework as ScaffoldFramework;
        const projectName = payload.name as string;
        const kitName = payload.kit as string;
        void (async () => {
          const { createProjectCommand } = await import('../../commands/createProject.js');
          await createProjectCommand(workspacePath, framework, projectName, kitName);
        })();
      }
      break;
    case 'openSetup':
      host.openSetupTab(host.context);
      break;
    case 'openDashboardTab':
      host.openDashboardTab(host.context);
      break;
    case 'focusProjectExplorer':
      await vscode.commands.executeCommand('rapidkitProjects.focus');
      break;
    case 'requestWorkspaceProjects': {
      const workspacePath =
        (typeof payload?.workspacePath === 'string' && payload.workspacePath) ||
        host.getSelectedWorkspacePath();
      if (!workspacePath) {
        break;
      }
      const projects = await host.listWorkspaceProjectsForWebview(workspacePath);
      if (projects.length === 1 && !host.getSelectedProject()?.path) {
        const sole = projects[0];
        await host.updateWithProject(sole.path, sole.name, { workspacePath });
      }
      host.postWebviewMessage('workspaceProjects', { workspacePath, projects });
      break;
    }
    case 'syncAnalysisSelection':
      await host.syncAnalysisSelectionFromWebview({
        workspacePath:
          typeof payload?.workspacePath === 'string' ? payload.workspacePath : undefined,
        projectPath: typeof payload?.projectPath === 'string' ? payload.projectPath : undefined,
        projectName: typeof payload?.projectName === 'string' ? payload.projectName : undefined,
        projectType: typeof payload?.projectType === 'string' ? payload.projectType : undefined,
        scopeMode:
          payload?.scopeMode === 'project' || payload?.scopeMode === 'workspace'
            ? payload.scopeMode
            : undefined,
      });
      break;
    case 'openCreateWithAITab':
      await vscode.commands.executeCommand('workspai.openCreateWithAI', {
        mode:
          payload?.mode === 'project' || payload?.mode === 'workspace' ? payload.mode : undefined,
        source: payload?.source,
        trigger: payload?.trigger,
        targetWorkspaceName: payload?.targetWorkspaceName,
        targetWorkspacePath: payload?.targetWorkspacePath,
        useDefaultWorkspace: payload?.useDefaultWorkspace === true,
      });
      break;
    case 'openWorkspaceAdvisorTab':
      await vscode.commands.executeCommand('workspai.openWorkspaceAdvisor', {
        workspace: {
          name: payload?.workspaceName,
          path: payload?.workspacePath,
        },
        project: {
          name: payload?.projectName,
          path: payload?.projectPath,
          type: payload?.projectType,
          workspacePath: payload?.workspacePath,
        },
        source: payload?.source,
        trigger: payload?.trigger,
        initialQuestion: payload?.initialQuestion || payload?.prefillQuestion,
      });
      break;
    case 'openStudioSidebarTab':
    case 'openIncidentStudioTab': {
      const selectedWorkspace = host.getSelectedWorkspaceInfo();
      const workspacePath =
        (typeof payload?.workspacePath === 'string' && payload.workspacePath) ||
        (typeof selectedWorkspace?.path === 'string' ? selectedWorkspace.path : undefined);

      if (!workspacePath) {
        vscode.window.showWarningMessage('Select or open a workspace first.');
        break;
      }

      const studioMode =
        payload?.studioMode === 'verify' || payload?.studioMode === 'prepare'
          ? payload.studioMode
          : 'investigate';
      const composerHandoff =
        payload?.composerHandoff === 'submit'
          ? 'submit'
          : payload?.composerHandoff === 'prefill'
            ? 'prefill'
            : undefined;

      await vscode.commands.executeCommand('workspai.openIncidentStudio', {
        workspace: {
          path: workspacePath,
          name:
            (typeof payload?.workspaceName === 'string' && payload.workspaceName) ||
            (typeof selectedWorkspace?.name === 'string' ? selectedWorkspace.name : undefined),
        },
        project:
          typeof payload?.projectPath === 'string'
            ? {
                path: payload.projectPath,
                name: typeof payload?.projectName === 'string' ? payload.projectName : undefined,
                type: typeof payload?.projectType === 'string' ? payload.projectType : undefined,
                workspacePath,
              }
            : undefined,
        initialTask: payload?.initialTask || payload?.initialQuery,
        initialQuery: payload?.initialQuery || payload?.initialTask,
        composerHandoff,
        studioMode,
        shipLoopIntent: payload?.shipLoopIntent === 'release' ? 'release' : undefined,
        source: typeof payload?.source === 'string' ? payload.source : 'dashboard',
        trigger:
          typeof payload?.trigger === 'string' ? payload.trigger : 'dashboard-studio-handoff',
      });
      void recordRetentionMilestone(host.context, 'studio_opened', {
        surface: 'studio',
      });
      break;
    }
  }

  return true;
}
