import * as vscode from 'vscode';

import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';
import { WelcomePanel } from './welcomePanel';

export const INCIDENT_STUDIO_CHAT_BRAIN_COMMANDS = [
  'aiChatStart',
  'aiChatSyncWorkspace',
  'aiChatQuery',
  'aiChatExecuteAction',
  'aiChatApplyPatch',
  'aiChatFeedback',
  'aiChatClose',
] as const;

export type IncidentStudioChatBrainCommand = (typeof INCIDENT_STUDIO_CHAT_BRAIN_COMMANDS)[number];

export function isIncidentStudioChatBrainCommand(
  value: string
): value is IncidentStudioChatBrainCommand {
  return (INCIDENT_STUDIO_CHAT_BRAIN_COMMANDS as readonly string[]).includes(value);
}

const CHAT_BRAIN_HOST_READY_TIMEOUT_MS = 4000;
const CHAT_BRAIN_HOST_READY_POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureIncidentStudioChatBrainHost(
  context: vscode.ExtensionContext
): Promise<WelcomePanel | undefined> {
  if (WelcomePanel.getReadyDashboardPanel()) {
    return WelcomePanel.getReadyDashboardPanel();
  }

  WelcomePanel.ensureDashboardPanel(context);

  const deadline = Date.now() + CHAT_BRAIN_HOST_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const host = WelcomePanel.getReadyDashboardPanel();
    if (host) {
      return host;
    }
    await sleep(CHAT_BRAIN_HOST_READY_POLL_MS);
  }

  return WelcomePanel.getReadyDashboardPanel();
}

export async function dispatchIncidentStudioChatBrainMessage(
  context: vscode.ExtensionContext,
  command: string,
  data: unknown,
  requestId: string | undefined,
  replyWebview: vscode.Webview
): Promise<{ handled: boolean; error?: string }> {
  if (!isIncidentStudioChatBrainCommand(command)) {
    return { handled: false };
  }

  const host = await ensureIncidentStudioChatBrainHost(context);
  if (!host) {
    replyWebview.postMessage(
      createExtensionWebviewMessage(
        'aiChatError',
        {
          conversationId:
            typeof (data as { conversationId?: unknown })?.conversationId === 'string'
              ? (data as { conversationId: string }).conversationId
              : '',
          code: 'CHAT_BRAIN_HOST_UNAVAILABLE',
          message: 'Incident Studio chat brain is still initializing. Retry the query in a moment.',
          retryable: true,
        },
        { requestId, version: 'v1' }
      )
    );
    return {
      handled: true,
      error: 'Chat brain host unavailable',
    };
  }

  await host.dispatchExternalChatBrainMessage(command, data, requestId, replyWebview);
  return { handled: true };
}
