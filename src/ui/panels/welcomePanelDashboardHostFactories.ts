import type * as vscode from 'vscode';

import type { AIModalContext } from '../../core/aiService';
import type { ModuleData } from '../../data/modules';
import type { AnalyzeReportMessageHost } from './welcomePanelAnalyzeReportMessages';
import type {
  DashboardCommandHost,
  DashboardSelectedProject,
} from './welcomePanelDashboardCommands';
import { sendDashboardEvidence, type DashboardEvidenceHost } from './welcomePanelDashboardEvidence';
import type { DashboardLifecycleMessageHost } from './welcomePanelDashboardLifecycleMessages';
import {
  runDashboardOpsChainCommand,
  type DashboardOpsChainHost,
} from './welcomePanelDashboardOpsChain';
import type { DashboardShortcutMessageHost } from './welcomePanelDashboardShortcutMessages';
import type { ModulesCatalogHost } from './welcomePanelModulesCatalog';
import type { RecentWorkspaceEntry } from './welcomePanelRecentWorkspaces';
import { resolveEvidenceCardIdsForDashboardCommand } from '../../core/dashboardReportRegistry';
import { recordRetentionMilestone } from '../../core/retentionMilestones';

export type WelcomePanelDashboardHostFactoryBindings = {
  context: vscode.ExtensionContext;
  getWorkspaceExplorerSelectedWorkspace: () => { name: string; path: string } | null | undefined;
  getSelectedProject: () => DashboardSelectedProject;
  getFallbackWorkspacePath: () => string | undefined;
  getModulesCatalog: () => ModuleData[];
  setModulesCatalog: (modules: ModuleData[]) => void;
  getRecentWorkspaces: () => Promise<RecentWorkspaceEntry[]>;
  beginEvidenceSendGeneration: () => number;
  isCurrentEvidenceSendGeneration: (generation: number) => boolean;
  postWebviewMessage: (
    command: string,
    data?: unknown,
    options?: { error?: unknown; meta?: Record<string, unknown> }
  ) => void;
  executeDashboardContractCommand: (
    command: string,
    data?: Record<string, unknown>
  ) => Promise<boolean>;
  sendWorkspaceToolStatus: () => Promise<void>;
  resolveTelemetryWorkspacePath: () => string | undefined;
  refreshWorkspaceStatus: () => Promise<void>;
  refreshExampleWorkspaces: () => Promise<void>;
  showAiModal: (context: vscode.ExtensionContext, aiContext: AIModalContext) => void;
};

export function getSelectedWorkspaceInfoFromExplorer(
  getWorkspaceExplorerSelectedWorkspace: WelcomePanelDashboardHostFactoryBindings['getWorkspaceExplorerSelectedWorkspace']
): { name: string; path: string } | null {
  const workspace = getWorkspaceExplorerSelectedWorkspace();
  if (!workspace) {
    return null;
  }
  return { name: workspace.name, path: workspace.path };
}

export function buildWelcomePanelDashboardOpsChainHost(
  bindings: WelcomePanelDashboardHostFactoryBindings,
  getDashboardEvidenceHost: () => DashboardEvidenceHost
): DashboardOpsChainHost {
  return {
    context: bindings.context,
    getSelectedProject: bindings.getSelectedProject,
    executeDashboardContractCommand: bindings.executeDashboardContractCommand,
    sendDashboardEvidence: (context) => sendDashboardEvidence(getDashboardEvidenceHost(), context),
  };
}

export function buildWelcomePanelDashboardEvidenceHost(
  bindings: WelcomePanelDashboardHostFactoryBindings,
  getDashboardOpsChainHost: () => DashboardOpsChainHost
): DashboardEvidenceHost {
  return {
    context: bindings.context,
    getSelectedWorkspaceInfo: () =>
      getSelectedWorkspaceInfoFromExplorer(bindings.getWorkspaceExplorerSelectedWorkspace),
    getSelectedProject: bindings.getSelectedProject,
    getFallbackWorkspacePath: bindings.getFallbackWorkspacePath,
    getRecentWorkspaces: bindings.getRecentWorkspaces,
    postWebviewMessage: (command, data) => bindings.postWebviewMessage(command, data),
    runDashboardOpsChainCommand: (command, workspacePath, workspaceName) =>
      runDashboardOpsChainCommand(
        getDashboardOpsChainHost(),
        command,
        workspacePath,
        workspaceName
      ),
    beginEvidenceSendGeneration: bindings.beginEvidenceSendGeneration,
    isCurrentEvidenceSendGeneration: bindings.isCurrentEvidenceSendGeneration,
  };
}

export function buildWelcomePanelDashboardLifecycleMessageHost(
  bindings: WelcomePanelDashboardHostFactoryBindings,
  getDashboardEvidenceHost: () => DashboardEvidenceHost
): DashboardLifecycleMessageHost {
  return {
    context: bindings.context,
    sendDashboardEvidence: (context) => sendDashboardEvidence(getDashboardEvidenceHost(), context),
    sendWorkspaceToolStatus: bindings.sendWorkspaceToolStatus,
    resolveTelemetryWorkspacePath: bindings.resolveTelemetryWorkspacePath,
  };
}

export function buildWelcomePanelAnalyzeReportMessageHost(
  bindings: WelcomePanelDashboardHostFactoryBindings
): AnalyzeReportMessageHost {
  return {
    postWebviewMessage: (command, data, options) =>
      bindings.postWebviewMessage(command, data, options),
  };
}

export function buildWelcomePanelDashboardShortcutMessageHost(
  bindings: WelcomePanelDashboardHostFactoryBindings
): DashboardShortcutMessageHost {
  return {
    context: bindings.context,
    showAiModal: bindings.showAiModal,
  };
}

export function buildWelcomePanelModulesCatalogHost(
  bindings: WelcomePanelDashboardHostFactoryBindings
): ModulesCatalogHost {
  return {
    getModulesCatalog: bindings.getModulesCatalog,
    setModulesCatalog: bindings.setModulesCatalog,
    getSelectedWorkspaceInfo: () =>
      getSelectedWorkspaceInfoFromExplorer(bindings.getWorkspaceExplorerSelectedWorkspace),
    getSelectedProject: bindings.getSelectedProject,
    getFallbackWorkspacePath: bindings.getFallbackWorkspacePath,
    postWebviewMessage: (command, data) => bindings.postWebviewMessage(command, data),
    refreshExampleWorkspaces: bindings.refreshExampleWorkspaces,
  };
}

export function buildWelcomePanelDashboardCommandHost(
  bindings: WelcomePanelDashboardHostFactoryBindings,
  getDashboardEvidenceHost: () => DashboardEvidenceHost
): DashboardCommandHost {
  return {
    getSelectedWorkspaceInfo: () =>
      getSelectedWorkspaceInfoFromExplorer(bindings.getWorkspaceExplorerSelectedWorkspace),
    getSelectedProject: bindings.getSelectedProject,
    postDashboardCommandFailed: (command: string, reason: string, details) => {
      void recordRetentionMilestone(bindings.context, 'command_failure', {
        surface: 'dashboard',
      });
      bindings.postWebviewMessage('dashboardCommandFailed', {
        command,
        reason,
        cardIds: resolveEvidenceCardIdsForDashboardCommand(command),
        exitCode: details?.exitCode,
        stderrTail: details?.stderrTail,
        suggestedNextAction: details?.suggestedNextAction,
        timestamp: Date.now(),
      });
    },
    sendDashboardEvidence: (context) => sendDashboardEvidence(getDashboardEvidenceHost(), context),
    refreshWorkspaceStatus: bindings.refreshWorkspaceStatus,
  };
}
