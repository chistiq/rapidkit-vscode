import * as vscode from 'vscode';

import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';
import type { StudioActionId } from '../../core/studioActionCommands';
import type { WorkspaceContext } from './incidentStudioAnalyze';
import { executeStudioActionById } from './incidentStudioActionBridge';
import { resolveStudioMutationBlockReason } from './incidentStudioMutationGate';
import {
  dispatchIncidentStudioInlineCommand,
  runIncidentInlineCommand,
} from './incidentStudioInlineCommandBridge';
import { resolveIncidentStudioTelemetry } from './incidentStudioTelemetryBridge';
import { refreshIncidentStudioStabilizationLoop } from './incidentStudioStabilizationLoopBridge';
import { postIncidentStudioShipEvidence } from './incidentStudioShipEvidenceBridge';
import type { IncidentStudioExecutionTranscript } from './incidentStudioSessionPersistenceBridge';

export type ShipLoopStepId =
  | 'analyze'
  | 'verify-gates'
  | 'readiness'
  | 'archive'
  | 'autopilot-release';

export type ShipLoopStepExecutionKind = 'studio-action' | 'inline-command';

export type ShipLoopStepDefinition = {
  id: ShipLoopStepId;
  kind: ShipLoopStepExecutionKind;
  studioActionId?: StudioActionId;
  inlineCommand?: string;
  mutating?: boolean;
};

export const SHIP_LOOP_STEP_DEFINITIONS: Record<ShipLoopStepId, ShipLoopStepDefinition> = {
  analyze: {
    id: 'analyze',
    kind: 'studio-action',
    studioActionId: 'run-analyze',
  },
  'verify-gates': {
    id: 'verify-gates',
    kind: 'studio-action',
    studioActionId: 'verify-gates',
  },
  readiness: {
    id: 'readiness',
    kind: 'inline-command',
    inlineCommand: 'npx rapidkit readiness --json',
  },
  archive: {
    id: 'archive',
    kind: 'inline-command',
    inlineCommand: 'npx rapidkit workspace archive',
    mutating: true,
  },
  'autopilot-release': {
    id: 'autopilot-release',
    kind: 'inline-command',
    inlineCommand: 'npx rapidkit autopilot release',
    mutating: true,
  },
};

export const SHIP_LOOP_STUDIO_ACTIONS = new Set(['analyze', 'verify-gates']);

export function shouldRefreshShipLoopAfterStep(stepId: ShipLoopStepId): boolean {
  return stepId in SHIP_LOOP_STEP_DEFINITIONS;
}

export type DispatchIncidentStudioShipLoopStepInput = {
  stepId: ShipLoopStepId;
  webview: vscode.Webview;
  context: vscode.ExtensionContext;
  workspace: WorkspaceContext;
  projectPath?: string;
  requestId?: string;
  seed?: Record<string, unknown>;
};

export type DispatchIncidentStudioShipLoopStepResult = {
  stepId: ShipLoopStepId;
  success: boolean;
  summary?: string;
  error?: string;
  proofEvent?: {
    schemaVersion: 'workspai.studio.proof-event.v1';
    actionId: string;
    status: 'completed' | 'failed';
    summary: string;
    generatedAt: string;
    evidencePath?: string | null;
    evidenceSha256?: string | null;
    gatePassed?: boolean;
    executionTranscriptId?: string;
    durationMs?: number;
    source: 'ship-loop';
  };
  executionTranscript?: IncidentStudioExecutionTranscript;
};

function buildShipLoopProofEvent(input: {
  stepId: ShipLoopStepId;
  success: boolean;
  summary?: string;
  error?: string;
  evidencePath?: string | null;
  evidenceSha256?: string | null;
  executionTranscript?: IncidentStudioExecutionTranscript;
}): DispatchIncidentStudioShipLoopStepResult['proofEvent'] {
  const summary =
    input.summary ||
    input.error ||
    `Ship loop step ${input.stepId} ${input.success ? 'completed' : 'failed'}.`;
  return {
    schemaVersion: 'workspai.studio.proof-event.v1',
    actionId: `ship-loop-${input.stepId}`,
    status: input.success ? 'completed' : 'failed',
    summary,
    generatedAt: new Date().toISOString(),
    evidencePath: input.evidencePath,
    evidenceSha256: input.evidenceSha256,
    gatePassed: input.success,
    executionTranscriptId: input.executionTranscript?.id,
    durationMs: input.executionTranscript?.durationMs,
    source: 'ship-loop',
  };
}

export async function dispatchIncidentStudioShipLoopStep(
  input: DispatchIncidentStudioShipLoopStepInput
): Promise<DispatchIncidentStudioShipLoopStepResult> {
  const definition = SHIP_LOOP_STEP_DEFINITIONS[input.stepId];
  if (!definition) {
    return {
      stepId: input.stepId,
      success: false,
      error: `Unknown ship loop step: ${input.stepId}`,
      proofEvent: buildShipLoopProofEvent({
        stepId: input.stepId,
        success: false,
        error: `Unknown ship loop step: ${input.stepId}`,
      }),
    };
  }

  const telemetry = await resolveIncidentStudioTelemetry({
    context: input.context,
    workspacePath: input.workspace.workspacePath,
    projectPath: input.projectPath,
  });

  if (definition.mutating) {
    const mutationBlockReason = resolveStudioMutationBlockReason(telemetry);
    if (mutationBlockReason) {
      return {
        stepId: input.stepId,
        success: false,
        error: mutationBlockReason,
        proofEvent: buildShipLoopProofEvent({
          stepId: input.stepId,
          success: false,
          error: mutationBlockReason,
        }),
      };
    }
  }

  try {
    if (definition.kind === 'studio-action' && definition.studioActionId) {
      const { actionResult } = await executeStudioActionById(
        input.context,
        input.workspace,
        definition.studioActionId,
        input.seed ?? {}
      );
      await refreshShipLoopSurfaces(input);
      const success = actionResult?.gatePassed !== false;
      return {
        stepId: input.stepId,
        success,
        summary: actionResult?.summary,
        error: success ? undefined : actionResult?.summary,
        executionTranscript: actionResult?.executionTranscript
          ? {
              ...actionResult.executionTranscript,
              actionId: `ship-loop-${input.stepId}`,
              source: 'ship-loop',
              title: `Ship loop ${input.stepId}`,
            }
          : undefined,
        proofEvent: buildShipLoopProofEvent({
          stepId: input.stepId,
          success,
          summary: actionResult?.summary,
          error: success ? undefined : actionResult?.summary,
          evidencePath: actionResult?.evidencePath,
          executionTranscript: actionResult?.executionTranscript
            ? {
                ...actionResult.executionTranscript,
                actionId: `ship-loop-${input.stepId}`,
                source: 'ship-loop',
                title: `Ship loop ${input.stepId}`,
              }
            : undefined,
        }),
      };
    }

    if (definition.kind === 'inline-command' && definition.inlineCommand) {
      const result = await runIncidentInlineCommand({
        command: definition.inlineCommand,
        workspacePath: input.workspace.workspacePath,
        projectPath: input.projectPath,
        requestId: input.requestId,
        actionId: `ship-loop-${input.stepId}`,
        telemetryMetadata: { source: 'incident_studio_ship_loop', stepId: input.stepId },
      });
      await refreshShipLoopSurfaces(input);
      return {
        stepId: input.stepId,
        success: result.success,
        summary: result.output,
        error: result.error,
        executionTranscript: result.executionTranscript
          ? {
              ...result.executionTranscript,
              actionId: `ship-loop-${input.stepId}`,
              source: 'ship-loop',
              title: `Ship loop ${input.stepId}`,
            }
          : undefined,
        proofEvent: buildShipLoopProofEvent({
          stepId: input.stepId,
          success: result.success,
          summary: result.output,
          error: result.error,
          executionTranscript: result.executionTranscript
            ? {
                ...result.executionTranscript,
                actionId: `ship-loop-${input.stepId}`,
                source: 'ship-loop',
                title: `Ship loop ${input.stepId}`,
              }
            : undefined,
        }),
      };
    }

    return {
      stepId: input.stepId,
      success: false,
      error: 'Ship loop step is missing an execution handler.',
      proofEvent: buildShipLoopProofEvent({
        stepId: input.stepId,
        success: false,
        error: 'Ship loop step is missing an execution handler.',
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stepId: input.stepId,
      success: false,
      error: message,
      proofEvent: buildShipLoopProofEvent({
        stepId: input.stepId,
        success: false,
        error: message,
      }),
    };
  }
}

export type DispatchIncidentStudioShipLoopStepViaInlineBridgeInput = {
  payload: unknown;
  webview: vscode.Webview;
  context: vscode.ExtensionContext;
  workspace: WorkspaceContext;
  requestId?: string;
};

export async function dispatchIncidentStudioShipLoopStepMessage(
  input: DispatchIncidentStudioShipLoopStepViaInlineBridgeInput
): Promise<void> {
  const record =
    typeof input.payload === 'object' && input.payload !== null
      ? (input.payload as Record<string, unknown>)
      : {};
  const stepId = typeof record.stepId === 'string' ? (record.stepId as ShipLoopStepId) : undefined;
  const projectPath =
    typeof record.projectPath === 'string' && record.projectPath.trim()
      ? record.projectPath.trim()
      : undefined;

  if (!stepId || !(stepId in SHIP_LOOP_STEP_DEFINITIONS)) {
    await input.webview.postMessage(
      createExtensionWebviewMessage(
        'runShipLoopStepDone',
        {
          stepId: stepId ?? 'unknown',
          success: false,
          error: 'Unknown ship loop step.',
        },
        input.requestId ? { requestId: input.requestId } : undefined
      )
    );
    return;
  }

  const result = await dispatchIncidentStudioShipLoopStep({
    stepId,
    webview: input.webview,
    context: input.context,
    workspace: input.workspace,
    projectPath,
    requestId: input.requestId,
    seed:
      typeof record.seed === 'object' && record.seed !== null
        ? (record.seed as Record<string, unknown>)
        : {},
  });

  await input.webview.postMessage(
    createExtensionWebviewMessage(
      'runShipLoopStepDone',
      result,
      input.requestId ? { requestId: input.requestId } : undefined
    )
  );
}

async function refreshShipLoopSurfaces(input: {
  webview: vscode.Webview;
  context: vscode.ExtensionContext;
  workspace: WorkspaceContext;
  projectPath?: string;
  requestId?: string;
}): Promise<void> {
  await refreshIncidentStudioStabilizationLoop({
    webview: input.webview,
    context: input.context,
    workspacePath: input.workspace.workspacePath,
    projectPath: input.projectPath,
    reason: 'studio-action-completed',
  });
  await postIncidentStudioShipEvidence(input.webview, {
    workspacePath: input.workspace.workspacePath,
    projectPath: input.projectPath,
    requestId: input.requestId,
  });
}

export async function refreshIncidentStudioShipLoopSurfaces(input: {
  webview: vscode.Webview;
  context: vscode.ExtensionContext;
  workspacePath: string;
  projectPath?: string;
  requestId?: string;
}): Promise<void> {
  await refreshIncidentStudioStabilizationLoop({
    webview: input.webview,
    context: input.context,
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    reason: 'manual-refresh',
  });
  await postIncidentStudioShipEvidence(input.webview, {
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    requestId: input.requestId,
  });
}

export async function dispatchIncidentStudioInlineCommandWithShipLoopRefresh(
  input: Parameters<typeof dispatchIncidentStudioInlineCommand>[0] & {
    context: vscode.ExtensionContext;
    workspacePath: string;
    projectPath?: string;
  }
): Promise<void> {
  await dispatchIncidentStudioInlineCommand(input);
  await refreshIncidentStudioShipLoopSurfaces({
    webview: input.webview,
    context: input.context,
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    requestId: input.requestId,
  });
}
