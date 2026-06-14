/**
 * Incident Studio Panel (vNext)
 * Fullscreen webview for the new Incident Studio redesign
 * Opens as a separate tab/panel completely independent from AIIncidentStudio
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { openWorkspacePath } from '../../utils/workspacePathNavigation';
import {
  WorkspaceContext,
  type AnalyzeReport,
  analyzeReportExists,
  getAnalyzeReportPath,
  loadAnalyzeReport,
  runWorkspaceAnalyze,
} from './incidentStudioAnalyze';
import {
  buildStudioAIActionResult,
  executeGovernedAIActionOperation,
  formatAIActionRegistryWebviewPayload,
  publishStudioAIActionContractFromText,
} from './incidentStudioAIActionBridge';
import { AIActionContract, AIActionOperation } from '../../core/aiActionContract';
import { getLatestRunnableAIAction, readAIActionRegistry } from '../../core/aiActionRegistry';
import {
  buildIncidentStudioEvidenceContext,
  renderIncidentStudioEvidencePrompt,
} from '../../core/incidentStudioEvidenceContext';
import { askConfiguredAIProvider, getAIProviderStatus } from '../../core/aiProviderService';
import {
  getStudioActionRegistryEntryById,
  isStudioActionId,
  type StudioActionId,
} from '../../core/studioActionCommands';
import {
  executeStudioActionById,
  type StudioActionExecutionResult,
} from './incidentStudioActionBridge';
import { exportIncidentReproPack, importIncidentReproPack } from './incidentStudioReproPackBridge';
import { dispatchIncidentStudioInlineCommand } from './incidentStudioInlineCommandBridge';
import {
  shouldRefreshStabilizationLoopAfterAIAction,
  shouldRefreshStabilizationLoopAfterInlineCommand,
  shouldRefreshStabilizationLoopAfterStudioAction,
} from './incidentStudioStabilizationLoopBridge';
import {
  exportReleaseReadinessCommanderFromPayload,
  exportSandboxSimulationEvidenceFromPayload,
} from './incidentStudioEnterpriseExportBridge';
import {
  appendApprovalAuditEvent,
  postSessionToWebview,
  readIncidentStudioSession,
  replaceChatMessages,
  replaceExecutionTranscripts,
  replaceProofEvents,
  writeIncidentStudioSession,
  type IncidentStudioApprovalAuditEvent,
  type IncidentStudioChatMessage,
  type IncidentStudioExecutionTranscript,
  type IncidentStudioProofEvent,
  type IncidentStudioSessionPhase,
} from './incidentStudioSessionPersistenceBridge';
import { WelcomePanel } from './welcomePanel';
import {
  dispatchIncidentStudioShipLoopStepMessage,
  dispatchIncidentStudioInlineCommandWithShipLoopRefresh,
  refreshIncidentStudioShipLoopSurfaces,
} from './incidentStudioShipLoopBridge';
import { postIncidentStudioShipEvidence } from './incidentStudioShipEvidenceBridge';
import {
  handleIncidentStudioSetUiPreference,
  postIncidentStudioTelemetry,
  postIncidentStudioUiPreferences,
  resolveIncidentStudioTelemetry,
} from './incidentStudioTelemetryBridge';
import {
  dispatchIncidentStudioChatBrainMessage,
  isIncidentStudioChatBrainCommand,
} from './incidentStudioChatBrainBridge';

export class IncidentStudioPanel {
  public static readonly viewType = 'incidentStudioNextPanel';
  private static currentPanel: IncidentStudioPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspaceContext: WorkspaceContext;
  private _disposables: vscode.Disposable[] = [];
  private _reportWatcher: vscode.FileSystemWatcher | undefined;
  private _latestAIActionContract: AIActionContract | null = null;
  private _latestAIActionId: string | null = null;
  private _runningStudioActionId: string | null = null;
  private _runningAIActionOperation: AIActionOperation | null = null;
  private readonly _logger = Logger.getInstance();

  public static createOrShow(
    extensionContext: vscode.ExtensionContext,
    workspaceContext?: WorkspaceContext
  ) {
    WelcomePanel.ensureDashboardPanel(extensionContext);

    const column = vscode.ViewColumn.One;
    const extensionUri = extensionContext.extensionUri;

    // If panel already exists, show it
    if (IncidentStudioPanel.currentPanel) {
      IncidentStudioPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Use provided context or default
    const context = workspaceContext || {
      workspacePath: '',
      workspaceName: 'Unknown Workspace',
    };

    // Otherwise create new panel
    const panel = vscode.window.createWebviewPanel(
      IncidentStudioPanel.viewType,
      'Incident Studio (Next)',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );

    IncidentStudioPanel.currentPanel = new IncidentStudioPanel(
      panel,
      extensionContext,
      extensionUri,
      context
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    workspaceContext: WorkspaceContext
  ) {
    this._panel = panel;
    this._context = context;
    this._extensionUri = extensionUri;
    this._workspaceContext = workspaceContext;

    // Update content
    this._update();

    // Listen for when panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        const protocolRequestId =
          typeof message?.meta?.requestId === 'string'
            ? message.meta.requestId
            : typeof message?.data?.requestId === 'string'
              ? message.data.requestId
              : undefined;

        if (isIncidentStudioChatBrainCommand(message.command)) {
          await dispatchIncidentStudioChatBrainMessage(
            this._context,
            message.command,
            message.data,
            protocolRequestId,
            this._panel.webview
          );
          return;
        }

        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            return;
          case 'runAnalyze':
            this._handleRunAnalyze();
            return;
          case 'checkReportExists':
            this._handleCheckReportExists();
            return;
          case 'loadReport':
            this._handleLoadReport();
            return;
          case 'copyText':
            this._handleCopyText(message.data);
            return;
          case 'revealEvidence':
            this._handleRevealEvidence(message.data);
            return;
          case 'studioMessage':
            this._handleStudioMessage(message.data);
            return;
          case 'runStudioAction':
            this._handleRunStudioAction(message.data);
            return;
          case 'runAIActionContractCommand':
            this._handleRunAIActionContractCommand(message.data);
            return;
          case 'loadAIActionRegistry':
            this._handleLoadAIActionRegistry();
            return;
          case 'requestIncidentStudioTelemetry':
            void postIncidentStudioTelemetry(this._panel.webview, {
              context: this._context,
              workspacePath:
                typeof message.data?.workspacePath === 'string'
                  ? message.data.workspacePath
                  : this._workspaceContext.workspacePath,
              projectPath:
                typeof message.data?.projectPath === 'string'
                  ? message.data.projectPath
                  : undefined,
              forceRefresh: message.data?.forceRefresh === true,
            });
            return;
          case 'getUiPreferences':
            postIncidentStudioUiPreferences(
              this._panel.webview,
              this._context,
              typeof message.data?.workspacePath === 'string'
                ? message.data.workspacePath
                : this._workspaceContext.workspacePath
            );
            return;
          case 'setUiPreference':
            if (message.data?.key) {
              void handleIncidentStudioSetUiPreference(
                this._panel.webview,
                this._context,
                String(message.data.key),
                message.data.value,
                {
                  workspacePath:
                    typeof message.data.workspacePath === 'string'
                      ? message.data.workspacePath
                      : this._workspaceContext.workspacePath,
                }
              );
            }
            return;
          case 'exportIncidentReproPack':
            void this._handleExportIncidentReproPack(message.data);
            return;
          case 'importIncidentReproPack':
            void this._handleImportIncidentReproPack();
            return;
          case 'runIncidentInlineCommand':
            void this._handleRunIncidentInlineCommand(message.data, protocolRequestId);
            return;
          case 'requestIncidentStudioShipEvidence':
            void postIncidentStudioShipEvidence(this._panel.webview, {
              workspacePath:
                typeof message.data?.workspacePath === 'string'
                  ? message.data.workspacePath
                  : this._workspaceContext.workspacePath,
              projectPath:
                typeof message.data?.projectPath === 'string'
                  ? message.data.projectPath
                  : undefined,
              requestId: protocolRequestId,
            });
            return;
          case 'runShipLoopStep':
            void dispatchIncidentStudioShipLoopStepMessage({
              payload: message.data,
              webview: this._panel.webview,
              context: this._context,
              workspace: this._workspaceContext,
              requestId: protocolRequestId,
            });
            return;
          case 'exportSandboxSimulationEvidence':
            void exportSandboxSimulationEvidenceFromPayload(
              this._context,
              typeof message.data === 'object' && message.data !== null
                ? (message.data as Record<string, unknown>)
                : {},
              protocolRequestId,
              this._panel.webview
            );
            return;
          case 'exportReleaseReadinessCommander':
            void exportReleaseReadinessCommanderFromPayload(
              this._context,
              typeof message.data === 'object' && message.data !== null
                ? (message.data as Record<string, unknown>)
                : {},
              protocolRequestId,
              this._panel.webview
            );
            return;
          case 'loadIncidentStudioSession':
            void postSessionToWebview(
              this._panel.webview,
              this._resolveSessionWorkspacePath(message.data),
              this._context
            );
            return;
          case 'saveIncidentStudioSession':
            void this._handleSaveIncidentStudioSession(message.data);
            return;
        }
      },
      null,
      this._disposables
    );

    // Setup file watcher for auto-reload
    this._setupReportWatcher();
  }

  private async _handleCopyText(data: unknown) {
    const text =
      typeof data === 'object' && data !== null && 'text' in data ? String((data as any).text) : '';

    if (!text.trim()) {
      vscode.window.showWarningMessage('Nothing to copy from analyze report.');
      return;
    }

    try {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('Copied enterprise gate command to clipboard.');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to copy command: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async _handleRevealEvidence(data: unknown) {
    const evidencePath =
      typeof data === 'object' && data !== null && 'path' in data ? String((data as any).path) : '';
    const workspacePath =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as any).workspacePath)
        : this._workspaceContext.workspacePath;

    if (!evidencePath.trim() || !workspacePath.trim()) {
      vscode.window.showWarningMessage('Evidence path is not available.');
      return;
    }

    try {
      await openWorkspacePath({ workspacePath, path: evidencePath });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to open workspace path: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private _setupReportWatcher() {
    if (!this._workspaceContext.workspacePath) {
      return;
    }

    try {
      const reportPath = getAnalyzeReportPath(this._workspaceContext.workspacePath);

      // Use glob pattern for file watcher
      const globPattern = reportPath.replace(/\\/g, '/');
      this._reportWatcher = vscode.workspace.createFileSystemWatcher(globPattern);

      this._reportWatcher.onDidChange(() => {
        this._logger.info('Analyze report updated, reloading...');
        this._handleLoadReport();
      });

      this._reportWatcher.onDidCreate(() => {
        this._logger.info('Analyze report created, loading...');
        this._handleLoadReport();
      });

      this._disposables.push(this._reportWatcher);
    } catch (error) {
      this._logger.warn('Failed to setup report watcher', error);
    }
  }

  private async _handleRunAnalyze() {
    try {
      await runWorkspaceAnalyze(this._workspaceContext);
      await this._refreshStudioState('analyze');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to run analyze: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async _handleRunStudioAction(data: unknown) {
    const actionId =
      typeof data === 'object' && data !== null && 'actionId' in data
        ? String((data as any).actionId)
        : '';

    if (!isStudioActionId(actionId)) {
      vscode.window.showWarningMessage(
        `Unknown Studio action blocked: ${actionId || 'missing action'}`
      );
      return;
    }
    if (this._runningStudioActionId) {
      const detail = `Another Studio action is already running: ${this._runningStudioActionId}`;
      this._postStudioActionStatus(actionId, 'failed', detail);
      vscode.window.showWarningMessage(detail);
      return;
    }
    const studioActionId = actionId as StudioActionId;
    const actionDefinition = getStudioActionRegistryEntryById(studioActionId);

    const seed = {
      source: 'incident-studio-vnext',
      trigger: actionId,
      action: {
        title: actionDefinition.title,
        scope: actionDefinition.scope,
        stability: actionDefinition.stability,
        summary: actionDefinition.summary,
      },
      workspace: {
        path: this._workspaceContext.workspacePath,
        name: this._workspaceContext.workspaceName,
      },
    };

    try {
      this._runningStudioActionId = actionId;
      this._postStudioActionStatus(actionId, 'started');
      const lensSeed =
        actionDefinition.actionType === 'fix' || actionDefinition.actionType === 'impact'
          ? {
              ...seed,
              seed:
                actionDefinition.actionType === 'fix'
                  ? 'Use the current workspace evidence and selected editor context to produce a fix lens. Do not apply changes.'
                  : 'Use the current workspace evidence and selected editor context to produce an impact lens. Do not apply changes.',
            }
          : seed;
      const { refreshedReport, actionResult } = await executeStudioActionById(
        this._context,
        this._workspaceContext,
        studioActionId,
        lensSeed
      );
      await this._refreshStudioState(actionId);
      if (shouldRefreshStabilizationLoopAfterStudioAction(actionId)) {
        await refreshIncidentStudioShipLoopSurfaces({
          webview: this._panel.webview,
          context: this._context,
          workspacePath: this._workspaceContext.workspacePath,
        });
      }
      const registry = await readAIActionRegistry(this._workspaceContext.workspacePath);
      this._postStudioActionStatus(
        actionId,
        actionResult?.gatePassed === false ? 'failed' : 'completed',
        actionResult?.summary,
        this._buildStudioActionResult({
          actionId,
          report: refreshedReport,
          registry,
          fallbackSummary: actionResult?.summary,
          status: actionResult?.gatePassed === false ? 'failed' : 'completed',
          gatePassed: actionResult?.gatePassed,
          source: 'studio-action',
          executionTranscript: actionResult?.executionTranscript,
        })
      );
      return;
    } catch (error) {
      this._postStudioActionStatus(
        actionId,
        'failed',
        error instanceof Error ? error.message : String(error),
        this._buildStudioActionResult({
          actionId,
          report: loadAnalyzeReport(this._workspaceContext).report,
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
      this._runningStudioActionId = null;
    }
  }

  private _postStudioActionStatus(
    actionId: string,
    status: 'started' | 'completed' | 'failed',
    detail?: string,
    result?: Record<string, unknown>
  ) {
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
    this._panel.webview.postMessage({
      command: 'studioAssistantMessage',
      data: {
        role: 'assistant',
        content: [headline, detail].filter(Boolean).join('\n\n'),
        provider: 'studio-action-bridge',
      },
    });
    this._panel.webview.postMessage({
      command: 'studioActionStatus',
      data: {
        actionId,
        actionTitle: actionDefinition?.title,
        actionSummary: actionDefinition?.summary,
        status,
        detail,
        result,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  private _buildStudioActionResult(params: {
    actionId: string;
    report?: AnalyzeReport | null;
    registry?: Awaited<ReturnType<typeof readAIActionRegistry>> | null;
    fallbackSummary?: string;
    status?: 'started' | 'completed' | 'failed';
    gatePassed?: boolean;
    source?: 'studio-action' | 'ai-action' | 'ship-loop' | 'inline-command';
    executionTranscript?: StudioActionExecutionResult['executionTranscript'];
  }): Record<string, unknown> {
    return buildStudioAIActionResult({
      actionId: params.actionId,
      workspacePath: this._workspaceContext.workspacePath,
      report: params.report,
      registry: params.registry,
      fallbackSummary: params.fallbackSummary,
      status: params.status,
      gatePassed: params.gatePassed,
      source: params.source,
      executionTranscript: params.executionTranscript,
    });
  }

  private async _refreshStudioState(reason: string) {
    this._logger.info(`Refreshing Incident Studio state after ${reason}`);
    this._handleCheckReportExists();
    this._handleLoadReport();
    await this._handleLoadAIActionRegistry();
  }

  private async _handleRunAIActionContractCommand(data: unknown) {
    const operation =
      typeof data === 'object' && data !== null && 'operation' in data
        ? String((data as any).operation)
        : '';

    if (operation !== 'apply' && operation !== 'verify' && operation !== 'rollback') {
      vscode.window.showWarningMessage(`Unknown AI action operation: ${operation || 'missing'}`);
      return;
    }

    const requestedActionId =
      typeof data === 'object' && data !== null && 'actionId' in data
        ? String((data as any).actionId || '')
        : '';

    await executeGovernedAIActionOperation(
      this._context,
      {
        operation: operation as AIActionOperation,
        requestedActionId,
        workspacePath: this._workspaceContext.workspacePath,
        workspaceName: this._workspaceContext.workspaceName,
        activeContract: this._latestAIActionContract,
        activeActionId: this._latestAIActionId,
      },
      {
        postActionStatus: (actionId, status, detail, result) =>
          this._postStudioActionStatus(actionId, status, detail, result),
        postAssistantMessage: (content, provider) => {
          this._panel.webview.postMessage({
            command: 'studioAssistantMessage',
            data: { role: 'assistant', content, provider },
          });
        },
        postRegistry: (registry) => {
          this._postAIActionRegistry(registry);
          const latest = getLatestRunnableAIAction(registry);
          this._latestAIActionContract = latest?.contract || null;
          this._latestAIActionId = latest?.id || null;
        },
        refreshReports: () => {
          this._handleCheckReportExists();
          this._handleLoadReport();
        },
        assertNotRunning: () =>
          this._runningAIActionOperation
            ? {
                ok: false,
                reason: `Another AI action operation is already running: ${this._runningAIActionOperation}`,
              }
            : this._runningStudioActionId
              ? {
                  ok: false,
                  reason: `A Studio action is already running: ${this._runningStudioActionId}`,
                }
              : { ok: true },
        setRunning: (nextOperation) => {
          this._runningAIActionOperation = nextOperation;
        },
        refreshStabilizationLoop: async () => {
          if (!shouldRefreshStabilizationLoopAfterAIAction()) {
            return;
          }
          await refreshIncidentStudioShipLoopSurfaces({
            webview: this._panel.webview,
            context: this._context,
            workspacePath: this._workspaceContext.workspacePath,
          });
        },
      }
    );
  }

  private async _handleLoadAIActionRegistry() {
    if (!this._workspaceContext.workspacePath) {
      return;
    }

    try {
      const registry = await readAIActionRegistry(this._workspaceContext.workspacePath);
      const latest = getLatestRunnableAIAction(registry);
      this._latestAIActionContract = latest?.contract || null;
      this._latestAIActionId = latest?.id || null;
      this._postAIActionRegistry(registry);
      if (latest) {
        this._panel.webview.postMessage({
          command: 'studioActionContract',
          data: {
            actionId: latest.id,
            contract: latest.contract,
            validation: latest.validation,
            provider: latest.provider,
            rawJson: latest.rawJson,
          },
        });
      }
    } catch (error) {
      this._logger.warn('Unable to load AI action registry', error);
    }
  }

  private _postAIActionRegistry(registry: Awaited<ReturnType<typeof readAIActionRegistry>>) {
    this._panel.webview.postMessage({
      command: 'aiActionRegistryLoaded',
      data: formatAIActionRegistryWebviewPayload(registry),
    });
  }

  private async _handleStudioMessage(data: unknown) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as any).message)
        : '';

    if (!message.trim()) {
      return;
    }

    try {
      const status = await getAIProviderStatus(this._context);
      if (!status.ready) {
        this._panel.webview.postMessage({
          command: 'studioAssistantMessage',
          data: {
            role: 'assistant',
            content: `AI provider is not ready: ${status.reason || 'provider setup required'}. Configure it from Workspai Settings, or run deterministic Studio actions first.`,
            provider: status.provider,
          },
        });
        return;
      }

      const { report } = loadAnalyzeReport(this._workspaceContext);
      const evidenceContext = await buildIncidentStudioEvidenceContext({
        workspacePath: this._workspaceContext.workspacePath,
        workspaceName: this._workspaceContext.workspaceName,
        analyzeReport: report,
      });

      const { text, provider } = await askConfiguredAIProvider(this._context, [
        {
          role: 'user',
          content: [
            'You are Workspai Incident Studio. Be concise, evidence-aware, and never claim changes were applied unless a tool result proves it.',
            'When you propose a fix, impact review, or verification action, append one fenced JSON block matching schemaVersion "workspai.ai-action.v1". Keep paths workspace-relative. Set requiresApproval to true. Fix actions must include verificationCommands and rollbackPlan.',
            `Workspace: ${this._workspaceContext.workspaceName} (${this._workspaceContext.workspacePath})`,
            renderIncidentStudioEvidencePrompt(evidenceContext),
            `User request:\n${message}`,
          ].join('\n\n'),
        },
      ]);
      const persisted = await publishStudioAIActionContractFromText({
        workspacePath: this._workspaceContext.workspacePath,
        text,
        provider,
        postMessage: (command, payload) => {
          this._panel.webview.postMessage({ command, data: payload });
        },
      });
      this._latestAIActionContract = persisted.activeContract;
      this._latestAIActionId = persisted.activeActionId;

      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: text,
          provider,
        },
      });
    } catch (error) {
      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: `AI provider failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
    }
  }

  private async _handleExportIncidentReproPack(data: unknown) {
    await exportIncidentReproPack(
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined,
      { fallbackWorkspacePath: this._workspaceContext.workspacePath }
    );
  }

  private async _handleImportIncidentReproPack() {
    try {
      const imported = await importIncidentReproPack({
        fallbackWorkspacePath: this._workspaceContext.workspacePath,
      });
      if (imported.initialQuery) {
        await this._handleStudioMessage({
          message: imported.initialQuery,
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to import incident repro pack: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async _handleRunIncidentInlineCommand(data: unknown, requestId?: string) {
    const resolveWorkspacePath = () => {
      const explicit =
        typeof data === 'object' && data !== null && 'workspacePath' in data
          ? String((data as { workspacePath?: unknown }).workspacePath || '')
          : '';
      return explicit.trim() || this._workspaceContext.workspacePath;
    };
    const resolveProjectPath = () => {
      if (typeof data !== 'object' || data === null || !('projectPath' in data)) {
        return undefined;
      }
      const projectPath = String((data as { projectPath?: unknown }).projectPath || '').trim();
      return projectPath || undefined;
    };
    const workspacePath = resolveWorkspacePath();
    const projectPath = resolveProjectPath();

    const inlineInput = {
      payload: data,
      webview: this._panel.webview,
      requestId,
      resolveWorkspacePath,
      resolveProjectPath,
      resolveTelemetry: (wsPath: string) =>
        resolveIncidentStudioTelemetry({
          context: this._context,
          workspacePath: wsPath,
        }),
      enrichTelemetry: () => ({ source: 'incident_studio_panel' }),
    };

    if (shouldRefreshStabilizationLoopAfterInlineCommand()) {
      await dispatchIncidentStudioInlineCommandWithShipLoopRefresh({
        ...inlineInput,
        context: this._context,
        workspacePath,
        projectPath,
      });
      return;
    }

    await dispatchIncidentStudioInlineCommand(inlineInput);
  }

  private _resolveSessionWorkspacePath(data: unknown): string {
    const explicit =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as { workspacePath?: unknown }).workspacePath || '').trim()
        : '';
    return explicit || this._workspaceContext.workspacePath;
  }

  private _normalizeSessionPhase(value: unknown): IncidentStudioSessionPhase {
    if (
      value === 'detect' ||
      value === 'diagnose' ||
      value === 'plan' ||
      value === 'verify' ||
      value === 'learn'
    ) {
      return value;
    }
    return 'detect';
  }

  private async _handleSaveIncidentStudioSession(data: unknown) {
    const workspacePath = this._resolveSessionWorkspacePath(data);
    if (!workspacePath.trim()) {
      return;
    }

    const payload =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

    if (typeof payload.phase === 'string') {
      const session = readIncidentStudioSession(this._context, workspacePath);
      await writeIncidentStudioSession(this._context, workspacePath, {
        ...session,
        phase: this._normalizeSessionPhase(payload.phase),
      });
    }

    const chatMessages = Array.isArray(payload.chatMessages)
      ? payload.chatMessages
      : Array.isArray(payload.messages)
        ? payload.messages
        : null;

    if (chatMessages) {
      await replaceChatMessages(
        this._context,
        workspacePath,
        chatMessages as IncidentStudioChatMessage[]
      );
    }

    if (Array.isArray(payload.approvalAuditEvents)) {
      const session = readIncidentStudioSession(this._context, workspacePath);
      await writeIncidentStudioSession(this._context, workspacePath, {
        ...session,
        approvalAuditEvents: payload.approvalAuditEvents as IncidentStudioApprovalAuditEvent[],
      });
    } else if (payload.approvalAuditEvent && typeof payload.approvalAuditEvent === 'object') {
      await appendApprovalAuditEvent(
        this._context,
        workspacePath,
        payload.approvalAuditEvent as Omit<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'>
      );
    }

    if (Array.isArray(payload.proofEvents)) {
      await replaceProofEvents(
        this._context,
        workspacePath,
        payload.proofEvents as IncidentStudioProofEvent[]
      );
    }

    if (Array.isArray(payload.executionTranscripts)) {
      await replaceExecutionTranscripts(
        this._context,
        workspacePath,
        payload.executionTranscripts as IncidentStudioExecutionTranscript[]
      );
    }
  }

  private _handleCheckReportExists() {
    const exists = analyzeReportExists(this._workspaceContext.workspacePath);

    this._panel.webview.postMessage({
      command: 'reportExistsResult',
      exists,
      workspacePath: this._workspaceContext.workspacePath,
    });
  }

  private _handleLoadReport() {
    const { report, error } = loadAnalyzeReport(this._workspaceContext);

    this._panel.webview.postMessage({
      command: 'reportLoaded',
      data: report,
      error,
    });

    if (report) {
      this._logger.info('Analyze report loaded successfully');
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'incident-studio-next.js')
    );
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'incident-studio-next.css')
    );
    const cspSource = this._panel.webview.cspSource;
    let nonce = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src ${cspSource} https:; script-src 'nonce-${nonce}';">
    <title>Incident Studio (Next)</title>
    <link rel="stylesheet" type="text/css" href="${cssUri}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            width: 100%; 
            height: 100%; 
            background: var(--vscode-editor-background, #0d0d0f);
            color: var(--vscode-foreground, rgba(255, 255, 255, 0.82));
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
        }
        #root {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.INCIDENT_STUDIO_WORKSPACE_PATH = '${this._escapeHtml(this._workspaceContext.workspacePath)}';
        window.INCIDENT_STUDIO_WORKSPACE_NAME = '${this._escapeHtml(this._workspaceContext.workspaceName)}';
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  public dispose() {
    IncidentStudioPanel.currentPanel = undefined;

    if (this._reportWatcher) {
      this._reportWatcher.dispose();
    }

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
