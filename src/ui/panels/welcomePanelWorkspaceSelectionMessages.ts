import * as vscode from 'vscode';

import { CoreVersionService } from '../../core/coreVersionService';
import {
  handleIncidentStudioSetUiPreference,
  postIncidentStudioUiPreferences,
} from './incidentStudioTelemetryBridge';

export type ExampleWorkspaceDescriptor = {
  id?: string;
  name: string;
  title: string;
  cloneUrl?: string;
  path?: string;
};

export type WorkspaceSelectionMessageHost = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  getSelectedWorkspacePath: () => string | undefined;
  sendRecentWorkspaces: () => void | Promise<void>;
  cloneExample: (example: ExampleWorkspaceDescriptor) => Promise<void>;
  updateExample: (example: ExampleWorkspaceDescriptor) => Promise<void>;
  refreshDashboardForWorkspaceSelection: () => Promise<void>;
};

const WORKSPACE_SELECTION_COMMANDS = new Set([
  'refreshWorkspaces',
  'getUiPreferences',
  'setUiPreference',
  'cloneExample',
  'updateExample',
  'openWorkspaceFolder',
  'openWorkspaceInNewWindow',
  'revealWorkspaceFolder',
  'selectWorkspace',
  'removeWorkspace',
]);

export function isWorkspaceSelectionWebviewCommand(command: string): boolean {
  return WORKSPACE_SELECTION_COMMANDS.has(command);
}

export async function tryDispatchWorkspaceSelectionWebviewMessage(
  host: WorkspaceSelectionMessageHost,
  command: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!isWorkspaceSelectionWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'refreshWorkspaces':
      CoreVersionService.getInstance().clearCache();
      await host.sendRecentWorkspaces();
      return true;
    case 'getUiPreferences':
      postIncidentStudioUiPreferences(
        host.webview,
        host.context,
        typeof data?.workspacePath === 'string'
          ? data.workspacePath
          : host.getSelectedWorkspacePath()
      );
      return true;
    case 'setUiPreference':
      if (data?.key) {
        await handleIncidentStudioSetUiPreference(
          host.webview,
          host.context,
          String(data.key),
          data.value,
          {
            workspacePath: typeof data.workspacePath === 'string' ? data.workspacePath : undefined,
            resolveWorkspacePath: () => host.getSelectedWorkspacePath(),
          }
        );
      }
      return true;
    case 'cloneExample':
      if (data) {
        await host.cloneExample(data as ExampleWorkspaceDescriptor);
      }
      return true;
    case 'updateExample':
      if (data) {
        await host.updateExample(data as ExampleWorkspaceDescriptor);
      }
      return true;
    case 'openWorkspaceFolder':
      if (typeof data?.path === 'string') {
        await vscode.commands.executeCommand('workspai.openWorkspace', {
          path: data.path,
        });
      }
      return true;
    case 'openWorkspaceInNewWindow':
      if (typeof data?.path === 'string') {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(data.path), {
          forceNewWindow: true,
        });
      }
      return true;
    case 'revealWorkspaceFolder':
      if (typeof data?.path === 'string') {
        await vscode.commands.executeCommand('workspai.openWorkspaceFolder', {
          path: data.path,
        });
      }
      return true;
    case 'selectWorkspace':
      if (data) {
        await vscode.commands.executeCommand('workspai.selectWorkspace', data);
        await host.refreshDashboardForWorkspaceSelection();
      }
      return true;
    case 'removeWorkspace':
      if (data) {
        await vscode.commands.executeCommand('workspai.removeWorkspace', data);
      }
      return true;
    default:
      return false;
  }
}
