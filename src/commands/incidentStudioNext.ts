/**
 * Studio command — redirects to the canonical Workspai sidebar Studio tab.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

interface WorkspaceExplorerLike {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
}

interface ProjectExplorerLike {
  getSelectedProject?: () => { path?: string; name?: string; type?: string } | null | undefined;
}

export async function showIncidentStudioNextCommand(
  _context: vscode.ExtensionContext,
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

    await vscode.commands.executeCommand('workspai.openIncidentStudio', {
      workspacePath,
      workspaceName: selectedWorkspace?.name,
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
