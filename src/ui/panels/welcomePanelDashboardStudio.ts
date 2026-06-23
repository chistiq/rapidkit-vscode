import * as vscode from 'vscode';

import { normalizeAIActionCommandPayload } from '../../contracts/aiActionOperationSurface';
import { getLatestRunnableAIAction, readAIActionRegistry } from '../../core/aiActionRegistry';
import type { AIActionContract, AIActionOperation } from '../../core/aiActionContract';
import { buildIncidentStudioEvidencePrompt } from '../../core/incidentStudioEvidenceContext';
import { askConfiguredAIProvider, getAIProviderStatus } from '../../core/aiProviderService';
import {
  executeGovernedAIActionOperation,
  formatAIActionRegistryWebviewPayload,
  publishStudioAIActionContractFromText,
  buildStudioAIActionResult,
} from './incidentStudioAIActionBridge';
import {
  executeStudioActionById,
  type StudioActionExecutionResult,
} from './incidentStudioActionBridge';
import { loadAnalyzeReport, type AnalyzeReport } from './incidentStudioAnalyze';
import { shouldRefreshStabilizationLoopAfterStudioAction } from './incidentStudioStabilizationLoopBridge';
import { refreshIncidentStudioShipLoopSurfaces } from './incidentStudioShipLoopBridge';
import {
  getStudioActionRegistryEntryById,
  isStudioActionId,
  type StudioActionId,
} from '../../core/studioActionCommands';
import { asRecord } from './welcomePanel.shared.js';
import { readStringField } from '../../contracts/webviewProtocol';

export type DashboardStudioHost = {
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

export function buildDashboardStudioActionResult(params: {
  actionId: string;
  workspacePath: string;
  report?: AnalyzeReport | null;
  reportError?: string | null;
  registry?: Awaited<ReturnType<typeof readAIActionRegistry>> | null;
  fallbackSummary?: string;
  status?: 'started' | 'completed' | 'failed';
  gatePassed?: boolean;
  source?: 'studio-action' | 'ai-action' | 'ship-loop' | 'inline-command';
  executionTranscript?: StudioActionExecutionResult['executionTranscript'];
}): Record<string, unknown> {
  return buildStudioAIActionResult({
    actionId: params.actionId,
    workspacePath: params.workspacePath,
    report: params.report,
    reportError: params.reportError,
    registry: params.registry,
    fallbackSummary: params.fallbackSummary,
    status: params.status,
    gatePassed: params.gatePassed,
    source: params.source,
    executionTranscript: params.executionTranscript,
  });
}

export function postDashboardStudioActionStatus(
  host: DashboardStudioHost,
  actionId: string,
  status: 'started' | 'completed' | 'failed',
  detail?: string,
  result?: Record<string, unknown>
): void {
  const actionDefinition = isStudioActionId(actionId)
    ? getStudioActionRegistryEntryById(actionId)
    : null;
  const label = actionDefinition?.title || actionId.replace(/-/g, ' ');
  const headline =
    status === 'started'
      ? `Studio action started: ${label}`
      : status === 'completed'
        ? `Studio action completed: ${label}`
        : `Studio action failed: ${label}`;
  host.postWebviewMessage('studioAssistantMessage', {
    role: 'assistant',
    content: [headline, detail].filter(Boolean).join('\n\n'),
    provider: 'studio-action-bridge',
  });
  host.postWebviewMessage('studioActionStatus', {
    actionId,
    actionTitle: actionDefinition?.title,
    actionSummary: actionDefinition?.summary,
    status,
    detail,
    result,
    updatedAt: new Date().toISOString(),
  });
}

export function postDashboardAIActionRegistry(
  host: DashboardStudioHost,
  registry: Awaited<ReturnType<typeof readAIActionRegistry>>
): void {
  host.postWebviewMessage('aiActionRegistryLoaded', formatAIActionRegistryWebviewPayload(registry));
}

export function syncDashboardLatestAIAction(
  host: DashboardStudioHost,
  registry: Awaited<ReturnType<typeof readAIActionRegistry>>
): void {
  const latest = getLatestRunnableAIAction(registry);
  host.setLatestDashboardAIAction(latest?.contract || null, latest?.id || null);
  if (latest) {
    host.postWebviewMessage('studioActionContract', {
      actionId: latest.id,
      contract: latest.contract,
      validation: latest.validation,
      provider: latest.provider,
      rawJson: latest.rawJson,
    });
  }
}

export async function handleDashboardStudioAction(
  host: DashboardStudioHost,
  data: unknown
): Promise<void> {
  const payload = asRecord(data) ?? {};
  const actionId = readStringField(payload, 'actionId') ?? '';
  const workspacePath = readStringField(payload, 'workspacePath') ?? '';
  const workspaceName = readStringField(payload, 'workspaceName') ?? 'Current Workspace';

  if (!isStudioActionId(actionId)) {
    vscode.window.showWarningMessage(
      `Unknown Studio action blocked: ${actionId || 'missing action'}`
    );
    return;
  }
  if (!workspacePath.trim()) {
    vscode.window.showWarningMessage('Workspace path is required to run Studio action.');
    return;
  }
  if (host.getRunningStudioActionId()) {
    const detail = `Another Studio action is already running: ${host.getRunningStudioActionId()}`;
    postDashboardStudioActionStatus(host, actionId, 'failed', detail);
    vscode.window.showWarningMessage(detail);
    return;
  }
  if (host.getRunningDashboardAIActionOperation()) {
    const detail = `An AI action operation is already running: ${host.getRunningDashboardAIActionOperation()}`;
    postDashboardStudioActionStatus(host, actionId, 'failed', detail);
    vscode.window.showWarningMessage(detail);
    return;
  }

  const studioActionId = actionId as StudioActionId;
  const actionDefinition = getStudioActionRegistryEntryById(studioActionId);
  const workspace = { workspacePath, workspaceName };
  const seed = {
    source: 'incident-studio-vnext-dashboard',
    trigger: actionId,
    action: {
      title: actionDefinition.title,
      scope: actionDefinition.scope,
      stability: actionDefinition.stability,
      summary: actionDefinition.summary,
    },
    workspace: { path: workspacePath, name: workspaceName },
  };

  try {
    host.setRunningStudioActionId(actionId);
    postDashboardStudioActionStatus(host, actionId, 'started');
    const lensSeed =
      actionDefinition.actionType === 'fix' || actionDefinition.actionType === 'impact'
        ? {
            ...seed,
            seed:
              actionDefinition.actionType === 'fix'
                ? 'Use the current workspace evidence and selected editor context to produce a fix lens. Do not apply changes.'
                : 'Use the current workspace evidence and selected editor context to produce Workspace Advisor guidance. Do not apply changes.',
          }
        : seed;
    const { refreshedReport, actionResult } = await executeStudioActionById(
      host.context,
      workspace,
      studioActionId,
      lensSeed
    );

    host.postWebviewMessage('reportLoaded', refreshedReport, {
      error: refreshedReport ? null : 'Report file not found',
    });
    host.postWebviewMessage('reportExistsResult', {
      exists: Boolean(refreshedReport),
      workspacePath,
    });
    if (shouldRefreshStabilizationLoopAfterStudioAction(actionId)) {
      await refreshIncidentStudioShipLoopSurfaces({
        webview: host.webview,
        context: host.context,
        workspacePath,
        projectPath: host.getSelectedProjectPath(),
      });
    }
    const registry = await readAIActionRegistry(workspacePath);
    postDashboardAIActionRegistry(host, registry);
    postDashboardStudioActionStatus(
      host,
      actionId,
      actionResult?.gatePassed === false ? 'failed' : 'completed',
      actionResult?.summary,
      buildDashboardStudioActionResult({
        actionId,
        workspacePath,
        report: refreshedReport,
        registry,
        fallbackSummary: actionResult?.summary,
        status: actionResult?.gatePassed === false ? 'failed' : 'completed',
        gatePassed: actionResult?.gatePassed,
        source: 'studio-action',
        executionTranscript: actionResult?.executionTranscript,
      })
    );
  } catch (error) {
    const { report } = loadAnalyzeReport(workspace);
    postDashboardStudioActionStatus(
      host,
      actionId,
      'failed',
      error instanceof Error ? error.message : String(error),
      buildDashboardStudioActionResult({
        actionId,
        workspacePath,
        report,
        fallbackSummary: error instanceof Error ? error.message : String(error),
        status: 'failed',
        gatePassed: false,
        source: 'studio-action',
      })
    );
    vscode.window.showErrorMessage(
      `Studio action failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    host.setRunningStudioActionId(null);
  }
}

export async function handleDashboardStudioMessage(
  host: DashboardStudioHost,
  data: unknown
): Promise<void> {
  const payload = asRecord(data) ?? {};
  const message = readStringField(payload, 'message') ?? '';
  const workspacePath = readStringField(payload, 'workspacePath') ?? '';
  const workspaceName = readStringField(payload, 'workspaceName') ?? 'Current Workspace';
  const projectPath =
    readStringField(payload, 'projectPath') ?? host.getSelectedProjectPath() ?? '';
  const projectName =
    readStringField(payload, 'projectName') ?? host.getSelectedProjectName() ?? '';
  const projectFramework =
    readStringField(payload, 'projectFramework') ?? host.getSelectedProjectType() ?? '';

  if (!message.trim()) {
    return;
  }
  if (!workspacePath.trim()) {
    vscode.window.showWarningMessage('Workspace path is required for Studio AI.');
    return;
  }

  try {
    const status = await getAIProviderStatus(host.context);
    if (!status.ready) {
      host.postWebviewMessage('studioAssistantMessage', {
        role: 'assistant',
        content: `AI provider is not ready: ${status.reason || 'provider setup required'}. Configure it from Workspai Settings, or run deterministic Studio actions first.`,
        provider: status.provider,
      });
      return;
    }

    const { report } = loadAnalyzeReport({ workspacePath, workspaceName });
    const evidencePrompt = await buildIncidentStudioEvidencePrompt({
      workspacePath,
      workspaceName,
      projectPath: projectPath.trim() || undefined,
      projectName: projectName.trim() || undefined,
      projectFramework: projectFramework.trim() || undefined,
      analyzeReport: report,
    });
    const { text, provider } = await askConfiguredAIProvider(host.context, [
      {
        role: 'user',
        content: [
          'You are Workspai Incident Studio. Be concise, evidence-aware, and never claim changes were applied unless a tool result proves it.',
          'When you propose a fix, impact review, or verification action, append one fenced JSON block matching schemaVersion "workspai.ai-action.v1". Keep paths workspace-relative. Set requiresApproval to true. Fix actions must include verificationCommands and rollbackPlan.',
          `Workspace: ${workspaceName} (${workspacePath})`,
          evidencePrompt,
          `User request:\n${message}`,
        ].join('\n\n'),
      },
    ]);
    const persisted = await publishStudioAIActionContractFromText({
      workspacePath,
      text,
      provider,
      postMessage: (command, payload) => {
        host.postWebviewMessage(command, payload);
      },
    });
    host.setLatestDashboardAIAction(persisted.activeContract, persisted.activeActionId);

    host.postWebviewMessage('studioAssistantMessage', {
      role: 'assistant',
      content: text,
      provider,
    });
  } catch (error) {
    host.postWebviewMessage('studioAssistantMessage', {
      role: 'assistant',
      content: `AI provider failed: ${error instanceof Error ? error.message : String(error)}`,
      provider: 'ai-provider',
    });
  }
}

export async function handleDashboardAIActionContractCommand(
  host: DashboardStudioHost,
  data: unknown
): Promise<void> {
  const payload = normalizeAIActionCommandPayload(data);
  if (!payload) {
    vscode.window.showWarningMessage(
      'A valid AI action operation and workspace path are required.'
    );
    return;
  }

  await executeGovernedAIActionOperation(
    host.context,
    {
      operation: payload.operation,
      requestedActionId: payload.actionId || '',
      workspacePath: payload.workspacePath,
      workspaceName: payload.workspaceName,
      activeContract: host.getLatestDashboardAIActionContract(),
      activeActionId: host.getLatestDashboardAIActionId(),
    },
    {
      postActionStatus: (actionId, status, detail, result) =>
        postDashboardStudioActionStatus(host, actionId, status, detail, result),
      postAssistantMessage: (content, provider) => {
        host.postWebviewMessage('studioAssistantMessage', {
          role: 'assistant',
          content,
          provider,
        });
      },
      postRegistry: (registry) => {
        syncDashboardLatestAIAction(host, registry);
        postDashboardAIActionRegistry(host, registry);
      },
      refreshReports: () => {
        const { report, error } = loadAnalyzeReport({
          workspacePath: payload.workspacePath,
          workspaceName: payload.workspaceName,
        });
        host.postWebviewMessage('reportLoaded', report, { error });
      },
      assertNotRunning: () => {
        if (host.getRunningStudioActionId()) {
          return {
            ok: false,
            reason: `A Studio action is already running: ${host.getRunningStudioActionId()}`,
          };
        }
        if (host.getRunningDashboardAIActionOperation()) {
          return {
            ok: false,
            reason: `Another AI action operation is already running: ${host.getRunningDashboardAIActionOperation()}`,
          };
        }
        return { ok: true };
      },
      setRunning: (nextOperation) => {
        host.setRunningDashboardAIActionOperation(nextOperation);
      },
      refreshStabilizationLoop: () =>
        refreshIncidentStudioShipLoopSurfaces({
          webview: host.webview,
          context: host.context,
          workspacePath: payload.workspacePath,
          projectPath: host.getSelectedProjectPath(),
        }),
    }
  );
}
