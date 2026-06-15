/**
 * Incident Studio (Next) Command — consolidated to canonical main studio path.
 * The separate preview panel is deprecated; this command opens production Incident Studio.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { WelcomePanel } from '../ui/panels/welcomePanel';

interface WorkspaceExplorerLike {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
}

interface ProjectExplorerLike {
  getSelectedProject?: () => { path?: string; name?: string; type?: string } | null | undefined;
}

export async function showIncidentStudioNextCommand(
  context: vscode.ExtensionContext,
  workspaceExplorer?: WorkspaceExplorerLike,
  projectExplorer?: ProjectExplorerLike
) {
  const logger = Logger.getInstance();
  logger.info('Incident Studio command initiated (canonical main studio path)');

  try {
    const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();
    const workspacePath = selectedWorkspace?.path;
    if (!workspacePath) {
      vscode.window.showWarningMessage('Select a workspace first.');
      return;
    }

    const selectedProject = projectExplorer?.getSelectedProject?.();

    WelcomePanel.openIncidentStudio(context, {
      workspacePath,
      workspaceName: selectedWorkspace?.name || path.basename(workspacePath),
      projectPath: selectedProject?.path,
      projectName: selectedProject?.name,
      projectType: selectedProject?.type,
    });
  } catch (error) {
    logger.error('Error in showIncidentStudioNextCommand', error);
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
