import type * as vscode from 'vscode';

import {
  getWebviewMessageRequestId,
  normalizeWebviewMessage,
} from '../../contracts/webviewProtocol';
import { SetupPanel } from './setupExperiencePanel.js';
import {
  isAiCreationWebviewCommand,
  tryDispatchAiCreationWebviewMessage,
} from './welcomePanelAiCreationMessages';
import type { AiCreationDispatchHost } from './welcomePanelAiCreationMessages';
import {
  tryDispatchAnalyzeReportWebviewMessage,
  type AnalyzeReportMessageHost,
} from './welcomePanelAnalyzeReportMessages';
import {
  tryDispatchDashboardContractWebviewMessage,
  type DashboardCommandHost,
} from './welcomePanelDashboardCommands';
import {
  tryDispatchDashboardLifecycleWebviewMessage,
  type DashboardLifecycleMessageHost,
} from './welcomePanelDashboardLifecycleMessages';
import {
  tryDispatchDashboardShortcutWebviewMessage,
  type DashboardShortcutMessageHost,
} from './welcomePanelDashboardShortcutMessages';
import {
  tryDispatchCatalogWebviewMessage,
  type ModulesCatalogHost,
} from './welcomePanelModulesCatalog';
import {
  isAiModalWebviewCommand,
  tryDispatchAiModalWebviewMessage,
  type AiModalMessageHost,
} from './welcomePanelAiModalMessages';
import {
  handleReadyWebviewMessage,
  isReadyWebviewCommand,
  type ReadyMessageHost,
} from './welcomePanelReadyMessages';
import {
  tryDispatchCreationNavigationWebviewMessage,
  type CreationNavigationMessageHost,
} from './welcomePanelCreationNavigationMessages';
import {
  tryDispatchWorkspaiSettingsWebviewMessage,
  type WorkspaiSettingsMessageHost,
} from './welcomePanelWorkspaiSettingsMessages';
import {
  tryDispatchWorkspaceSelectionWebviewMessage,
  type WorkspaceSelectionMessageHost,
} from './welcomePanelWorkspaceSelectionMessages';
import {
  tryDispatchIncidentStudioWebviewMessage,
  type IncidentStudioWebviewMessageHost,
} from './welcomePanelIncidentStudioMessages';
import { asRecord } from './welcomePanel.shared.js';

export type WelcomePanelWebviewMessageDispatchHost = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  runOptionalMessageLane: (laneName: string, lane: () => Promise<void> | void) => Promise<void>;
  getDashboardCommandHost: () => DashboardCommandHost;
  getDashboardLifecycleMessageHost: () => DashboardLifecycleMessageHost;
  getModulesCatalogHost: () => ModulesCatalogHost;
  getDashboardShortcutMessageHost: () => DashboardShortcutMessageHost;
  getAnalyzeReportMessageHost: () => AnalyzeReportMessageHost;
  getAiModalMessageHost: () => AiModalMessageHost;
  getWorkspaiSettingsMessageHost: () => WorkspaiSettingsMessageHost;
  getWorkspaceSelectionMessageHost: () => WorkspaceSelectionMessageHost;
  getIncidentStudioMessageHost: () => IncidentStudioWebviewMessageHost;
  getReadyMessageHost: () => ReadyMessageHost;
  getCreationNavigationMessageHost: () => CreationNavigationMessageHost;
  getAiCreationDispatchHost: () => AiCreationDispatchHost;
};

export async function runWelcomePanelOptionalMessageLane(
  laneName: string,
  lane: () => Promise<void> | void
): Promise<void> {
  try {
    await lane();
  } catch (error) {
    console.warn(`[WelcomePanel] Message lane failed (${laneName})`, error);
  }
}

export async function dispatchWelcomePanelWebviewMessage(
  host: WelcomePanelWebviewMessageDispatchHost,
  rawMessage: unknown
): Promise<void> {
  const message = normalizeWebviewMessage(rawMessage);
  if (!message) {
    console.warn('[WelcomePanel] Ignoring malformed webview message:', rawMessage);
    return;
  }

  const protocolRequestIdValue = getWebviewMessageRequestId(message);
  const protocolRequestId =
    typeof protocolRequestIdValue === 'string' ? protocolRequestIdValue : undefined;

  if (
    SetupPanel.isSetupCommand(message?.command) &&
    (await SetupPanel.handleEmbeddedMessage(host.context, host.webview, message))
  ) {
    return;
  }

  if (
    await tryDispatchDashboardContractWebviewMessage(
      host.getDashboardCommandHost(),
      message.command,
      asRecord(message.data)
    )
  ) {
    return;
  }

  if (
    await tryDispatchDashboardLifecycleWebviewMessage(
      host.getDashboardLifecycleMessageHost(),
      message.command,
      message.data
    )
  ) {
    return;
  }

  if (
    await tryDispatchCatalogWebviewMessage(
      host.getModulesCatalogHost(),
      message.command,
      message.data
    )
  ) {
    return;
  }

  if (
    await tryDispatchDashboardShortcutWebviewMessage(
      host.getDashboardShortcutMessageHost(),
      message.command,
      message.data
    )
  ) {
    return;
  }

  if (
    await tryDispatchAnalyzeReportWebviewMessage(
      host.getAnalyzeReportMessageHost(),
      message.command,
      message.data
    )
  ) {
    return;
  }

  if (isAiModalWebviewCommand(message.command)) {
    await host.runOptionalMessageLane(message.command, async () => {
      await tryDispatchAiModalWebviewMessage(
        host.getAiModalMessageHost(),
        message.command,
        message.data
      );
    });
    return;
  }

  if (
    await tryDispatchWorkspaiSettingsWebviewMessage(
      host.getWorkspaiSettingsMessageHost(),
      message.command,
      asRecord(message.data)
    )
  ) {
    return;
  }

  if (
    await tryDispatchWorkspaceSelectionWebviewMessage(
      host.getWorkspaceSelectionMessageHost(),
      message.command,
      asRecord(message.data)
    )
  ) {
    return;
  }

  if (
    await tryDispatchIncidentStudioWebviewMessage(
      host.getIncidentStudioMessageHost(),
      message.command,
      message.data,
      {
        protocolRequestId,
        chatCloseTracksLifecycle: true,
      }
    )
  ) {
    return;
  }

  if (isReadyWebviewCommand(message.command)) {
    handleReadyWebviewMessage(host.getReadyMessageHost());
    return;
  }

  if (
    await tryDispatchCreationNavigationWebviewMessage(
      host.getCreationNavigationMessageHost(),
      message.command,
      message.data
    )
  ) {
    return;
  }

  if (isAiCreationWebviewCommand(message.command)) {
    await tryDispatchAiCreationWebviewMessage(
      host.getAiCreationDispatchHost(),
      message.command,
      message.data
    );
  }
}
