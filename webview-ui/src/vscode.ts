/**
 * VS Code API wrapper for React webview
 * Handles communication between webview and extension
 */

import {
  createWebviewMessage,
  type WebviewProtocolMeta,
  type WebviewToExtensionMessage,
} from '@workspai-contracts/webviewProtocol';

// VS Code API type (provided by extension host)
declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

class VSCodeAPI {
  private readonly vscode: ReturnType<typeof acquireVsCodeApi>;

  constructor() {
    this.vscode = acquireVsCodeApi();
  }

  /**
   * Send message to extension
   */
  public postMessage<C extends string, D = unknown>(
    command: C,
    data?: D,
    meta?: WebviewProtocolMeta
  ) {
    this.vscode.postMessage(createWebviewMessage(command, data, meta));
  }

  /**
   * Send a prebuilt protocol message to extension.
   */
  public postProtocolMessage(message: WebviewToExtensionMessage) {
    this.vscode.postMessage(message);
  }

  /**
   * Get webview state
   */
  public getState<T = any>(): T | undefined {
    return this.vscode.getState() as T | undefined;
  }

  /**
   * Set webview state (persists across reloads)
   */
  public setState<T = any>(state: T) {
    this.vscode.setState(state);
  }
}

// Singleton instance
export const vscode = new VSCodeAPI();
