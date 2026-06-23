import * as vscode from 'vscode';

import { registerManagedWorkspacePath } from './ensureManagedDefaultWorkspace';
import { invalidateAndRefreshProjectCapabilities } from './projectCapabilityContext';

export async function refreshExtensionAfterNpmProjectOnboard(input: {
  workspacePath: string;
  projectPath: string;
  projectName: string;
  projectType?: string;
}): Promise<void> {
  await registerManagedWorkspacePath(input.workspacePath);
  await vscode.commands.executeCommand('workspai.selectWorkspace', input.workspacePath);
  await vscode.commands.executeCommand('workspai.refreshWorkspaces');
  await vscode.commands.executeCommand('workspai.refreshProjects');

  await invalidateAndRefreshProjectCapabilities({
    projectPath: input.projectPath,
    projectType: input.projectType,
  });

  const { WelcomePanel } = await import('../ui/panels/welcomePanel.js');
  await WelcomePanel.refreshWorkspaceStatus({ forceCapabilityRefresh: true });

  const extensionContext = (globalThis as { extensionContext?: vscode.ExtensionContext })
    .extensionContext;
  await WelcomePanel.notifyProjectOnboarded(
    {
      workspacePath: input.workspacePath,
      workspaceName: input.workspacePath.split(/[\\/]/).pop() ?? input.workspacePath,
      projectPath: input.projectPath,
      projectName: input.projectName,
      triggeredBy: 'add',
    },
    extensionContext
  );
}
