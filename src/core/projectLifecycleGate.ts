import * as vscode from 'vscode';
import {
  fetchProjectCommandCapabilities,
  resolveProjectLifecycleCommand,
} from './projectCommandCapabilities';

export async function gateProjectLifecycleCommand(
  projectPath: string,
  command: string,
  projectName: string
): Promise<boolean> {
  const resolution = await resolveProjectLifecycleCommand(projectPath, command);
  if (resolution.allowed) {
    return true;
  }

  const detail = resolution.reason;
  const inspect = 'Inspect Capabilities';
  const choice = await vscode.window.showErrorMessage(
    `Cannot run rapidkit ${command} for "${projectName}".\n\n${detail}`,
    inspect
  );

  if (choice === inspect) {
    const capabilities =
      resolution.capabilities ?? (await fetchProjectCommandCapabilities(projectPath));
    if (capabilities) {
      const channel = vscode.window.createOutputChannel('Workspai Project Capabilities');
      channel.clear();
      channel.appendLine(`Project: ${capabilities.projectRoot ?? projectPath}`);
      channel.appendLine(
        `Runtime: ${capabilities.runtime} | Framework: ${capabilities.frameworkDisplayName}`
      );
      channel.appendLine(`Module support: ${capabilities.moduleSupport ? 'yes' : 'no'}`);
      channel.appendLine('');
      channel.appendLine(`Supported: ${capabilities.supportedCommands.join(', ') || 'none'}`);
      channel.appendLine(`Unsupported: ${capabilities.unsupportedCommands.join(', ') || 'none'}`);
      channel.show(true);
    }
  }

  return false;
}

export async function gateModuleMutationCommand(
  projectPath: string,
  projectName: string
): Promise<boolean> {
  const capabilities = await fetchProjectCommandCapabilities(projectPath);
  if (!capabilities) {
    vscode.window.showErrorMessage(
      `Could not verify module support for "${projectName}". Ensure Workspai CLI is available and the project is managed.`
    );
    return false;
  }

  if (!capabilities.moduleSupport) {
    vscode.window.showErrorMessage(
      `RapidKit modules are not supported for ${capabilities.frameworkDisplayName} projects.`
    );
    return false;
  }

  const resolution = await resolveProjectLifecycleCommand(projectPath, 'add');
  if (!resolution.allowed) {
    vscode.window.showErrorMessage(`Cannot add modules to "${projectName}". ${resolution.reason}`);
    return false;
  }

  return true;
}
