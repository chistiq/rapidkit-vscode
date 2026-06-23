import * as vscode from 'vscode';
import path from 'path';

import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';
import {
  execRapidkitExecutionPlan,
  resolveRapidkitExecutionPlan,
} from '../../core/incidentInlineCommandRunner';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { resolveStudioMutationBlockReason } from './incidentStudioMutationGate';
import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import type { IncidentStudioExecutionTranscript } from './incidentStudioSessionPersistenceBridge';

export type RunIncidentInlineCommandOptions = {
  command: string;
  workspacePath: string;
  projectPath?: string;
  requestId?: string;
  actionId?: string;
  cliActionId?: string;
  telemetryMetadata?: Record<string, unknown>;
};

export type RunIncidentInlineCommandResult = {
  command: string;
  success: boolean;
  output?: string;
  error?: string;
  executionTranscript?: IncidentStudioExecutionTranscript;
};

const MUTATING_RAPIDKIT_CLI_COMMAND =
  /(?:\bdoctor\b[^\n]*--fix\b|\bworkspace\s+sync\b|\bworkspace\s+run\s+init\b|\bworkspace\s+archive\b|\bautopilot\s+release\b|\binit\b|\bbuild\b|\bdev\b)/i;

export type ParsedIncidentInlineCommandPayload = {
  command: string;
  workspacePath?: string;
  projectPath?: string;
  cliActionId?: string;
};

export function parseIncidentInlineCommandPayload(
  payload: unknown
): ParsedIncidentInlineCommandPayload {
  const record =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  return {
    command: typeof record.command === 'string' ? record.command.trim() : '',
    workspacePath:
      typeof record.workspacePath === 'string' && record.workspacePath.trim()
        ? record.workspacePath.trim()
        : undefined,
    projectPath:
      typeof record.projectPath === 'string' && record.projectPath.trim()
        ? record.projectPath.trim()
        : undefined,
    cliActionId:
      typeof record.cliActionId === 'string' && record.cliActionId.trim()
        ? record.cliActionId.trim()
        : undefined,
  };
}

export function isMutatingRapidkitCliCommand(command: string): boolean {
  const parsed = parseIncidentInlineCommandPayload({ command });
  if (!parsed.command) {
    return false;
  }
  const normalized = parsed.command.replace(/\s+/g, ' ').trim().toLowerCase();
  if (
    !/(?:^|\s)rapidkit\b/.test(normalized) &&
    !/^(doctor|readiness|pipeline|workspace|analyze|autopilot|init|test|build|dev|shell)\b/.test(
      normalized
    )
  ) {
    return false;
  }
  return MUTATING_RAPIDKIT_CLI_COMMAND.test(normalized);
}

export type DispatchIncidentStudioInlineCommandInput = {
  payload: unknown;
  webview: vscode.Webview;
  requestId?: string;
  resolveWorkspacePath: () => string | undefined;
  resolveProjectPath: () => string | undefined;
  resolveTelemetry?: (
    workspacePath: string
  ) => Promise<IncidentStudioTelemetryGateSlice | null | undefined>;
  enrichTelemetry?: (workspacePath: string) => Record<string, unknown>;
  onMissingCommand?: () => void;
  refreshStabilizationLoop?: () => Promise<void>;
};

export async function dispatchIncidentStudioInlineCommand(
  input: DispatchIncidentStudioInlineCommandInput
): Promise<void> {
  const parsed = parseIncidentInlineCommandPayload(input.payload);
  const workspacePath = parsed.workspacePath || input.resolveWorkspacePath()?.trim();
  const projectPath = parsed.projectPath || input.resolveProjectPath()?.trim();
  const inlineActionId =
    input.requestId && input.requestId.trim().length > 0
      ? `inline-${input.requestId.trim()}`
      : `inline-${Date.now().toString(36)}`;

  if (!parsed.command) {
    input.onMissingCommand?.();
    return;
  }

  if (!workspacePath) {
    await postIncidentInlineCommandResult(
      input.webview,
      {
        command: parsed.command,
        success: false,
        error: 'No workspace selected. Open a workspace first.',
      },
      input.requestId
    );
    return;
  }

  if (isMutatingRapidkitCliCommand(parsed.command) && input.resolveTelemetry) {
    const telemetry = await input.resolveTelemetry(workspacePath);
    const mutationBlockReason = resolveStudioMutationBlockReason(telemetry);
    if (mutationBlockReason) {
      await postIncidentInlineCommandResult(
        input.webview,
        {
          command: parsed.command,
          success: false,
          error: mutationBlockReason,
        },
        input.requestId
      );
      return;
    }
  }

  const result = await runIncidentInlineCommand({
    command: parsed.command,
    workspacePath,
    projectPath,
    requestId: input.requestId,
    actionId: inlineActionId,
    cliActionId: parsed.cliActionId,
    telemetryMetadata: input.enrichTelemetry?.(workspacePath),
  });
  await postIncidentInlineCommandResult(input.webview, result, input.requestId);
  if (input.refreshStabilizationLoop) {
    await input.refreshStabilizationLoop();
  }
}

function isWorkspacePathAncestor(workspacePath: string | undefined, childPath?: string): boolean {
  if (!workspacePath || !childPath) {
    return false;
  }
  const normalizedWorkspace = path.resolve(workspacePath);
  const normalizedChild = path.resolve(childPath);
  return (
    normalizedChild === normalizedWorkspace ||
    normalizedChild.startsWith(`${normalizedWorkspace}${path.sep}`)
  );
}

export async function runIncidentInlineCommand(
  options: RunIncidentInlineCommandOptions
): Promise<RunIncidentInlineCommandResult> {
  const inlineCommand = options.command.trim();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const buildTranscript = (input: {
    success: boolean;
    exitCode?: number | null;
    cwd?: string;
    output?: string;
    error?: string;
  }): IncidentStudioExecutionTranscript => {
    const completedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    const status = input.success ? ('completed' as const) : ('failed' as const);
    const stepStatus = input.success ? ('passed' as const) : ('failed' as const);
    const outputPreview = input.output?.trim()
      ? input.output.trim().split('\n').slice(0, 12).join('\n').slice(0, 1800)
      : undefined;
    const stderrPreview = input.error?.trim()
      ? input.error.trim().split('\n').slice(0, 12).join('\n').slice(0, 1800)
      : undefined;

    return {
      schemaVersion: 'workspai.studio.execution-transcript.v1',
      id: `${options.actionId || 'inline-command'}-${completedAt.replace(/[:.]/g, '-')}`,
      actionId: options.actionId || 'inline-command',
      source: 'inline-command',
      title: 'Inline command',
      status,
      startedAt,
      completedAt,
      durationMs,
      commandCount: 1,
      failedCommandCount: input.success ? 0 : 1,
      steps: [
        {
          id: `${options.actionId || 'inline-command'}-step-1`,
          command: inlineCommand,
          status: stepStatus,
          exitCode: typeof input.exitCode === 'number' ? input.exitCode : (input.exitCode ?? null),
          startedAt,
          completedAt,
          durationMs,
          cwd: input.cwd,
          stdoutPreview: input.success ? outputPreview : undefined,
          stderrPreview: input.success ? undefined : stderrPreview,
          failureReason: input.success ? undefined : stderrPreview || input.error,
        },
      ],
    };
  };
  if (!inlineCommand) {
    return {
      command: inlineCommand,
      success: false,
      error: 'No command provided to run.',
      executionTranscript: buildTranscript({
        success: false,
        error: 'No command provided to run.',
      }),
    };
  }
  if (!options.workspacePath.trim()) {
    return {
      command: inlineCommand,
      success: false,
      error: 'No workspace selected. Open a workspace first.',
      executionTranscript: buildTranscript({
        success: false,
        error: 'No workspace selected. Open a workspace first.',
      }),
    };
  }

  const workspacePath = options.workspacePath.trim();
  const projectPath = options.projectPath?.trim();
  const projectBelongsToWorkspace = isWorkspacePathAncestor(workspacePath, projectPath);
  const inlineActionId = options.actionId || `inline-${Date.now().toString(36)}`;
  const inlineScopeProps = projectPath && projectBelongsToWorkspace ? { projectPath } : {};

  try {
    const executionPlan = await resolveRapidkitExecutionPlan({
      command: inlineCommand,
      workspacePath,
      projectPath,
      projectBelongsToWorkspace,
    });
    if ('error' in executionPlan) {
      return {
        command: inlineCommand,
        success: false,
        error: executionPlan.error,
        executionTranscript: buildTranscript({
          success: false,
          error: executionPlan.error,
        }),
      };
    }

    const result = await execRapidkitExecutionPlan(executionPlan);
    const effectiveCwd = executionPlan.cwd;

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    const output = combinedOutput || 'Command completed with no output.';
    const truncatedOutput = output.split('\n').slice(0, 30).join('\n');
    const success = result.exitCode === 0;
    const tracker = WorkspaceUsageTracker.getInstance();
    const telemetryBase = {
      actionId: inlineActionId,
      actionType: 'inline-command',
      command: inlineCommand.slice(0, 180),
      ...(options.cliActionId ? { cliActionId: options.cliActionId } : {}),
      ...(options.telemetryMetadata || {}),
    };

    await tracker.trackCommandEvent('workspai.studio.action_executed', workspacePath, {
      ...telemetryBase,
      projectScoped: !!projectPath && projectBelongsToWorkspace && effectiveCwd === projectPath,
      success,
      exitCode: result.exitCode,
      ...inlineScopeProps,
    });

    await tracker.trackCommandEvent(
      success ? 'workspai.studio.verify_passed' : 'workspai.studio.verify_failed',
      workspacePath,
      {
        ...telemetryBase,
        exitCode: result.exitCode,
        verifyReady: success,
        verifyRequired: true,
        verifyPathPresent: success,
        verifyPathReason: success ? 'command_success' : 'command_failed',
        ...inlineScopeProps,
      }
    );

    return {
      command: inlineCommand,
      success,
      output: success ? truncatedOutput : undefined,
      error: !success ? `Exit ${result.exitCode}: ${truncatedOutput}` : undefined,
      executionTranscript: buildTranscript({
        success,
        exitCode: result.exitCode,
        cwd: effectiveCwd,
        output: success ? truncatedOutput : undefined,
        error: !success ? `Exit ${result.exitCode}: ${truncatedOutput}` : undefined,
      }),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const tracker = WorkspaceUsageTracker.getInstance();
    const telemetryBase = {
      actionId: inlineActionId,
      actionType: 'inline-command',
      command: inlineCommand.slice(0, 180),
      ...(options.cliActionId ? { cliActionId: options.cliActionId } : {}),
      ...(options.telemetryMetadata || {}),
    };

    await tracker.trackCommandEvent('workspai.studio.action_executed', workspacePath, {
      ...telemetryBase,
      success: false,
      error: String(errorMsg).slice(0, 180),
      ...inlineScopeProps,
    });
    await tracker.trackCommandEvent('workspai.studio.verify_failed', workspacePath, {
      ...telemetryBase,
      error: String(errorMsg).slice(0, 180),
      verifyReady: false,
      verifyRequired: true,
      verifyPathPresent: false,
      verifyPathReason: 'command_exception',
      ...inlineScopeProps,
    });
    return {
      command: inlineCommand,
      success: false,
      error: errorMsg,
      executionTranscript: buildTranscript({
        success: false,
        cwd: workspacePath,
        error: errorMsg,
      }),
    };
  }
}

export async function postIncidentInlineCommandResult(
  webview: vscode.Webview,
  result: RunIncidentInlineCommandResult,
  requestId?: string
): Promise<void> {
  webview.postMessage(
    createExtensionWebviewMessage('runIncidentInlineCommandDone', result, {
      requestId,
      version: 'v1',
    })
  );
}
