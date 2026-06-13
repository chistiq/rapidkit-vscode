import * as vscode from 'vscode';

import {
  postIncidentStudioTelemetry,
  type ResolveIncidentStudioTelemetryOptions,
} from './incidentStudioTelemetryBridge';

export type StabilizationLoopRefreshReason =
  | 'studio-action-completed'
  | 'ai-action-completed'
  | 'inline-command-completed'
  | 'verify-gates-completed'
  | 'manual-refresh';

export const STABILIZATION_LOOP_STUDIO_ACTIONS = new Set([
  'run-analyze',
  'verify-gates',
  'fix-lens',
  'impact-lens',
  'terminal-bridge',
]);

export function shouldRefreshStabilizationLoopAfterStudioAction(actionId: string): boolean {
  return STABILIZATION_LOOP_STUDIO_ACTIONS.has(actionId);
}

export function shouldRefreshStabilizationLoopAfterInlineCommand(): boolean {
  return true;
}

export function shouldRefreshStabilizationLoopAfterAIAction(): boolean {
  return true;
}

export type RefreshIncidentStudioStabilizationLoopInput = ResolveIncidentStudioTelemetryOptions & {
  webview: vscode.Webview;
  reason: StabilizationLoopRefreshReason;
};

export async function refreshIncidentStudioStabilizationLoop(
  input: RefreshIncidentStudioStabilizationLoopInput
): Promise<void> {
  await postIncidentStudioTelemetry(input.webview, {
    context: input.context,
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    forceRefresh: true,
    readDoctorSummary: input.readDoctorSummary,
  });
}
