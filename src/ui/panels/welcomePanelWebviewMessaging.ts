import type * as vscode from 'vscode';

import {
  createExtensionWebviewMessage,
  type WebviewFromExtensionMessage,
} from '../../contracts/webviewProtocol';

export type WelcomePanelAiQueryTrackingState = {
  inFlightAIQueryRequestIds: Set<number>;
  completedAIQueryRequestIds: number[];
};

export function trackWelcomePanelAiQueryRequestStart(
  state: WelcomePanelAiQueryTrackingState,
  requestId: number
): void {
  state.inFlightAIQueryRequestIds.add(requestId);
}

export function trackWelcomePanelAiQueryRequestComplete(
  state: WelcomePanelAiQueryTrackingState,
  requestId: number
): void {
  state.inFlightAIQueryRequestIds.delete(requestId);
  if (!state.completedAIQueryRequestIds.includes(requestId)) {
    state.completedAIQueryRequestIds.push(requestId);
    if (state.completedAIQueryRequestIds.length > 240) {
      state.completedAIQueryRequestIds.splice(0, state.completedAIQueryRequestIds.length - 240);
    }
  }
}

export function hasCompletedWelcomePanelAiQueryRequest(
  state: WelcomePanelAiQueryTrackingState,
  requestId: number
): boolean {
  return state.completedAIQueryRequestIds.includes(requestId);
}

export function postWelcomePanelWebviewMessage<C extends string, D = unknown>(
  panelWebview: vscode.Webview,
  command: C,
  data?: D,
  options?: {
    meta?: WebviewFromExtensionMessage<C, D>['meta'];
    error?: unknown;
    webview?: vscode.Webview;
  }
): void {
  try {
    const delivery = (options?.webview ?? panelWebview).postMessage(
      createExtensionWebviewMessage(command, data, options?.meta, options?.error)
    );
    void Promise.resolve(delivery).catch(() => {
      // A renderer can dispose a webview between scheduling and delivery.
      // Treat that race as cancellation; never surface an unhandled rejection
      // into the extension host while the window is closing or reloading.
    });
  } catch {
    // Accessing a disposed webview may throw synchronously on some VS Code
    // builds. The target no longer exists, so there is nothing useful to retry.
  }
}

export function postWelcomePanelChatBrainWebviewMessage(
  panelWebview: vscode.Webview,
  chatBrainReplyWebview: vscode.Webview | undefined,
  message: WebviewFromExtensionMessage
): void {
  const targetWebview = chatBrainReplyWebview ?? panelWebview;
  postWelcomePanelWebviewMessage(panelWebview, message.command, message.data, {
    meta: message.meta,
    error: message.error,
    webview: targetWebview,
  });
}

export function postWelcomePanelAIStreamDoneOnce(
  panelWebview: vscode.Webview,
  aiQueryState: WelcomePanelAiQueryTrackingState,
  requestId?: number,
  error?: string
): void {
  if (typeof requestId === 'number') {
    if (hasCompletedWelcomePanelAiQueryRequest(aiQueryState, requestId)) {
      return;
    }
    trackWelcomePanelAiQueryRequestComplete(aiQueryState, requestId);
    postWelcomePanelWebviewMessage(
      panelWebview,
      'aiStreamDone',
      error ? { error, requestId } : { requestId }
    );
    return;
  }

  postWelcomePanelWebviewMessage(panelWebview, 'aiStreamDone');
}
