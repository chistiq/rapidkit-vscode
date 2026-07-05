import type * as vscode from 'vscode';

import type { AIActionContract } from '../../core/aiActionContract';
import type { WebviewFromExtensionMessage } from '../../contracts/webviewProtocol';
import type { ProjectSystemGraphWatcherHandle } from '../../core/systemGraphIndexer';
import { routeIncidentActionTypeFromMessage } from './incidentRouting';
import type { DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import type { IncidentStudioUiPreferences } from './incidentStudioUiPreferencesBridge';
import type { IncidentResumeSnapshot } from './incidentStudioResume';
import { handleAiChatQuery, type ChatBrainQueryHost } from './welcomePanelChatBrainQuery';
import type { ChatBrainConversation } from './welcomePanelChatBrainQuery';
import { buildChatBrainAIContext, type ChatBrainContextHost } from './welcomePanelChatBrainContext';
import { handleApplyPatch, type ChatBrainApplyPatchHost } from './welcomePanelChatBrainApplyPatch';
import type { ChatBrainExecuteActionHost } from './welcomePanelChatBrainExecuteAction';
import {
  handleAiChatFeedback,
  handleAiChatStart,
  handleAiChatSyncWorkspace,
  type ChatBrainLifecycleHost,
  type ImportedIncidentReplay,
} from './welcomePanelChatBrainLifecycle';
import {
  buildIncidentMemoryReuseSnapshotForPanel,
  detectIncidentRepeatSignalForPanel,
  persistIncidentReplayLearningForPanel,
  readDoctorEvidenceSnapshotForPanel,
  readDoctorEvidenceSummaryForPanel,
  resolveIncidentReplayWorkspacePath,
  type IncidentMemoryBridgeHost,
} from './welcomePanelIncidentMemoryBridge';
import {
  handleExportIncidentReproPack,
  handleImportIncidentReproPack,
  type IncidentReproPackHost,
} from './welcomePanelIncidentReproPackHandlers';
import {
  handleOpenIncidentNavigatorTargetMessage,
  handleRunDoctorMessage,
  handleViewProjectDoctorReportMessage,
  type DoctorMessageHost,
} from './welcomePanelDoctorMessages';
import type { IncidentStudioWebviewMessageHost } from './welcomePanelIncidentStudioMessages';
import { emitArchitectureReasoningRuntimeEvents } from './welcomePanelArchitectureTelemetry';
import { attemptIncidentAutoRollback, readGitDirtyEntries } from './welcomePanelGitRollback';
import { buildIncidentWave2ContractsWithFallback } from './welcomePanelIncidentWave2';
import { buildSandboxVerifyCommandsForConversation } from './welcomePanelSandboxVerify';
import {
  deriveIncidentVerifyCommandPack,
  resolveIncidentRollbackRuntimePolicy,
} from './welcomePanelIncidentPolicy';
import { readInstalledModulesFromProject } from './welcomePanelInstalledModules';
import {
  buildChatBrainSuggestedQuestions,
  getChatBrainPrimaryActionLabel,
} from './welcomePanelChatBrainSuggestedQuestions';
import type { StructuredIncidentPromptHost } from './welcomePanelStructuredIncidentPrompt';
import {
  buildWorkspaceGraphSnapshot,
  type WorkspaceGraphSnapshotHost,
} from './welcomePanelWorkspaceGraphSnapshot';
import type { DashboardSelectedProject } from './welcomePanelDashboardCommands';
import type { IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared.js';

export type WelcomePanelChatBrainHostFactoryBindings = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  getSelectedProject: () => DashboardSelectedProject;
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  resolveTelemetryWorkspacePath: () => string | undefined;
  resolveDashboardSessionWorkspacePath: (data: unknown) => string | undefined;
  postWebviewMessage: (command: string, data?: unknown) => void;
  postChatBrainWebviewMessage: (message: WebviewFromExtensionMessage) => void;
  resolveChatBrainWebview: () => vscode.Webview;
  routeStudioToSecondarySidebar: IncidentReproPackHost['routeStudioToSecondarySidebar'];
  trackStudioEvent: (
    eventName: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) => void;
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>;
  buildWorkspaceProjectCandidatesBlock: (
    workspacePath: string,
    doctorSnapshot?: DoctorEvidenceSnapshot
  ) => Promise<string | undefined>;
  resolveScopedProjectForWorkspace: (options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    doctorSnapshot?: DoctorEvidenceSnapshot;
  }) => Promise<{ name: string; path: string; type?: string } | null>;
  getWorkspaceGraphSnapshot: (
    options?: Parameters<typeof buildWorkspaceGraphSnapshot>[1]
  ) => Promise<IncidentWorkspaceGraphSnapshot>;
  getUiPreferences: (workspacePath?: string) => IncidentStudioUiPreferences;
  runOptionalMessageLane: (laneName: string, lane: () => Promise<void> | void) => Promise<void>;
  syncDashboardLatestAIAction: (
    registry: Awaited<ReturnType<typeof import('../../core/aiActionRegistry').readAIActionRegistry>>
  ) => void;
  postDashboardAIActionRegistry: (
    registry: Awaited<ReturnType<typeof import('../../core/aiActionRegistry').readAIActionRegistry>>
  ) => void;
  saveDashboardIncidentStudioSession: (data: unknown) => Promise<void>;
  handleDashboardStudioMessage: (data: unknown) => Promise<void>;
  handleDashboardStudioAction: (data: unknown) => Promise<void>;
  handleDashboardAIActionContractCommand: (data: unknown) => Promise<void>;
  isDashboardStudioSidebarOnly: () => boolean;
  handleAiChatQuery: (data: unknown, requestId?: string) => Promise<void>;
  handleAiChatExecuteAction: (data: unknown, requestId?: string) => Promise<void>;
  handleExportSandboxSimulationEvidence: (data: unknown, requestId?: string) => Promise<void>;
  handleExportReleaseReadinessCommander: (data: unknown, requestId?: string) => Promise<void>;
  chatBrainConversations: Map<string, ChatBrainConversation>;
  chatBrainInFlightRequestIds: Set<string>;
  chatBrainCompletedRequestIds: Set<string>;
  chatBrainQueryTokenSource: vscode.CancellationTokenSource | undefined;
  setChatBrainQueryTokenSource: (value: vscode.CancellationTokenSource | undefined) => void;
  activeChatBrainRequestId: string | undefined;
  setActiveChatBrainRequestId: (value: string | undefined) => void;
  activeChatBrainConversationId: string | undefined;
  setActiveChatBrainConversationId: (value: string | undefined) => void;
  incidentResumeByWorkspace: Map<string, IncidentResumeSnapshot>;
  pendingImportedIncidentReplayByWorkspace: Map<string, ImportedIncidentReplay>;
  systemGraphWatcherByPath: Map<string, ProjectSystemGraphWatcherHandle>;
  setLatestDashboardAIAction: (contract: AIActionContract | null, actionId: string | null) => void;
};

export function buildWelcomePanelStructuredIncidentPromptHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings,
  getIncidentMemoryBridgeHost: () => IncidentMemoryBridgeHost
): StructuredIncidentPromptHost {
  return {
    resolveFallbackWorkspacePath: bindings.resolveTelemetryWorkspacePath,
    readDoctorEvidenceSnapshot: (workspacePath, options) =>
      readDoctorEvidenceSnapshotForPanel(getIncidentMemoryBridgeHost(), workspacePath, options),
    buildWorkspaceProjectCandidatesBlock: bindings.buildWorkspaceProjectCandidatesBlock,
    resolveScopedProjectForWorkspace: bindings.resolveScopedProjectForWorkspace,
    inferFrameworkFromWorkspace: bindings.inferFrameworkFromWorkspace,
  };
}

export function buildWelcomePanelWorkspaceGraphSnapshotHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings,
  getIncidentMemoryBridgeHost: () => IncidentMemoryBridgeHost
): WorkspaceGraphSnapshotHost {
  return {
    resolveFallbackWorkspacePath: bindings.resolveTelemetryWorkspacePath,
    readDoctorEvidenceSnapshot: (workspacePath, options) =>
      readDoctorEvidenceSnapshotForPanel(getIncidentMemoryBridgeHost(), workspacePath, options),
    resolveScopedProjectForWorkspace: bindings.resolveScopedProjectForWorkspace,
    inferFrameworkFromWorkspace: bindings.inferFrameworkFromWorkspace,
    readInstalledModules: readInstalledModulesFromProject,
  };
}

export function buildWelcomePanelDoctorMessageHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings
): DoctorMessageHost {
  return {
    getSelectedWorkspaceInfo: bindings.getSelectedWorkspaceInfo,
    getSelectedProject: bindings.getSelectedProject,
    trackStudioEvent: bindings.trackStudioEvent,
  };
}

export function buildWelcomePanelIncidentMemoryBridgeHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings
): IncidentMemoryBridgeHost {
  return {
    getSelectedWorkspaceInfo: bindings.getSelectedWorkspaceInfo,
    getSelectedProject: bindings.getSelectedProject,
  };
}

export function buildWelcomePanelChatBrainContextHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings
): ChatBrainContextHost {
  return {
    resolveTelemetryWorkspacePath: bindings.resolveTelemetryWorkspacePath,
    resolveScopedProjectForWorkspace: bindings.resolveScopedProjectForWorkspace,
    inferFrameworkFromWorkspace: bindings.inferFrameworkFromWorkspace,
  };
}

export function buildWelcomePanelChatBrainApplyPatchHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings
): ChatBrainApplyPatchHost {
  return {
    context: bindings.context,
    chatBrainConversations: bindings.chatBrainConversations,
    postChatBrainWebviewMessage: bindings.postChatBrainWebviewMessage,
    resolveChatBrainWebview: bindings.resolveChatBrainWebview,
  };
}

export function buildWelcomePanelIncidentReproPackHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings,
  getIncidentMemoryBridgeHost: () => IncidentMemoryBridgeHost
): IncidentReproPackHost {
  return {
    resolveIncidentReplayWorkspacePath: (preferredWorkspacePath) =>
      resolveIncidentReplayWorkspacePath(getIncidentMemoryBridgeHost(), preferredWorkspacePath),
    pendingImportedIncidentReplayByWorkspace: bindings.pendingImportedIncidentReplayByWorkspace,
    postChatBrainWebviewMessage: bindings.postChatBrainWebviewMessage,
    routeStudioToSecondarySidebar: bindings.routeStudioToSecondarySidebar,
    trackStudioEvent: bindings.trackStudioEvent,
  };
}

export function buildWelcomePanelChatBrainLifecycleHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings
): ChatBrainLifecycleHost {
  return {
    context: bindings.context,
    chatBrainConversations: bindings.chatBrainConversations,
    incidentResumeByWorkspace: bindings.incidentResumeByWorkspace,
    pendingImportedIncidentReplayByWorkspace: bindings.pendingImportedIncidentReplayByWorkspace,
    systemGraphWatcherByPath: bindings.systemGraphWatcherByPath,
    getChatBrainQueryTokenSource: () => bindings.chatBrainQueryTokenSource,
    setChatBrainQueryTokenSource: bindings.setChatBrainQueryTokenSource,
    getActiveChatBrainConversationId: () => bindings.activeChatBrainConversationId,
    setActiveChatBrainConversationId: bindings.setActiveChatBrainConversationId,
    getActiveChatBrainRequestId: () => bindings.activeChatBrainRequestId,
    setActiveChatBrainRequestId: bindings.setActiveChatBrainRequestId,
    getSelectedProject: bindings.getSelectedProject,
    postChatBrainWebviewMessage: bindings.postChatBrainWebviewMessage,
    inferFrameworkFromWorkspace: bindings.inferFrameworkFromWorkspace,
    getWorkspaceGraphSnapshot: (options) => bindings.getWorkspaceGraphSnapshot(options),
    trackStudioEvent: bindings.trackStudioEvent,
    getUiPreferences: bindings.getUiPreferences,
  };
}

export function buildWelcomePanelChatBrainQueryHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings,
  getStructuredIncidentPromptHost: () => StructuredIncidentPromptHost,
  getIncidentMemoryBridgeHost: () => IncidentMemoryBridgeHost,
  getChatBrainContextHost: () => ChatBrainContextHost
): ChatBrainQueryHost {
  return {
    structuredIncidentPromptHost: getStructuredIncidentPromptHost(),
    chatBrainConversations: bindings.chatBrainConversations,
    chatBrainInFlightRequestIds: bindings.chatBrainInFlightRequestIds,
    chatBrainCompletedRequestIds: bindings.chatBrainCompletedRequestIds,
    getChatBrainQueryTokenSource: () => bindings.chatBrainQueryTokenSource,
    setChatBrainQueryTokenSource: bindings.setChatBrainQueryTokenSource,
    getActiveChatBrainRequestId: () => bindings.activeChatBrainRequestId,
    setActiveChatBrainRequestId: bindings.setActiveChatBrainRequestId,
    getActiveChatBrainConversationId: () => bindings.activeChatBrainConversationId,
    setActiveChatBrainConversationId: bindings.setActiveChatBrainConversationId,
    postChatBrainWebviewMessage: bindings.postChatBrainWebviewMessage,
    inferFrameworkFromWorkspace: bindings.inferFrameworkFromWorkspace,
    routeActionTypeFromMessage: routeIncidentActionTypeFromMessage,
    trackStudioEvent: bindings.trackStudioEvent,
    buildIncidentMemoryReuseSnapshot: (input) =>
      buildIncidentMemoryReuseSnapshotForPanel(getIncidentMemoryBridgeHost(), input),
    detectIncidentRepeatSignal: (input) =>
      detectIncidentRepeatSignalForPanel(getIncidentMemoryBridgeHost(), input),
    buildChatBrainAIContext: (options) =>
      buildChatBrainAIContext(getChatBrainContextHost(), options),
    readDoctorEvidenceSnapshot: (workspacePath, options) =>
      readDoctorEvidenceSnapshotForPanel(getIncidentMemoryBridgeHost(), workspacePath, options),
    getChatBrainPrimaryActionLabel,
    buildSuggestedQuestions: buildChatBrainSuggestedQuestions,
    setLatestDashboardAIAction: bindings.setLatestDashboardAIAction,
  };
}

export function buildWelcomePanelChatBrainExecuteActionHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings,
  getIncidentMemoryBridgeHost: () => IncidentMemoryBridgeHost,
  getChatBrainQueryHost: () => ChatBrainQueryHost
): ChatBrainExecuteActionHost {
  return {
    chatBrainConversations: bindings.chatBrainConversations,
    postChatBrainWebviewMessage: bindings.postChatBrainWebviewMessage,
    trackStudioEvent: bindings.trackStudioEvent,
    readGitDirtyEntries,
    runAiChatQuery: (data, requestId) =>
      handleAiChatQuery(getChatBrainQueryHost(), data, requestId),
    getWorkspaceGraphSnapshot: (options) => bindings.getWorkspaceGraphSnapshot(options),
    readDoctorEvidenceSummary: (workspacePath) =>
      readDoctorEvidenceSummaryForPanel(getIncidentMemoryBridgeHost(), workspacePath),
    resolveIncidentRollbackRuntimePolicy: (input) =>
      resolveIncidentRollbackRuntimePolicy({
        ...input,
        uiPrefs: bindings.getUiPreferences(),
      }),
    attemptIncidentAutoRollback,
    buildIncidentWave2Contracts: (input) =>
      buildIncidentWave2ContractsWithFallback(input, bindings.resolveTelemetryWorkspacePath),
    buildSandboxVerifyCommands: (input) =>
      buildSandboxVerifyCommandsForConversation({
        ...input,
        chatBrainConversations: bindings.chatBrainConversations,
        projectType: input.projectType || bindings.getSelectedProject()?.type,
        projectPath: input.projectPath || bindings.getSelectedProject()?.path,
      }),
    deriveIncidentVerifyCommandPack,
    getUiPreferences: bindings.getUiPreferences,
    emitArchitectureReasoningRuntimeEvents: (input) =>
      emitArchitectureReasoningRuntimeEvents(
        { trackStudioEvent: bindings.trackStudioEvent },
        input
      ),
    persistIncidentReplayLearning: (input) =>
      persistIncidentReplayLearningForPanel(getIncidentMemoryBridgeHost(), input),
  };
}

export function buildWelcomePanelIncidentStudioMessageHost(
  bindings: WelcomePanelChatBrainHostFactoryBindings,
  getDoctorMessageHost: () => DoctorMessageHost,
  getChatBrainLifecycleHost: () => ChatBrainLifecycleHost,
  getChatBrainApplyPatchHost: () => ChatBrainApplyPatchHost,
  getIncidentReproPackHost: () => IncidentReproPackHost
): IncidentStudioWebviewMessageHost {
  return {
    context: bindings.context,
    webview: bindings.webview,
    postWebviewMessage: bindings.postWebviewMessage,
    resolveTelemetryWorkspacePath: bindings.resolveTelemetryWorkspacePath,
    getSelectedWorkspaceInfo: bindings.getSelectedWorkspaceInfo,
    getSelectedProjectPath: () => bindings.getSelectedProject()?.path,
    resolveDashboardSessionWorkspacePath: bindings.resolveDashboardSessionWorkspacePath,
    syncDashboardLatestAIAction: bindings.syncDashboardLatestAIAction,
    postDashboardAIActionRegistry: bindings.postDashboardAIActionRegistry,
    saveDashboardIncidentStudioSession: bindings.saveDashboardIncidentStudioSession,
    handleDashboardStudioMessage: bindings.handleDashboardStudioMessage,
    handleDashboardStudioAction: bindings.handleDashboardStudioAction,
    handleDashboardAIActionContractCommand: bindings.handleDashboardAIActionContractCommand,
    isDashboardStudioSidebarOnly: bindings.isDashboardStudioSidebarOnly,
    runOptionalMessageLane: bindings.runOptionalMessageLane,
    handleRunDoctorMessage: (data, action) =>
      handleRunDoctorMessage(getDoctorMessageHost(), data, action),
    handleViewProjectDoctorReportMessage: (data) =>
      handleViewProjectDoctorReportMessage(getDoctorMessageHost(), data),
    handleOpenIncidentNavigatorTargetMessage: (data) =>
      handleOpenIncidentNavigatorTargetMessage(getDoctorMessageHost(), data),
    handleAiChatStart: (data, requestId) =>
      handleAiChatStart(getChatBrainLifecycleHost(), data, requestId),
    handleAiChatSyncWorkspace: (data, requestId) =>
      handleAiChatSyncWorkspace(getChatBrainLifecycleHost(), data, requestId),
    handleAiChatQuery: bindings.handleAiChatQuery,
    handleAiChatExecuteAction: bindings.handleAiChatExecuteAction,
    handleApplyPatch: (data, requestId) =>
      handleApplyPatch(getChatBrainApplyPatchHost(), data as never, requestId),
    handleExportIncidentReproPack: (data, requestId) =>
      handleExportIncidentReproPack(getIncidentReproPackHost(), data as never, requestId),
    handleExportSandboxSimulationEvidence: bindings.handleExportSandboxSimulationEvidence,
    handleExportReleaseReadinessCommander: bindings.handleExportReleaseReadinessCommander,
    handleImportIncidentReproPack: (requestId) =>
      handleImportIncidentReproPack(getIncidentReproPackHost(), requestId),
    handleAiChatFeedback: (data, requestId) =>
      handleAiChatFeedback(getChatBrainLifecycleHost(), data, requestId),
    chatBrainConversations: bindings.chatBrainConversations,
    incidentResumeByWorkspace: bindings.incidentResumeByWorkspace,
    trackStudioEvent: bindings.trackStudioEvent,
  };
}
