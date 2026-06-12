/**
 * Incident Studio Panel (vNext)
 * Fullscreen webview for the new Incident Studio redesign
 * Opens as a separate tab/panel completely independent from AIIncidentStudio
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { Logger } from '../../utils/logger';
import {
  WorkspaceContext,
  type AnalyzeReport,
  analyzeReportExists,
  getAnalyzeReportPath,
  loadAnalyzeReport,
  runWorkspaceAnalyze,
} from './incidentStudioAnalyze';
import {
  AIActionContract,
  AIActionOperation,
  parseAIActionContractFromText,
  validateAIActionContract,
} from '../../core/aiActionContract';
import { AIActionExecutionResult, runAIActionContractOperation } from '../../core/aiActionExecutor';
import {
  getLatestRunnableAIAction,
  readAIActionRegistry,
  recordAIActionContract,
  recordAIActionExecution,
} from '../../core/aiActionRegistry';
import {
  buildIncidentStudioEvidenceContext,
  renderIncidentStudioEvidencePrompt,
} from '../../core/incidentStudioEvidenceContext';
import {
  captureAIActionPreflightSnapshot,
  compareAIActionPreflightSnapshots,
} from '../../core/aiActionSafety';
import { askConfiguredAIProvider, getAIProviderStatus } from '../../core/aiProviderService';
import { isStudioActionId } from '../../core/studioActionCommands';

interface AIActionEvidenceMetadata {
  path: string;
  sha256: string;
  sizeBytes: number;
}

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
  private readonly _logger = Logger.getInstance();

  public static createOrShow(
    extensionContext: vscode.ExtensionContext,
    workspaceContext?: WorkspaceContext
  ) {
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
      (message) => {
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

    const resolvedEvidence = path.isAbsolute(evidencePath)
      ? evidencePath
      : path.join(workspacePath, evidencePath);

    try {
      const fileUri = vscode.Uri.file(resolvedEvidence);
      await vscode.commands.executeCommand('revealFileInOS', fileUri);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to reveal evidence path: ${error instanceof Error ? error.message : String(error)}`
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

    const seed = {
      source: 'incident-studio-vnext',
      trigger: actionId,
      workspace: {
        path: this._workspaceContext.workspacePath,
        name: this._workspaceContext.workspaceName,
      },
    };

    try {
      this._runningStudioActionId = actionId;
      this._postStudioActionStatus(actionId, 'started');
      switch (actionId) {
        case 'run-analyze':
        case 'verify-gates':
          await runWorkspaceAnalyze(this._workspaceContext);
          await this._refreshStudioState(actionId);
          {
            const { report } = loadAnalyzeReport(this._workspaceContext);
            const registry = await readAIActionRegistry(this._workspaceContext.workspacePath);
            this._postStudioActionStatus(
              actionId,
              'completed',
              undefined,
              this._buildStudioActionResult({ actionId, report, registry })
            );
          }
          return;
        case 'terminal-bridge':
          await vscode.commands.executeCommand('workspai.aiTerminalBridge', seed);
          await this._refreshStudioState(actionId);
          {
            const { report } = loadAnalyzeReport(this._workspaceContext);
            const registry = await readAIActionRegistry(this._workspaceContext.workspacePath);
            this._postStudioActionStatus(
              actionId,
              'completed',
              undefined,
              this._buildStudioActionResult({ actionId, report, registry })
            );
          }
          return;
        case 'fix-lens':
          await vscode.commands.executeCommand('workspai.aiFixPreviewLite', {
            ...seed,
            seed: 'Use the current workspace evidence and selected editor context to produce a fix lens. Do not apply changes.',
          });
          await this._refreshStudioState(actionId);
          {
            const { report } = loadAnalyzeReport(this._workspaceContext);
            const registry = await readAIActionRegistry(this._workspaceContext.workspacePath);
            this._postStudioActionStatus(
              actionId,
              'completed',
              undefined,
              this._buildStudioActionResult({ actionId, report, registry })
            );
          }
          return;
        case 'impact-lens':
          await vscode.commands.executeCommand('workspai.aiChangeImpactLite', {
            ...seed,
            seed: 'Use the current workspace evidence and selected editor context to produce an impact lens. Do not apply changes.',
          });
          await this._refreshStudioState(actionId);
          {
            const { report } = loadAnalyzeReport(this._workspaceContext);
            const registry = await readAIActionRegistry(this._workspaceContext.workspacePath);
            this._postStudioActionStatus(
              actionId,
              'completed',
              undefined,
              this._buildStudioActionResult({ actionId, report, registry })
            );
          }
          return;
        default:
          actionId satisfies never;
      }
    } catch (error) {
      this._postStudioActionStatus(
        actionId,
        'failed',
        error instanceof Error ? error.message : String(error),
        this._buildStudioActionResult({
          actionId,
          report: loadAnalyzeReport(this._workspaceContext).report,
          fallbackSummary: error instanceof Error ? error.message : String(error),
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
    const label = actionId.replace(/-/g, ' ');
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
  }): Record<string, unknown> {
    const latestEntry = params.registry?.entries[0];
    const latestExecution = latestEntry?.executions[0];
    const report = params.report || null;
    const summary =
      params.fallbackSummary ||
      latestExecution?.summary ||
      (report
        ? `Analyze ${report.summary.verdict} · score ${report.summary.score}`
        : `Studio action ${params.actionId.replace(/-/g, ' ')}`);
    const failedCommands = latestExecution?.failedCommands || [];
    return {
      summary,
      verdict: report?.summary.verdict,
      score: report?.summary.score,
      generatedAt: report?.generatedAt,
      evidencePath:
        latestExecution?.evidencePath ||
        report?.enterpriseControls?.evidencePath ||
        (report ? getAnalyzeReportPath(this._workspaceContext.workspacePath) : undefined),
      evidenceSha256: latestExecution?.evidenceSha256,
      evidenceSizeBytes: latestExecution?.evidenceSizeBytes,
      commandCount: latestExecution?.commandCount,
      failedCommandCount:
        latestExecution?.failedCommandCount ??
        (failedCommands.length > 0 ? failedCommands.length : undefined),
      failedCommands,
      findings: report?.summary.findings,
      registryUpdatedAt: params.registry?.updatedAt,
    };
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
    const requestedActionId =
      typeof data === 'object' && data !== null && 'actionId' in data
        ? String((data as any).actionId || '')
        : '';
    const summary =
      typeof data === 'object' && data !== null && 'summary' in data
        ? String((data as any).summary || this._latestAIActionContract?.summary || 'AI action')
        : this._latestAIActionContract?.summary || 'AI action';
    const riskLevel =
      typeof data === 'object' && data !== null && 'riskLevel' in data
        ? String((data as any).riskLevel || this._latestAIActionContract?.riskLevel || 'unknown')
        : this._latestAIActionContract?.riskLevel || 'unknown';
    const confidence =
      typeof data === 'object' && data !== null && 'confidence' in data
        ? Number((data as any).confidence)
        : this._latestAIActionContract?.confidence;

    if (operation !== 'apply' && operation !== 'verify' && operation !== 'rollback') {
      vscode.window.showWarningMessage(`Unknown AI action operation: ${operation || 'missing'}`);
      return;
    }
    if (!this._latestAIActionContract) {
      vscode.window.showWarningMessage('No AI action contract is available yet.');
      return;
    }
    if (!this._latestAIActionId) {
      vscode.window.showWarningMessage('No persisted AI action record is available yet.');
      return;
    }
    if (requestedActionId && requestedActionId !== this._latestAIActionId) {
      vscode.window.showWarningMessage('The selected AI action is no longer the active action.');
      return;
    }

    this._postStudioActionStatus(`ai-action-${operation}`, 'started');

    const registryBeforeRun = await readAIActionRegistry(this._workspaceContext.workspacePath);
    const activeEntry = registryBeforeRun.entries.find(
      (entry) => entry.id === this._latestAIActionId
    );
    if (!activeEntry) {
      this._postStudioActionStatus(
        `ai-action-${operation}`,
        'failed',
        'The persisted AI action record could not be found.'
      );
      vscode.window.showWarningMessage('The persisted AI action record could not be found.');
      return;
    }

    if (operation === 'apply' || operation === 'rollback') {
      const currentPreflight = await captureAIActionPreflightSnapshot(
        this._workspaceContext.workspacePath,
        this._latestAIActionContract
      );
      const preflight = compareAIActionPreflightSnapshots(activeEntry.preflight, currentPreflight);
      if (preflight.stale) {
        const registry = await recordAIActionExecution(
          this._workspaceContext.workspacePath,
          this._latestAIActionId,
          {
            operation: operation as AIActionOperation,
            ok: false,
            summary: `Preflight blocked ${operation}: ${preflight.issues.join('; ')}`,
            evidencePath: null,
            commandCount: 0,
            failedCommandCount: 0,
            failedCommands: [],
            preflight,
          }
        );
        this._postAIActionRegistry(registry);
        this._postStudioActionStatus(
          `ai-action-${operation}`,
          'failed',
          `Preflight blocked ${operation}.`,
          this._buildStudioActionResult({
            actionId: `ai-action-${operation}`,
            registry,
            fallbackSummary: `Preflight blocked ${operation}.`,
          })
        );
        this._panel.webview.postMessage({
          command: 'studioAssistantMessage',
          data: {
            role: 'assistant',
            content: [
              `AI action ${operation}: BLOCKED`,
              'Preflight detected stale workspace state.',
              ...preflight.issues.map((issue) => `- ${issue}`),
            ].join('\n'),
            provider: 'ai-action-preflight',
          },
        });
        return;
      }
    }

    if (operation === 'apply' || operation === 'rollback') {
      const label = operation === 'apply' ? 'Apply AI Action' : 'Run Rollback';
      const commandCount =
        operation === 'apply'
          ? this._latestAIActionContract.proposedCommands.length +
            this._latestAIActionContract.verificationCommands.length
          : this._latestAIActionContract.rollbackPlan.length;
      const approval = await vscode.window.showWarningMessage(
        [
          `${label}: ${summary}`,
          `Risk: ${riskLevel}`,
          Number.isFinite(confidence) ? `Confidence: ${Math.round(Number(confidence) * 100)}%` : '',
          `Commands: ${commandCount}`,
          'Only validated, allowlisted commands from the latest persisted contract will run.',
        ]
          .filter(Boolean)
          .join('\n'),
        { modal: true },
        label
      );
      if (approval !== label) {
        this._postStudioActionStatus(
          `ai-action-${operation}`,
          'failed',
          `${operation} was cancelled before execution.`
        );
        return;
      }
    }

    try {
      const result = await runAIActionContractOperation(this._latestAIActionContract, {
        operation: operation as AIActionOperation,
        workspacePath: this._workspaceContext.workspacePath,
      });
      const evidence = await this._writeAIActionEvidence(
        this._latestAIActionContract,
        this._latestAIActionId,
        result
      );
      const registry = await recordAIActionExecution(
        this._workspaceContext.workspacePath,
        this._latestAIActionId,
        {
          operation: result.operation,
          ok: result.ok,
          summary: result.summary,
          evidencePath: evidence?.path,
          evidenceSha256: evidence?.sha256,
          evidenceSizeBytes: evidence?.sizeBytes,
          commandCount: result.commands.length,
          failedCommandCount: result.commands.filter((command) => command.exitCode !== 0).length,
          failedCommands: result.commands
            .filter((command) => command.exitCode !== 0)
            .map((command) => command.command)
            .slice(0, 5),
        }
      );
      const commandSummary = result.commands
        .map((command) => `- ${command.exitCode === 0 ? 'PASS' : 'FAIL'} ${command.command}`)
        .join('\n');

      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: [
            `AI action ${result.operation}: ${result.ok ? 'PASS' : 'FAIL'}`,
            result.summary,
            evidence
              ? `Evidence: ${evidence.path}\nSHA256: ${evidence.sha256}`
              : 'Evidence: unavailable',
            commandSummary || 'No command execution was required.',
          ].join('\n\n'),
          provider: 'ai-action-executor',
        },
      });
      this._postAIActionRegistry(registry);
      this._handleCheckReportExists();
      this._handleLoadReport();
      this._postStudioActionStatus(
        `ai-action-${operation}`,
        'completed',
        undefined,
        this._buildStudioActionResult({
          actionId: `ai-action-${operation}`,
          report: loadAnalyzeReport(this._workspaceContext).report,
          registry,
          fallbackSummary: result.summary,
        })
      );
    } catch (error) {
      this._postStudioActionStatus(
        `ai-action-${operation}`,
        'failed',
        error instanceof Error ? error.message : String(error),
        this._buildStudioActionResult({
          actionId: `ai-action-${operation}`,
          report: loadAnalyzeReport(this._workspaceContext).report,
          fallbackSummary: error instanceof Error ? error.message : String(error),
        })
      );
      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: `AI action operation blocked: ${
            error instanceof Error ? error.message : String(error)
          }`,
          provider: 'ai-action-executor',
        },
      });
    }
  }

  private async _writeAIActionEvidence(
    contract: AIActionContract,
    actionId: string,
    result: AIActionExecutionResult
  ): Promise<AIActionEvidenceMetadata | null> {
    if (!this._workspaceContext.workspacePath) {
      return null;
    }

    try {
      const evidenceDir = path.join(
        this._workspaceContext.workspacePath,
        '.workspai',
        'evidence',
        'ai-actions'
      );
      await fs.mkdir(evidenceDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const evidencePath = path.join(evidenceDir, `${stamp}-${result.operation}.json`);
      await fs.writeFile(
        evidencePath,
        JSON.stringify(
          {
            schemaVersion: 'workspai.ai-action-evidence.v1',
            generatedAt: new Date().toISOString(),
            workspace: this._workspaceContext,
            actionId,
            contract,
            result,
            redactionApplied: true,
          },
          null,
          2
        ),
        'utf8'
      );
      const content = await fs.readFile(evidencePath);
      return {
        path: evidencePath,
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        sizeBytes: content.byteLength,
      };
    } catch (error) {
      this._logger.warn('Unable to write AI action evidence', error);
      return null;
    }
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
      data: {
        updatedAt: registry.updatedAt,
        entries: registry.entries.map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          provider: entry.provider,
          summary: entry.contract.summary,
          actionType: entry.contract.actionType,
          riskLevel: entry.contract.riskLevel,
          validationStatus: entry.validation.status,
          lifecycleStatus: entry.lifecycleStatus,
          executions: entry.executions,
        })),
      },
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
      const parsedAction = parseAIActionContractFromText(text);
      const validation = validateAIActionContract(parsedAction.contract, {
        workspacePath: this._workspaceContext.workspacePath || process.cwd(),
        strict: true,
      });
      let actionId: string | null = null;
      if (parsedAction.contract && this._workspaceContext.workspacePath) {
        const entry = await recordAIActionContract(this._workspaceContext.workspacePath, {
          contract: parsedAction.contract,
          validation,
          provider,
          rawJson: parsedAction.rawJson,
        });
        actionId = entry.id;
        this._postAIActionRegistry(
          await readAIActionRegistry(this._workspaceContext.workspacePath)
        );
      }
      this._latestAIActionContract =
        parsedAction.contract && validation.status !== 'blocked' ? parsedAction.contract : null;
      this._latestAIActionId =
        parsedAction.contract && validation.status !== 'blocked' ? actionId : null;

      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: text,
          provider,
        },
      });

      if (parsedAction.rawJson || parsedAction.contract) {
        this._panel.webview.postMessage({
          command: 'studioActionContract',
          data: {
            actionId,
            contract: parsedAction.contract,
            validation,
            parseError: parsedAction.parseError,
            rawJson: parsedAction.rawJson,
            provider,
          },
        });
      }
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
    // Get the path to dist assets
    const baseUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incident Studio (Next)</title>
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
    <script>
        window.INCIDENT_STUDIO_WORKSPACE_PATH = '${this._escapeHtml(this._workspaceContext.workspacePath)}';
        window.INCIDENT_STUDIO_WORKSPACE_NAME = '${this._escapeHtml(this._workspaceContext.workspaceName)}';
    </script>
    <script type="module" src="${baseUri}/incident-studio-next.js"></script>
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
