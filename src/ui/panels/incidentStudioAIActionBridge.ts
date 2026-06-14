import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  AIActionContract,
  AIActionOperation,
  AIActionValidationResult,
  parseAIActionContractFromText,
  validateAIActionContract,
  type ParsedAIActionContract,
} from '../../core/aiActionContract';
import {
  AIActionCommandResult,
  AIActionExecutionResult,
  runAIActionContractOperation,
} from '../../core/aiActionExecutor';
import {
  AIActionRegistry,
  getLatestRunnableAIAction,
  readAIActionRegistry,
  recordAIActionContract,
  recordAIActionExecution,
} from '../../core/aiActionRegistry';
import {
  captureAIActionPreflightSnapshot,
  compareAIActionPreflightSnapshots,
} from '../../core/aiActionSafety';
import {
  getAnalyzeReportPath,
  loadAnalyzeReport,
  type AnalyzeReport,
} from './incidentStudioAnalyze';
import { resolveStudioMutationBlockReason } from './incidentStudioMutationGate';
import { resolveIncidentStudioTelemetry } from './incidentStudioTelemetryBridge';
import {
  getStudioActionRegistryEntryById,
  isStudioActionId,
} from '../../core/studioActionCommands';
import type { IncidentStudioExecutionTranscript } from './incidentStudioSessionPersistenceBridge';

export type StudioAIActionEvidenceMetadata = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

export type StudioAIActionContractMessageData = {
  actionId: string | null;
  contract: AIActionContract | null;
  validation: AIActionValidationResult;
  parseError?: string;
  rawJson: string | null;
  provider: string;
};

export type PersistStudioAIActionContractResult = {
  actionId: string | null;
  contract: AIActionContract | null;
  validation: AIActionValidationResult;
  parsed: ParsedAIActionContract;
  registry: AIActionRegistry | null;
  activeContract: AIActionContract | null;
  activeActionId: string | null;
};

export function buildStudioAIActionResult(params: {
  actionId: string;
  status?: 'started' | 'completed' | 'failed';
  workspacePath: string;
  report?: AnalyzeReport | null;
  reportError?: string | null;
  registry?: AIActionRegistry | null;
  fallbackSummary?: string;
  gatePassed?: boolean;
  source?: 'studio-action' | 'ai-action' | 'ship-loop' | 'inline-command';
  executionTranscript?: IncidentStudioExecutionTranscript;
}): Record<string, unknown> {
  const latestEntry = params.registry?.entries[0];
  const latestExecution = latestEntry?.executions[0];
  const report = params.report || null;
  const actionDefinition = isStudioActionId(params.actionId)
    ? getStudioActionRegistryEntryById(params.actionId)
    : null;
  const summary =
    params.fallbackSummary ||
    latestExecution?.summary ||
    (report
      ? `Analyze ${report.summary.verdict} · score ${report.summary.score}`
      : params.reportError || `Studio action ${params.actionId.replace(/-/g, ' ')}`);
  const failedCommands = latestExecution?.failedCommands || [];
  const generatedAt =
    report?.generatedAt || latestExecution?.completedAt || new Date().toISOString();
  const evidencePath =
    latestExecution?.evidencePath ||
    report?.enterpriseControls?.evidencePath ||
    (report ? getAnalyzeReportPath(params.workspacePath) : undefined);
  const evidenceSha256 = latestExecution?.evidenceSha256;
  const commandCount = latestExecution?.commandCount ?? params.executionTranscript?.commandCount;
  const failedCommandCount =
    latestExecution?.failedCommandCount ??
    params.executionTranscript?.failedCommandCount ??
    (failedCommands.length > 0 ? failedCommands.length : undefined);

  return {
    summary,
    proofEvent: {
      schemaVersion: 'workspai.studio.proof-event.v1',
      actionId: params.actionId,
      actionTitle: actionDefinition?.title,
      status: params.status || (params.gatePassed === false ? 'failed' : 'completed'),
      summary,
      generatedAt,
      evidencePath,
      evidenceSha256,
      score: report?.summary.score,
      verdict: report?.summary.verdict,
      gatePassed: params.gatePassed,
      commandCount,
      failedCommandCount,
      executionTranscriptId: params.executionTranscript?.id,
      durationMs: params.executionTranscript?.durationMs,
      source: params.source || 'studio-action',
    },
    executionTranscript: params.executionTranscript,
    verdict: report?.summary.verdict,
    score: report?.summary.score,
    generatedAt,
    evidencePath,
    evidenceSha256,
    evidenceSizeBytes: latestExecution?.evidenceSizeBytes,
    commandCount,
    failedCommandCount,
    failedCommands,
    findings: report?.summary.findings,
    registryUpdatedAt: params.registry?.updatedAt,
  };
}

function outputPreview(value: string | undefined): string | undefined {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.split('\n').slice(0, 12).join('\n').slice(0, 1800);
}

function buildExecutionTranscriptFromAIResult(input: {
  actionId: string;
  title: string;
  source: 'ai-action';
  result: AIActionExecutionResult;
  evidence?: StudioAIActionEvidenceMetadata | null;
}): IncidentStudioExecutionTranscript {
  const steps = input.result.commands.map((command: AIActionCommandResult, index: number) => ({
    id: `${input.actionId}-${input.result.operation}-${index + 1}`,
    command: command.command,
    status: command.exitCode === 0 ? ('passed' as const) : ('failed' as const),
    exitCode: command.exitCode,
    startedAt: command.startedAt,
    completedAt: command.completedAt,
    durationMs: command.durationMs,
    cwd: command.cwd,
    stdoutPreview: outputPreview(command.stdout),
    stderrPreview: outputPreview(command.stderr),
    failureReason:
      command.exitCode === 0
        ? undefined
        : outputPreview(command.stderr) || `Command exited with code ${command.exitCode}.`,
  }));
  const startedAt = steps[0]?.startedAt || new Date().toISOString();
  const completedAt = steps[steps.length - 1]?.completedAt || startedAt;
  const durationMs = steps.reduce((total, step) => total + (step.durationMs || 0), 0);

  return {
    schemaVersion: 'workspai.studio.execution-transcript.v1',
    id: `${input.actionId}-${input.result.operation}-${completedAt.replace(/[:.]/g, '-')}`,
    actionId: input.actionId,
    source: input.source,
    title: input.title,
    status: input.result.ok ? 'completed' : 'failed',
    startedAt,
    completedAt,
    durationMs,
    commandCount: steps.length,
    failedCommandCount: steps.filter((step) => step.status === 'failed').length,
    steps,
    evidencePath: input.evidence?.path,
    evidenceSha256: input.evidence?.sha256,
  };
}

function buildStudioProofOnlyActionResult(params: {
  actionId: string;
  summary: string;
  status?: 'started' | 'completed' | 'failed';
  gatePassed?: boolean;
  source?: 'studio-action' | 'ai-action' | 'ship-loop' | 'inline-command';
}): Record<string, unknown> {
  return {
    summary: params.summary,
    proofEvent: {
      schemaVersion: 'workspai.studio.proof-event.v1',
      actionId: params.actionId,
      status: params.status || 'failed',
      summary: params.summary,
      generatedAt: new Date().toISOString(),
      gatePassed: params.gatePassed,
      source: params.source || 'ai-action',
    },
  };
}

export function formatAIActionRegistryWebviewPayload(registry: AIActionRegistry) {
  return {
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
  };
}

export function buildStudioActionContractMessageData(input: {
  actionId: string | null;
  contract: AIActionContract | null;
  validation: AIActionValidationResult;
  provider: string;
  parsed: ParsedAIActionContract;
}): StudioAIActionContractMessageData {
  return {
    actionId: input.actionId,
    contract: input.contract,
    validation: input.validation,
    parseError: input.parsed.parseError,
    rawJson: input.parsed.rawJson,
    provider: input.provider,
  };
}

export async function writeStudioAIActionEvidence(input: {
  workspacePath: string;
  workspaceName?: string;
  actionId: string;
  contract: AIActionContract;
  result: AIActionExecutionResult;
}): Promise<StudioAIActionEvidenceMetadata | null> {
  if (!input.workspacePath.trim()) {
    return null;
  }

  try {
    const evidenceDir = path.join(input.workspacePath, '.workspai', 'evidence', 'ai-actions');
    await fs.mkdir(evidenceDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const evidencePath = path.join(evidenceDir, `${stamp}-${input.result.operation}.json`);
    await fs.writeFile(
      evidencePath,
      JSON.stringify(
        {
          schemaVersion: 'workspai.ai-action-evidence.v1',
          generatedAt: new Date().toISOString(),
          workspace: {
            workspacePath: input.workspacePath,
            workspaceName: input.workspaceName,
          },
          actionId: input.actionId,
          contract: input.contract,
          result: input.result,
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
  } catch {
    return null;
  }
}

export async function persistStudioAIActionContractFromText(input: {
  workspacePath: string;
  text: string;
  provider: string;
}): Promise<PersistStudioAIActionContractResult> {
  const parsed = parseAIActionContractFromText(input.text);
  const validation = validateAIActionContract(parsed.contract, {
    workspacePath: input.workspacePath,
    strict: true,
  });

  let registry: AIActionRegistry | null = null;
  let actionId: string | null = null;

  if (parsed.contract && input.workspacePath.trim()) {
    const entry = await recordAIActionContract(input.workspacePath, {
      contract: parsed.contract,
      validation,
      provider: input.provider,
      rawJson: parsed.rawJson,
    });
    actionId = entry.id;
    registry = await readAIActionRegistry(input.workspacePath);
  }

  const latest = registry ? getLatestRunnableAIAction(registry) : null;
  const activeContract =
    parsed.contract && validation.status !== 'blocked' ? parsed.contract : latest?.contract || null;
  const activeActionId =
    parsed.contract && validation.status !== 'blocked' ? actionId : latest?.id || null;

  return {
    actionId,
    contract: parsed.contract,
    validation,
    parsed,
    registry,
    activeContract,
    activeActionId,
  };
}

export type ExecuteGovernedAIActionInput = {
  operation: AIActionOperation;
  requestedActionId?: string;
  workspacePath: string;
  workspaceName?: string;
  activeContract: AIActionContract | null;
  activeActionId: string | null;
};

export type ExecuteGovernedAIActionCallbacks = {
  postActionStatus: (
    actionId: string,
    status: 'started' | 'completed' | 'failed',
    detail?: string,
    result?: Record<string, unknown>
  ) => void;
  postAssistantMessage: (content: string, provider: string) => void;
  postRegistry: (registry: AIActionRegistry) => void;
  refreshReports?: () => void;
  assertNotRunning?: () => { ok: boolean; reason?: string };
  setRunning?: (operation: AIActionOperation | null) => void;
  refreshStabilizationLoop?: () => Promise<void>;
};

export async function executeGovernedAIActionOperation(
  context: vscode.ExtensionContext,
  input: ExecuteGovernedAIActionInput,
  callbacks: ExecuteGovernedAIActionCallbacks
): Promise<void> {
  const { operation, workspacePath, workspaceName } = input;
  const statusActionId = `ai-action-${operation}`;

  const runningGuard = callbacks.assertNotRunning?.();
  if (runningGuard && !runningGuard.ok) {
    const detail = runningGuard.reason || 'Another AI action is already running.';
    callbacks.postActionStatus(
      statusActionId,
      'failed',
      detail,
      buildStudioProofOnlyActionResult({
        actionId: statusActionId,
        summary: detail,
        gatePassed: false,
      })
    );
    vscode.window.showWarningMessage(detail);
    return;
  }

  callbacks.setRunning?.(operation);
  callbacks.postActionStatus(
    statusActionId,
    'started',
    undefined,
    buildStudioProofOnlyActionResult({
      actionId: statusActionId,
      summary: `AI action ${operation} started.`,
      status: 'started',
    })
  );

  try {
    if (!input.activeContract || !input.activeActionId) {
      const detail = 'No governed AI action contract is active yet.';
      callbacks.postActionStatus(
        statusActionId,
        'failed',
        detail,
        buildStudioProofOnlyActionResult({
          actionId: statusActionId,
          summary: detail,
          gatePassed: false,
        })
      );
      vscode.window.showWarningMessage(detail);
      return;
    }

    if (input.requestedActionId && input.requestedActionId !== input.activeActionId) {
      const detail = 'The selected AI action is no longer the active action.';
      callbacks.postActionStatus(
        statusActionId,
        'failed',
        detail,
        buildStudioProofOnlyActionResult({
          actionId: statusActionId,
          summary: detail,
          gatePassed: false,
        })
      );
      vscode.window.showWarningMessage(detail);
      return;
    }

    const registryBeforeRun = await readAIActionRegistry(workspacePath);
    const activeEntry = registryBeforeRun.entries.find(
      (entry) => entry.id === input.activeActionId
    );
    if (!activeEntry) {
      const detail = 'The persisted AI action record could not be found.';
      callbacks.postActionStatus(
        statusActionId,
        'failed',
        detail,
        buildStudioProofOnlyActionResult({
          actionId: statusActionId,
          summary: detail,
          gatePassed: false,
        })
      );
      vscode.window.showWarningMessage(detail);
      return;
    }

    if (operation === 'apply' && !activeEntry.validation.canApply) {
      const detail = 'Contract validation blocked apply for this action.';
      callbacks.postActionStatus(
        statusActionId,
        'failed',
        detail,
        buildStudioProofOnlyActionResult({
          actionId: statusActionId,
          summary: detail,
          gatePassed: false,
        })
      );
      callbacks.postAssistantMessage(
        [`AI action apply: BLOCKED`, detail].join('\n'),
        'ai-action-validation'
      );
      vscode.window.showWarningMessage(detail);
      return;
    }

    if (operation === 'verify' && !activeEntry.validation.canVerify) {
      const detail = 'Contract validation blocked verify for this action.';
      callbacks.postActionStatus(
        statusActionId,
        'failed',
        detail,
        buildStudioProofOnlyActionResult({
          actionId: statusActionId,
          summary: detail,
          gatePassed: false,
        })
      );
      callbacks.postAssistantMessage(
        [`AI action verify: BLOCKED`, detail].join('\n'),
        'ai-action-validation'
      );
      vscode.window.showWarningMessage(detail);
      return;
    }

    if (operation === 'rollback' && !activeEntry.validation.canRollback) {
      const detail = 'Contract validation blocked rollback for this action.';
      callbacks.postActionStatus(
        statusActionId,
        'failed',
        detail,
        buildStudioProofOnlyActionResult({
          actionId: statusActionId,
          summary: detail,
          gatePassed: false,
        })
      );
      callbacks.postAssistantMessage(
        [`AI action rollback: BLOCKED`, detail].join('\n'),
        'ai-action-validation'
      );
      vscode.window.showWarningMessage(detail);
      return;
    }

    if (operation === 'apply' || operation === 'rollback') {
      const currentPreflight = await captureAIActionPreflightSnapshot(
        workspacePath,
        input.activeContract
      );
      const preflight = compareAIActionPreflightSnapshots(activeEntry.preflight, currentPreflight);
      if (preflight.stale) {
        const registry = await recordAIActionExecution(workspacePath, input.activeActionId, {
          operation,
          ok: false,
          summary: `Preflight blocked ${operation}: ${preflight.issues.join('; ')}`,
          evidencePath: null,
          commandCount: 0,
          failedCommandCount: 0,
          failedCommands: [],
          preflight,
        });
        callbacks.postRegistry(registry);
        callbacks.postAssistantMessage(
          [
            `AI action ${operation}: BLOCKED`,
            'Preflight detected stale workspace state.',
            ...preflight.issues.map((issue) => `- ${issue}`),
          ].join('\n'),
          'ai-action-preflight'
        );
        callbacks.postActionStatus(
          statusActionId,
          'failed',
          `Preflight blocked ${operation}.`,
          buildStudioAIActionResult({
            actionId: statusActionId,
            workspacePath,
            registry,
            fallbackSummary: `Preflight blocked ${operation}.`,
            status: 'failed',
            gatePassed: false,
            source: 'ai-action',
          })
        );
        return;
      }
    }

    if (operation === 'apply' || operation === 'rollback') {
      const telemetry = await resolveIncidentStudioTelemetry({
        context,
        workspacePath,
      });
      const mutationBlockReason = resolveStudioMutationBlockReason(telemetry);
      if (mutationBlockReason) {
        const detail = mutationBlockReason;
        callbacks.postActionStatus(
          statusActionId,
          'failed',
          detail,
          buildStudioAIActionResult({
            actionId: statusActionId,
            workspacePath,
            report: loadAnalyzeReport({
              workspacePath,
              workspaceName: workspaceName ?? workspacePath,
            }).report,
            fallbackSummary: detail,
            status: 'failed',
            gatePassed: false,
            source: 'ai-action',
          })
        );
        callbacks.postAssistantMessage(
          [`AI action ${operation}: BLOCKED`, mutationBlockReason].join('\n'),
          'policy-gate-enforcement'
        );
        vscode.window.showWarningMessage(
          mutationBlockReason || 'Policy gates blocked this mutating Studio action.'
        );
        return;
      }

      const label = operation === 'apply' ? 'Apply AI Action' : 'Run Rollback';
      const contract = input.activeContract;
      const commandCount =
        operation === 'apply'
          ? contract.proposedCommands.length + contract.verificationCommands.length
          : contract.rollbackPlan.length;
      const approval = await vscode.window.showWarningMessage(
        [
          `${label}: ${contract.summary}`,
          `Risk: ${contract.riskLevel}`,
          `Confidence: ${Math.round(contract.confidence * 100)}%`,
          `Commands: ${commandCount}`,
          'Only validated, allowlisted commands from the latest persisted contract will run.',
        ].join('\n'),
        { modal: true },
        label
      );
      if (approval !== label) {
        callbacks.postActionStatus(
          statusActionId,
          'failed',
          `${operation} was cancelled before execution.`,
          buildStudioProofOnlyActionResult({
            actionId: statusActionId,
            summary: `${operation} was cancelled before execution.`,
            gatePassed: false,
          })
        );
        return;
      }
    }

    const result = await runAIActionContractOperation(input.activeContract, {
      operation,
      workspacePath,
    });
    const evidence = await writeStudioAIActionEvidence({
      workspacePath,
      workspaceName,
      actionId: input.activeActionId,
      contract: input.activeContract,
      result,
    });
    const executionTranscript = buildExecutionTranscriptFromAIResult({
      actionId: statusActionId,
      title: `AI action ${result.operation}`,
      source: 'ai-action',
      result,
      evidence,
    });
    const registry = await recordAIActionExecution(workspacePath, input.activeActionId, {
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
    });
    const commandSummary = result.commands
      .map((command) => `- ${command.exitCode === 0 ? 'PASS' : 'FAIL'} ${command.command}`)
      .join('\n');

    callbacks.postAssistantMessage(
      [
        `AI action ${result.operation}: ${result.ok ? 'PASS' : 'FAIL'}`,
        result.summary,
        evidence
          ? `Evidence: ${evidence.path}\nSHA256: ${evidence.sha256}`
          : 'Evidence: unavailable',
        commandSummary || 'No command execution was required.',
      ].join('\n\n'),
      'ai-action-executor'
    );
    callbacks.postRegistry(registry);
    callbacks.refreshReports?.();
    callbacks.postActionStatus(
      statusActionId,
      result.ok ? 'completed' : 'failed',
      undefined,
      buildStudioAIActionResult({
        actionId: statusActionId,
        workspacePath,
        report: loadAnalyzeReport({
          workspacePath,
          workspaceName: workspaceName ?? workspacePath,
        }).report,
        registry,
        fallbackSummary: result.summary,
        status: result.ok ? 'completed' : 'failed',
        gatePassed: result.ok,
        source: 'ai-action',
        executionTranscript,
      })
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    callbacks.postActionStatus(
      statusActionId,
      'failed',
      detail,
      buildStudioAIActionResult({
        actionId: statusActionId,
        workspacePath,
        report: loadAnalyzeReport({
          workspacePath,
          workspaceName: workspaceName ?? workspacePath,
        }).report,
        fallbackSummary: detail,
        status: 'failed',
        gatePassed: false,
        source: 'ai-action',
      })
    );
    callbacks.postAssistantMessage(`AI action operation blocked: ${detail}`, 'ai-action-executor');
    vscode.window.showErrorMessage(`AI action operation failed: ${detail}`);
  } finally {
    callbacks.setRunning?.(null);
    await callbacks.refreshStabilizationLoop?.();
  }
}

export async function publishStudioAIActionContractFromText(input: {
  workspacePath: string;
  text: string;
  provider: string;
  postMessage: (command: string, data?: unknown) => void;
}): Promise<PersistStudioAIActionContractResult> {
  const persisted = await persistStudioAIActionContractFromText(input);

  if (persisted.parsed.rawJson || persisted.parsed.contract) {
    input.postMessage(
      'studioActionContract',
      buildStudioActionContractMessageData({
        actionId: persisted.actionId,
        contract: persisted.contract,
        validation: persisted.validation,
        provider: input.provider,
        parsed: persisted.parsed,
      })
    );
  }

  if (persisted.registry) {
    input.postMessage(
      'aiActionRegistryLoaded',
      formatAIActionRegistryWebviewPayload(persisted.registry)
    );
  }

  return persisted;
}
