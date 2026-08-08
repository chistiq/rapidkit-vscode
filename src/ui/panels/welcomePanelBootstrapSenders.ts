import type * as vscode from 'vscode';

import {
  postIncidentStudioTelemetry,
  postIncidentStudioUiPreferences,
} from './incidentStudioTelemetryBridge';
import { readIncidentStudioUiPreferences } from './incidentStudioUiPreferencesBridge';
import type { BootstrapPayloadHost } from './welcomePanelBootstrapPayload';
import {
  sendExampleWorkspaces,
  sendRecentWorkspacesPayload,
  sendWorkspaceStatus,
  sendWorkspaceToolStatus,
} from './welcomePanelBootstrapPayload';
import {
  refreshModulesCatalog,
  sendAvailableKits,
  type ModulesCatalogHost,
} from './welcomePanelModulesCatalog';
import { buildRecentWorkspaces, type RecentWorkspacesHost } from './welcomePanelRecentWorkspaces';
import { buildWorkspaiSettingsPayload } from './welcomePanelWorkspaiSettingsMessages';

export async function getWelcomePanelRecentWorkspaces(recentWorkspacesHost: RecentWorkspacesHost) {
  return buildRecentWorkspaces(recentWorkspacesHost);
}

export async function sendWelcomePanelRecentWorkspaces(
  bootstrapHost: BootstrapPayloadHost
): Promise<void> {
  await sendRecentWorkspacesPayload(bootstrapHost);
}

export async function sendWelcomePanelExampleWorkspaces(
  bootstrapHost: BootstrapPayloadHost,
  options?: { forceRefresh?: boolean }
): Promise<void> {
  await sendExampleWorkspaces(bootstrapHost, options);
}

export async function sendWelcomePanelAvailableKits(
  catalogHost: ModulesCatalogHost
): Promise<void> {
  await sendAvailableKits(catalogHost);
}

export async function sendWelcomePanelModulesCatalog(
  catalogHost: ModulesCatalogHost
): Promise<void> {
  await refreshModulesCatalog(catalogHost);
}

export async function refreshWelcomePanelModulesCatalog(
  catalogHost: ModulesCatalogHost,
  options?: { forceRefresh?: boolean }
): Promise<void> {
  await refreshModulesCatalog(catalogHost, options);
}

export async function sendWelcomePanelWorkspaceStatus(
  bootstrapHost: BootstrapPayloadHost,
  options?: { forceCapabilityRefresh?: boolean }
): Promise<void> {
  await sendWorkspaceStatus(bootstrapHost, options);
}

export async function sendWelcomePanelWorkspaceToolStatus(
  bootstrapHost: BootstrapPayloadHost
): Promise<void> {
  await sendWorkspaceToolStatus(bootstrapHost);
}

export async function sendWelcomePanelWorkspaiSettings(
  context: vscode.ExtensionContext,
  postWebviewMessage: (command: string, data?: unknown) => void,
  preferredModelOverride?: string
): Promise<void> {
  postWebviewMessage(
    'workspaiSettings',
    await buildWorkspaiSettingsPayload(context, preferredModelOverride)
  );
}

export function readWelcomePanelUiPreferences(
  context: vscode.ExtensionContext,
  options: { workspacePath?: string; telemetryWorkspacePath: string }
) {
  return readIncidentStudioUiPreferences(context, options);
}

export function postWelcomePanelUiPreferences(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  workspacePath?: string
): void {
  postIncidentStudioUiPreferences(webview, context, workspacePath);
}

export async function sendWelcomePanelIncidentStudioTelemetry(
  webview: vscode.Webview,
  input: {
    context: vscode.ExtensionContext;
    workspacePath?: string;
    projectPath?: string;
    forceRefresh?: boolean;
  }
): Promise<void> {
  await postIncidentStudioTelemetry(webview, input);
}
