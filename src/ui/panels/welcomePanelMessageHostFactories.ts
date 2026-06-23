import type * as vscode from 'vscode';

import type { ModuleData } from '../../data/modules';
import type { DashboardSelectedProject } from './welcomePanelDashboardCommands';
import {
  cloneExampleWorkspace,
  updateExampleWorkspace,
  type ExampleWorkspacesHost,
} from './welcomePanelExampleWorkspaces';
import type {
  AiCreationDispatchHost,
  AiCreationMessageHost,
} from './welcomePanelAiCreationMessages';
import type { CreationNavigationMessageHost } from './welcomePanelCreationNavigationMessages';
import type { BootstrapPayloadHost } from './welcomePanelBootstrapPayload';
import type { RecentWorkspacesHost } from './welcomePanelRecentWorkspaces';
import type {
  DashboardSection,
  ReadyMessageHost,
  WorkspaceShareDashboardPayload,
} from './welcomePanelReadyMessages';
import type { WorkspaiSettingsMessageHost } from './welcomePanelWorkspaiSettingsMessages';
import type { WorkspaceSelectionMessageHost } from './welcomePanelWorkspaceSelectionMessages';
import type { AiModalMessageHost } from './welcomePanelAiModalMessages';
import type { AiModalQueryHost } from './welcomePanelAiModalQuery';
import { readInstalledModulesFromProject } from './welcomePanelInstalledModules';
import { detectProjectTypeFromPath } from './welcomePanelProjectTypeDetection';
import { readDoctorEvidenceSnapshotForPanel } from './welcomePanelIncidentMemoryBridge';
import type { IncidentMemoryBridgeHost } from './welcomePanelIncidentMemoryBridge';

export type WelcomePanelAiModalHostFactoryBindings = {
  context: vscode.ExtensionContext;
  getModulesCatalog: () => ModuleData[];
  refreshModulesCatalog: () => Promise<void>;
  getAiQueryTokenSource: () => vscode.CancellationTokenSource | undefined;
  setAiQueryTokenSource: (value: vscode.CancellationTokenSource | undefined) => void;
  getActiveAiQueryRequestId: () => number | undefined;
  setActiveAiQueryRequestId: (value: number | undefined) => void;
  trackAIQueryRequestStart: (requestId: number) => void;
  postAIStreamDoneOnce: (requestId?: number, error?: string) => void;
  postWebviewMessage: (command: string, data?: unknown) => void;
  getIncidentMemoryBridgeHost: () => IncidentMemoryBridgeHost;
};

export type WelcomePanelMessageHostFactoryBindings = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  postWebviewMessage: (command: string, data?: unknown) => void;
  markPanelReady: () => void;
  takePendingFrameworkModal: () => string | null;
  getPendingAICreateMode: () => 'workspace' | 'project';
  getAICreateTargetWorkspace: () => { name?: string; path?: string } | undefined;
  takePendingModuleModal: () => ModuleData | null;
  takePendingWorkspaceShareDashboardOpen: () => WorkspaceShareDashboardPayload | null;
  takePendingSetupTabOpen: () => boolean;
  takePendingDashboardSectionOpen: () => DashboardSection | null;
  openSetupTab: (context: vscode.ExtensionContext) => void;
  openDashboardTab: (context: vscode.ExtensionContext) => void;
  getSelectedWorkspacePath: () => string | undefined;
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => DashboardSelectedProject;
  setSelectedProject: (project: DashboardSelectedProject) => void;
  listWorkspaceProjectsForWebview: (
    workspacePath: string
  ) => Promise<Array<{ name: string; path: string; type?: string }>>;
  updateWithProject: (
    projectPath: string,
    projectName: string,
    options?: { workspacePath?: string; projectType?: string }
  ) => Promise<void>;
  syncAnalysisSelectionFromWebview: (data: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeMode?: 'workspace' | 'project';
  }) => Promise<void>;
  getRecentWorkspaces: () => ReturnType<BootstrapPayloadHost['getRecentWorkspaces']>;
  sendAvailableKits: () => Promise<void>;
  sendModulesCatalog: () => Promise<void>;
  sendWorkspaiSettings: (preferredModelOverride?: string) => Promise<void>;
  sendDashboardEvidence: () => Promise<void>;
  sendUiPreferences: (workspacePath?: string) => void;
  sendRecentWorkspaces: () => Promise<void>;
  sendExampleWorkspaces: () => Promise<void>;
  beginGovernanceChainForWorkspace: (
    workspacePath: string,
    workspaceName: string | undefined,
    triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add'
  ) => Promise<void>;
  runOptionalMessageLane: (laneName: string, lane: () => Promise<void> | void) => Promise<void>;
  refreshDashboardForWorkspaceSelection: () => Promise<void>;
};

export function buildWelcomePanelRecentWorkspacesHost(): RecentWorkspacesHost {
  return {
    detectProjectType: (projectPath) => detectProjectTypeFromPath(projectPath),
  };
}

export function buildWelcomePanelWorkspaiSettingsMessageHost(
  bindings: WelcomePanelMessageHostFactoryBindings
): WorkspaiSettingsMessageHost {
  return {
    context: bindings.context,
    postWebviewMessage: bindings.postWebviewMessage,
    sendWorkspaiSettings: bindings.sendWorkspaiSettings,
  };
}

export function buildWelcomePanelAiCreationMessageHost(
  bindings: WelcomePanelMessageHostFactoryBindings
): AiCreationMessageHost {
  return {
    context: bindings.context,
    postWebviewMessage: bindings.postWebviewMessage,
    getSelectedProject: bindings.getSelectedProject,
    getSelectedWorkspacePath: bindings.getSelectedWorkspacePath,
    beginGovernanceChainForWorkspace: bindings.beginGovernanceChainForWorkspace,
  };
}

export function buildWelcomePanelAiCreationDispatchHost(
  bindings: WelcomePanelMessageHostFactoryBindings
): AiCreationDispatchHost {
  return {
    ...buildWelcomePanelAiCreationMessageHost(bindings),
    runOptionalMessageLane: bindings.runOptionalMessageLane,
  };
}

export function buildWelcomePanelReadyMessageHost(
  bindings: WelcomePanelMessageHostFactoryBindings,
  sendInitialData: () => void
): ReadyMessageHost {
  return {
    context: bindings.context,
    webview: bindings.webview,
    postWebviewMessage: bindings.postWebviewMessage,
    markPanelReady: bindings.markPanelReady,
    sendInitialData,
    takePendingFrameworkModal: bindings.takePendingFrameworkModal,
    getPendingAICreateMode: bindings.getPendingAICreateMode,
    getAICreateTargetWorkspace: bindings.getAICreateTargetWorkspace,
    takePendingModuleModal: bindings.takePendingModuleModal,
    takePendingWorkspaceShareDashboardOpen: bindings.takePendingWorkspaceShareDashboardOpen,
    takePendingSetupTabOpen: bindings.takePendingSetupTabOpen,
    takePendingDashboardSectionOpen: bindings.takePendingDashboardSectionOpen,
  };
}

export function buildWelcomePanelCreationNavigationMessageHost(
  bindings: WelcomePanelMessageHostFactoryBindings
): CreationNavigationMessageHost {
  return {
    context: bindings.context,
    postWebviewMessage: bindings.postWebviewMessage,
    openSetupTab: bindings.openSetupTab,
    openDashboardTab: bindings.openDashboardTab,
    getSelectedWorkspacePath: bindings.getSelectedWorkspacePath,
    getSelectedWorkspaceInfo: () => bindings.getSelectedWorkspaceInfo() ?? undefined,
    getSelectedProject: bindings.getSelectedProject,
    listWorkspaceProjectsForWebview: bindings.listWorkspaceProjectsForWebview,
    updateWithProject: bindings.updateWithProject,
    syncAnalysisSelectionFromWebview: bindings.syncAnalysisSelectionFromWebview,
  };
}

export function buildWelcomePanelBootstrapPayloadHost(
  bindings: WelcomePanelMessageHostFactoryBindings
): BootstrapPayloadHost {
  return {
    context: bindings.context,
    webview: bindings.webview,
    postWebviewMessage: bindings.postWebviewMessage,
    getRecentWorkspaces: bindings.getRecentWorkspaces,
    sendAvailableKits: bindings.sendAvailableKits,
    sendModulesCatalog: bindings.sendModulesCatalog,
    sendWorkspaiSettings: bindings.sendWorkspaiSettings,
    sendDashboardEvidence: bindings.sendDashboardEvidence,
    sendUiPreferences: bindings.sendUiPreferences,
    getSelectedWorkspaceInfo: bindings.getSelectedWorkspaceInfo,
    getSelectedProject: bindings.getSelectedProject,
    setSelectedProject: bindings.setSelectedProject,
    readInstalledModules: readInstalledModulesFromProject,
    detectProjectType: detectProjectTypeFromPath,
  };
}

export function buildWelcomePanelWorkspaceSelectionMessageHost(
  bindings: WelcomePanelMessageHostFactoryBindings,
  getExampleWorkspacesHost: () => ExampleWorkspacesHost
): WorkspaceSelectionMessageHost {
  return {
    context: bindings.context,
    webview: bindings.webview,
    getSelectedWorkspacePath: bindings.getSelectedWorkspacePath,
    sendRecentWorkspaces: bindings.sendRecentWorkspaces,
    cloneExample: (example) => cloneExampleWorkspace(getExampleWorkspacesHost(), example),
    updateExample: (example) => updateExampleWorkspace(getExampleWorkspacesHost(), example),
    refreshDashboardForWorkspaceSelection: bindings.refreshDashboardForWorkspaceSelection,
  };
}

export function buildWelcomePanelExampleWorkspacesHost(
  bindings: WelcomePanelMessageHostFactoryBindings
): ExampleWorkspacesHost {
  return {
    postWebviewMessage: bindings.postWebviewMessage,
    sendRecentWorkspaces: bindings.sendRecentWorkspaces,
    sendExampleWorkspaces: bindings.sendExampleWorkspaces,
    beginGovernanceChainForWorkspace: bindings.beginGovernanceChainForWorkspace,
  };
}

export function buildWelcomePanelAiModalQueryHost(
  bindings: WelcomePanelAiModalHostFactoryBindings
): AiModalQueryHost {
  return {
    context: bindings.context,
    getAiQueryTokenSource: bindings.getAiQueryTokenSource,
    setAiQueryTokenSource: bindings.setAiQueryTokenSource,
    getActiveAiQueryRequestId: bindings.getActiveAiQueryRequestId,
    setActiveAiQueryRequestId: bindings.setActiveAiQueryRequestId,
    trackAIQueryRequestStart: bindings.trackAIQueryRequestStart,
    postAIStreamDoneOnce: bindings.postAIStreamDoneOnce,
    postWebviewMessage: bindings.postWebviewMessage,
    readDoctorEvidenceSnapshot: (workspacePath) =>
      readDoctorEvidenceSnapshotForPanel(
        bindings.getIncidentMemoryBridgeHost(),
        workspacePath
      ).catch(() => undefined),
  };
}

export function buildWelcomePanelAiModalMessageHost(
  bindings: WelcomePanelAiModalHostFactoryBindings,
  getAiModalQueryHost: () => AiModalQueryHost
): AiModalMessageHost {
  return {
    ...getAiModalQueryHost(),
    getModulesCatalog: bindings.getModulesCatalog,
    ensureModulesCatalogLoaded: async () => {
      if (!bindings.getModulesCatalog().length) {
        await bindings.refreshModulesCatalog();
      }
    },
  };
}
