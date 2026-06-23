import type * as vscode from 'vscode';

import type { AIActionContract, AIActionOperation } from '../../core/aiActionContract';
import type { DashboardStudioHost } from './welcomePanelDashboardStudio';

export type DashboardStudioHostBindings = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  getSelectedProjectPath: () => string | undefined;
  getSelectedProjectName: () => string | undefined;
  getSelectedProjectType: () => string | undefined;
  postWebviewMessage: (command: string, data?: unknown, meta?: Record<string, unknown>) => void;
  getRunningStudioActionId: () => string | null;
  setRunningStudioActionId: (value: string | null) => void;
  getRunningDashboardAIActionOperation: () => AIActionOperation | null;
  setRunningDashboardAIActionOperation: (value: AIActionOperation | null) => void;
  getLatestDashboardAIActionContract: () => AIActionContract | null;
  getLatestDashboardAIActionId: () => string | null;
  setLatestDashboardAIAction: (contract: AIActionContract | null, actionId: string | null) => void;
};

export function buildDashboardStudioHost(
  bindings: DashboardStudioHostBindings
): DashboardStudioHost {
  return {
    context: bindings.context,
    webview: bindings.webview,
    getSelectedProjectPath: bindings.getSelectedProjectPath,
    getSelectedProjectName: bindings.getSelectedProjectName,
    getSelectedProjectType: bindings.getSelectedProjectType,
    postWebviewMessage: bindings.postWebviewMessage,
    getRunningStudioActionId: bindings.getRunningStudioActionId,
    setRunningStudioActionId: bindings.setRunningStudioActionId,
    getRunningDashboardAIActionOperation: bindings.getRunningDashboardAIActionOperation,
    setRunningDashboardAIActionOperation: bindings.setRunningDashboardAIActionOperation,
    getLatestDashboardAIActionContract: bindings.getLatestDashboardAIActionContract,
    getLatestDashboardAIActionId: bindings.getLatestDashboardAIActionId,
    setLatestDashboardAIAction: bindings.setLatestDashboardAIAction,
  };
}
