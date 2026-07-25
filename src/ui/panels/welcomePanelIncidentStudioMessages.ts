import path from 'node:path';
import * as vscode from 'vscode';

import { readAIActionRegistry } from '../../core/aiActionRegistry';
import {
  getWebviewMessageDataRecord,
  readStringField,
  readTrimmedStringField,
} from '../../contracts/webviewProtocol';
import { revealWorkspaiEvidenceOutputForUser } from '../../core/evidenceCommandRunner';
import { recordRetentionMilestone } from '../../core/retentionMilestones';
import { buildIncidentLifecycleMetrics } from './incidentConversationMetrics';
import { dispatchIncidentStudioInlineCommand } from './incidentStudioInlineCommandBridge';
import {
  buildIncidentResumeSnapshot,
  type IncidentConversationState,
  type IncidentResumeSnapshot,
} from './incidentStudioResume';
import {
  dispatchIncidentStudioShipLoopStepMessage,
  refreshIncidentStudioShipLoopSurfaces,
} from './incidentStudioShipLoopBridge';
import { postIncidentStudioShipEvidence } from './incidentStudioShipEvidenceBridge';
import {
  postIncidentStudioTelemetry,
  resolveIncidentStudioTelemetry,
} from './incidentStudioTelemetryBridge';
import { postSessionToWebview } from './incidentStudioSessionPersistenceBridge';
import {
  handleWelcomePanelAskStudioAboutEvidence,
  handleWelcomePanelCopyEvidenceAgentHandoff,
  handleWelcomePanelSendEvidenceToCopilot,
  handleWelcomePanelSendWorkspaceToCopilot,
} from './welcomePanelCopilotHandoff';
import { getIncidentPrimaryCtaExperimentVariant } from './welcomePanelTelemetryExperiment';

export type IncidentStudioChatConversation = IncidentConversationState & {
  projectPath?: string;
  framework?: string;
  startedAt?: number;
};

export type IncidentStudioWebviewMessageHost = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  postWebviewMessage: (command: string, data?: unknown) => void;
  resolveTelemetryWorkspacePath: () => string | undefined;
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProjectPath: () => string | undefined;
  resolveDashboardSessionWorkspacePath: (data: unknown) => string | undefined;
  syncDashboardLatestAIAction: (registry: Awaited<ReturnType<typeof readAIActionRegistry>>) => void;
  postDashboardAIActionRegistry: (
    registry: Awaited<ReturnType<typeof readAIActionRegistry>>
  ) => void;
  saveDashboardIncidentStudioSession: (data: unknown) => Promise<void>;
  handleDashboardStudioMessage: (data: unknown) => Promise<void>;
  handleDashboardStudioAction: (data: unknown) => Promise<void>;
  handleDashboardAIActionContractCommand: (data: unknown) => Promise<void>;
  isDashboardStudioSidebarOnly: () => boolean;
  runOptionalMessageLane: (laneName: string, lane: () => Promise<void> | void) => Promise<void>;
  handleRunDoctorMessage: (data: unknown, action: 'check' | 'fix') => Promise<void>;
  handleViewProjectDoctorReportMessage: (data: unknown) => Promise<void>;
  handleOpenIncidentNavigatorTargetMessage: (data: unknown) => Promise<void>;
  handleAiChatStart: (data: unknown, requestId?: string) => Promise<void>;
  handleAiChatSyncWorkspace: (data: unknown, requestId?: string) => Promise<void>;
  handleAiChatQuery: (data: unknown, requestId?: string) => Promise<void>;
  handleAiChatExecuteAction: (data: unknown, requestId?: string) => Promise<void>;
  handleApplyPatch: (data: unknown, requestId?: string) => Promise<void>;
  handleExportIncidentReproPack: (data: unknown, requestId?: string) => Promise<void>;
  handleExportSandboxSimulationEvidence: (data: unknown, requestId?: string) => Promise<void>;
  handleExportReleaseReadinessCommander: (data: unknown, requestId?: string) => Promise<void>;
  handleImportIncidentReproPack: (requestId?: string) => Promise<void>;
  handleAiChatFeedback: (data: unknown, requestId?: string) => Promise<void>;
  chatBrainConversations: Map<string, IncidentStudioChatConversation>;
  incidentResumeByWorkspace: Map<string, IncidentResumeSnapshot>;
  trackStudioEvent: (
    eventName: string,
    workspacePath: string | undefined,
    properties: Record<string, unknown>
  ) => void;
};

const INCIDENT_STUDIO_WEBVIEW_COMMANDS = new Set([
  'loadAIActionRegistry',
  'loadIncidentStudioSession',
  'saveIncidentStudioSession',
  'studioMessage',
  'runStudioAction',
  'runAIActionContractCommand',
  'copyCopilotContextPrompt',
  'sendWorkspaceToCopilot',
  'sendToCopilot',
  'copyEvidenceAgentHandoff',
  'askStudioAboutEvidence',
  'showWorkspaiEvidenceOutput',
  'requestIncidentStudioTelemetry',
  'requestIncidentStudioShipEvidence',
  'runShipLoopStep',
  'aiChatStart',
  'aiChatSyncWorkspace',
  'aiChatQuery',
  'aiChatExecuteAction',
  'aiChatApplyPatch',
  'exportIncidentReproPack',
  'exportSandboxSimulationEvidence',
  'exportReleaseReadinessCommander',
  'importIncidentReproPack',
  'incidentPredictionAccepted',
  'aiChatFeedback',
  'aiChatClose',
  'runDoctorChecks',
  'runDoctorFix',
  'viewComplianceReport',
  'viewProjectDoctorReport',
  'openIncidentNavigatorTarget',
  'runIncidentInlineCommand',
]);

export function isIncidentStudioWebviewCommand(command: string): boolean {
  return INCIDENT_STUDIO_WEBVIEW_COMMANDS.has(command);
}

export function handleAiChatCloseConversation(
  host: IncidentStudioWebviewMessageHost,
  conversationId: string | undefined,
  options?: { trackLifecycle?: boolean }
): void {
  if (typeof conversationId !== 'string') {
    return;
  }

  const conv = host.chatBrainConversations.get(conversationId);
  if (!conv) {
    return;
  }

  if (options?.trackLifecycle !== false) {
    const resumeSnapshot = buildIncidentResumeSnapshot(conv);
    if (resumeSnapshot) {
      host.incidentResumeByWorkspace.set(resumeSnapshot.workspacePath, resumeSnapshot);
    }

    const lifecycleMetrics = buildIncidentLifecycleMetrics(conv, Date.now());
    if (lifecycleMetrics.resolved) {
      host.trackStudioEvent('workspai.studio.loop_completed', conv.workspacePath, {
        framework: conv.framework ?? 'unknown',
        durationMs: lifecycleMetrics.durationMs,
        queryCount: lifecycleMetrics.queryCount,
        actionCount: lifecycleMetrics.actionCount,
        projectPath: conv.projectPath,
        timeToVerifyMs: lifecycleMetrics.timeToVerifyMs,
      });
    } else if (lifecycleMetrics.hasExchange) {
      host.trackStudioEvent('workspai.studio.abandoned', conv.workspacePath, {
        framework: conv.framework ?? 'unknown',
        durationMs: lifecycleMetrics.durationMs,
        queryCount: lifecycleMetrics.queryCount,
        actionCount: lifecycleMetrics.actionCount,
        projectPath: conv.projectPath,
      });
    }
  }

  host.chatBrainConversations.delete(conversationId);
}

export async function tryDispatchIncidentStudioWebviewMessage(
  host: IncidentStudioWebviewMessageHost,
  command: string,
  data: unknown,
  options?: { protocolRequestId?: string; chatCloseTracksLifecycle?: boolean }
): Promise<boolean> {
  if (!isIncidentStudioWebviewCommand(command)) {
    return false;
  }

  const protocolRequestId = options?.protocolRequestId;
  const payload = data as Record<string, unknown> | undefined;

  switch (command) {
    case 'loadAIActionRegistry': {
      const workspacePath = typeof payload?.workspacePath === 'string' ? payload.workspacePath : '';
      if (!workspacePath.trim()) {
        host.postWebviewMessage('aiActionRegistryLoaded', {
          updatedAt: new Date().toISOString(),
          entries: [],
        });
        break;
      }
      const registry = await readAIActionRegistry(workspacePath);
      host.syncDashboardLatestAIAction(registry);
      host.postDashboardAIActionRegistry(registry);
      break;
    }
    case 'loadIncidentStudioSession': {
      const workspacePath = host.resolveDashboardSessionWorkspacePath(data);
      if (workspacePath) {
        await postSessionToWebview(host.webview, workspacePath, host.context);
      }
      break;
    }
    case 'saveIncidentStudioSession':
      await host.saveDashboardIncidentStudioSession(data);
      break;
    case 'studioMessage':
      if (host.isDashboardStudioSidebarOnly()) {
        break;
      }
      await host.handleDashboardStudioMessage(data);
      break;
    case 'runStudioAction':
      if (host.isDashboardStudioSidebarOnly()) {
        break;
      }
      await host.handleDashboardStudioAction(data);
      break;
    case 'runAIActionContractCommand':
      if (host.isDashboardStudioSidebarOnly()) {
        break;
      }
      await host.handleDashboardAIActionContractCommand(data);
      break;
    case 'copyCopilotContextPrompt':
    case 'sendWorkspaceToCopilot':
      await handleWelcomePanelSendWorkspaceToCopilot(data, {
        resolveWorkspacePath: () => host.getSelectedWorkspaceInfo()?.path,
        resolveWorkspaceName: () => host.getSelectedWorkspaceInfo()?.name,
      });
      break;
    case 'sendToCopilot':
      await handleWelcomePanelSendEvidenceToCopilot(data, {
        resolveWorkspacePath: () => host.getSelectedWorkspaceInfo()?.path,
        resolveWorkspaceName: () => host.getSelectedWorkspaceInfo()?.name,
      });
      break;
    case 'copyEvidenceAgentHandoff':
      await handleWelcomePanelCopyEvidenceAgentHandoff(data, {
        resolveWorkspacePath: () => host.getSelectedWorkspaceInfo()?.path,
        resolveWorkspaceName: () => host.getSelectedWorkspaceInfo()?.name,
      });
      break;
    case 'askStudioAboutEvidence':
      await handleWelcomePanelAskStudioAboutEvidence(data, {
        resolveWorkspacePath: () => host.getSelectedWorkspaceInfo()?.path,
        resolveWorkspaceName: () => host.getSelectedWorkspaceInfo()?.name,
        extensionContext: host.context,
      });
      void recordRetentionMilestone(host.context, 'studio_opened', {
        surface: 'studio',
      });
      break;
    case 'showWorkspaiEvidenceOutput':
      revealWorkspaiEvidenceOutputForUser();
      break;
    case 'requestIncidentStudioTelemetry':
      await postIncidentStudioTelemetry(host.webview, {
        context: host.context,
        workspacePath:
          typeof payload?.workspacePath === 'string'
            ? payload.workspacePath
            : host.resolveTelemetryWorkspacePath(),
        projectPath: typeof payload?.projectPath === 'string' ? payload.projectPath : undefined,
        forceRefresh: payload?.forceRefresh === true,
      });
      break;
    case 'requestIncidentStudioShipEvidence':
      await postIncidentStudioShipEvidence(host.webview, {
        workspacePath:
          typeof payload?.workspacePath === 'string'
            ? payload.workspacePath
            : host.resolveTelemetryWorkspacePath(),
        projectPath:
          typeof payload?.projectPath === 'string'
            ? payload.projectPath
            : host.getSelectedProjectPath(),
        requestId: protocolRequestId,
      });
      break;
    case 'runShipLoopStep': {
      const workspacePath =
        readTrimmedStringField(getWebviewMessageDataRecord({ command, data }), 'workspacePath') ??
        host.getSelectedWorkspaceInfo()?.path;
      if (!workspacePath) {
        break;
      }
      const workspaceName =
        host.getSelectedWorkspaceInfo()?.name || path.basename(workspacePath) || workspacePath;
      await dispatchIncidentStudioShipLoopStepMessage({
        payload: data,
        webview: host.webview,
        context: host.context,
        workspace: { workspacePath, workspaceName },
        requestId: protocolRequestId,
      });
      break;
    }
    case 'aiChatStart':
      await host.handleAiChatStart(data, protocolRequestId);
      break;
    case 'aiChatSyncWorkspace':
      await host.handleAiChatSyncWorkspace(data, protocolRequestId);
      break;
    case 'aiChatQuery':
      await host.handleAiChatQuery(data, protocolRequestId);
      break;
    case 'aiChatExecuteAction':
      await host.handleAiChatExecuteAction(data, protocolRequestId);
      break;
    case 'aiChatApplyPatch':
      await host.handleApplyPatch(data, protocolRequestId);
      break;
    case 'exportIncidentReproPack':
      await host.handleExportIncidentReproPack(data, protocolRequestId);
      break;
    case 'exportSandboxSimulationEvidence':
      await host.handleExportSandboxSimulationEvidence(data, protocolRequestId);
      break;
    case 'exportReleaseReadinessCommander':
      await host.handleExportReleaseReadinessCommander(data, protocolRequestId);
      break;
    case 'importIncidentReproPack':
      await host.handleImportIncidentReproPack(protocolRequestId);
      break;
    case 'incidentPredictionAccepted': {
      const parsed = getWebviewMessageDataRecord({ command, data });
      const conversationId = readStringField(parsed, 'conversationId');
      const conv = conversationId ? host.chatBrainConversations.get(conversationId) : undefined;
      const explicitWorkspacePath = readTrimmedStringField(parsed, 'workspacePath');
      host.trackStudioEvent(
        'workspai.studio.prediction_accepted',
        explicitWorkspacePath || conv?.workspacePath,
        {
          conversationId,
          warningId: readStringField(parsed, 'warningId'),
          predictionKey: readStringField(parsed, 'predictionKey'),
          framework: conv?.framework ?? 'unknown',
        }
      );
      break;
    }
    case 'aiChatFeedback':
      await host.handleAiChatFeedback(data, protocolRequestId);
      break;
    case 'aiChatClose':
      handleAiChatCloseConversation(
        host,
        readStringField(getWebviewMessageDataRecord({ command, data }), 'conversationId'),
        { trackLifecycle: options?.chatCloseTracksLifecycle }
      );
      break;
    case 'runDoctorChecks':
      await host.runOptionalMessageLane('runDoctorChecks', async () => {
        await host.handleRunDoctorMessage(data, 'check');
      });
      break;
    case 'runDoctorFix':
      await host.runOptionalMessageLane('runDoctorFix', async () => {
        await host.handleRunDoctorMessage(data, 'fix');
      });
      break;
    case 'viewComplianceReport': {
      const explicitWorkspacePath =
        typeof payload?.workspacePath === 'string' && payload.workspacePath.trim()
          ? payload.workspacePath.trim()
          : undefined;
      const selectedWorkspace = host.getSelectedWorkspaceInfo();
      const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
      const workspaceName =
        (typeof payload?.workspaceName === 'string' && payload.workspaceName.trim()) ||
        selectedWorkspace?.name ||
        (workspacePath ? path.basename(workspacePath) : undefined);

      if (!workspacePath) {
        vscode.window.showWarningMessage('Select a workspace first.');
        break;
      }

      await vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
        workspace: {
          path: workspacePath,
          name: workspaceName,
        },
        preferredAction: 'compliance',
      });

      host.trackStudioEvent('workspai.studio.action_executed', workspacePath, {
        actionType: 'view-compliance-report',
        workspaceName: workspaceName || path.basename(workspacePath),
      });
      break;
    }
    case 'viewProjectDoctorReport':
      await host.runOptionalMessageLane('viewProjectDoctorReport', async () => {
        await host.handleViewProjectDoctorReportMessage(data);
      });
      break;
    case 'openIncidentNavigatorTarget':
      await host.runOptionalMessageLane('openIncidentNavigatorTarget', async () => {
        await host.handleOpenIncidentNavigatorTargetMessage(data);
      });
      break;
    case 'runIncidentInlineCommand':
      await host.runOptionalMessageLane('runIncidentInlineCommand', async () => {
        await dispatchIncidentStudioInlineCommand({
          payload: data,
          webview: host.webview,
          requestId: protocolRequestId,
          resolveWorkspacePath: () => {
            const explicitWorkspacePath =
              typeof payload?.workspacePath === 'string' && payload.workspacePath.trim()
                ? payload.workspacePath.trim()
                : undefined;
            return explicitWorkspacePath || host.getSelectedWorkspaceInfo()?.path;
          },
          resolveProjectPath: () => host.getSelectedProjectPath(),
          resolveTelemetry: (workspacePath) =>
            resolveIncidentStudioTelemetry({
              context: host.context,
              workspacePath,
            }),
          enrichTelemetry: (workspacePath) => ({
            source: 'incident_studio',
            ctaVariant: getIncidentPrimaryCtaExperimentVariant(workspacePath || 'global'),
          }),
          onMissingCommand: () => {
            vscode.window.showWarningMessage('No command provided to run.');
          },
          refreshStabilizationLoop: async () => {
            const workspacePath =
              typeof payload?.workspacePath === 'string' && payload.workspacePath.trim()
                ? payload.workspacePath.trim()
                : host.getSelectedWorkspaceInfo()?.path;
            if (!workspacePath) {
              return;
            }
            await refreshIncidentStudioShipLoopSurfaces({
              webview: host.webview,
              context: host.context,
              workspacePath,
              projectPath: host.getSelectedProjectPath(),
            });
          },
        });
      });
      break;
    default:
      return false;
  }

  return true;
}
