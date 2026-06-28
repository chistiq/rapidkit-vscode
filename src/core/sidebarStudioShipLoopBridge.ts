import * as vscode from 'vscode';
import * as path from 'node:path';

import {
  resolveIncidentStudioShipEvidence,
  type IncidentStudioShipEvidencePayload,
} from '../ui/panels/incidentStudioShipEvidenceBridge.js';
import {
  SHIP_LOOP_STEP_DEFINITIONS,
  type ShipLoopStepId,
} from '../ui/panels/incidentStudioShipLoopBridge.js';
import { executeStudioActionById } from '../ui/panels/incidentStudioActionBridge.js';
import { runIncidentInlineCommand } from '../ui/panels/incidentStudioInlineCommandBridge.js';
import type { StudioActionId } from '../core/studioActionCommands.js';

export const SIDEBAR_SHIP_LOOP_STEP_IDS = [
  'analyze',
  'verify-gates',
  'readiness',
  'archive',
] as const satisfies readonly ShipLoopStepId[];

export type SidebarShipLoopStepId = (typeof SIDEBAR_SHIP_LOOP_STEP_IDS)[number];

export function isSidebarShipLoopStepId(value: unknown): value is SidebarShipLoopStepId {
  return (
    typeof value === 'string' && SIDEBAR_SHIP_LOOP_STEP_IDS.includes(value as SidebarShipLoopStepId)
  );
}

export async function resolveSidebarShipLoopPayload(input: {
  workspacePath: string;
  projectPath?: string;
  projectName?: string;
}): Promise<IncidentStudioShipEvidencePayload> {
  return resolveIncidentStudioShipEvidence(input);
}

export async function dispatchSidebarShipLoopStep(input: {
  context: vscode.ExtensionContext;
  stepId: SidebarShipLoopStepId;
  workspacePath: string;
  projectPath?: string;
}): Promise<{ success: boolean; summary: string }> {
  const definition = SHIP_LOOP_STEP_DEFINITIONS[input.stepId];
  if (!definition) {
    return { success: false, summary: `Unknown ship-loop step: ${input.stepId}` };
  }

  const workspaceName = path.basename(input.workspacePath);

  if (definition.kind === 'studio-action' && definition.studioActionId) {
    const { actionResult } = await executeStudioActionById(
      input.context,
      { workspacePath: input.workspacePath, workspaceName },
      definition.studioActionId as StudioActionId,
      {
        source: 'workspai-secondary-sidebar',
        trigger: 'sidebar-ship-loop',
      }
    );
    return {
      success: true,
      summary: actionResult?.summary ?? `${definition.studioActionId} completed.`,
    };
  }

  if (definition.kind === 'inline-command' && definition.inlineCommand) {
    const execution = await runIncidentInlineCommand({
      command: definition.inlineCommand,
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      actionId: input.stepId,
    });
    return {
      success: execution.success,
      summary: execution.success
        ? `${input.stepId} completed.`
        : (execution.error ?? `${input.stepId} failed.`),
    };
  }

  return { success: false, summary: 'Ship-loop step has no executable handler.' };
}
