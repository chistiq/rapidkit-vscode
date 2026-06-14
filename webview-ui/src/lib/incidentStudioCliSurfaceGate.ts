import {
  buildIncidentCliActionMatrix,
  resolveIncidentCliActionByActionType,
  type IncidentCliActionEntry,
} from './incidentCliActionMatrix';
import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import type { IncidentUserMode } from './incidentStudioPreferences';
import { resolveStudioMutationBlockReason } from './incidentStudioMutationGate';

export type IncidentCliSurfaceDispatchInput = {
  command: string;
  cliActionId?: string;
  workspacePath?: string;
  hasProjectSelected?: boolean;
  userMode?: IncidentUserMode;
  telemetry?: IncidentStudioTelemetryGateSlice | null;
};

function findCliActionEntry(
  cliActionId: string | undefined,
  hasProjectSelected: boolean
): IncidentCliActionEntry | undefined {
  if (!cliActionId?.trim()) {
    return undefined;
  }
  const matrix = buildIncidentCliActionMatrix(hasProjectSelected);
  return [...matrix.workspace, ...matrix.project].find((entry) => entry.id === cliActionId);
}

function isMutatingCliEntry(entry: IncidentCliActionEntry): boolean {
  const normalized = entry.command.replace(/\s+/g, ' ').trim().toLowerCase();
  return (
    normalized.includes('--fix') ||
    normalized.includes(' workspace sync') ||
    normalized.includes(' workspace run init') ||
    normalized.includes(' workspace archive') ||
    normalized.includes(' autopilot release') ||
    normalized.includes(' pipeline ') ||
    /\brapidkit init\b/.test(normalized) ||
    /\brapidkit build\b/.test(normalized) ||
    /\brapidkit dev\b/.test(normalized)
  );
}

export function resolveIncidentCliSurfaceBlockReason(
  input: IncidentCliSurfaceDispatchInput
): string | null {
  const command = input.command.trim();
  if (!command) {
    return 'No RapidKit CLI command was provided.';
  }
  if (!input.workspacePath?.trim()) {
    return 'Open a workspace before running RapidKit CLI commands.';
  }

  const entry = findCliActionEntry(input.cliActionId, input.hasProjectSelected === true);
  if (input.cliActionId && !entry) {
    return 'Unknown RapidKit CLI action id.';
  }

  if (entry?.scope === 'project' && !input.hasProjectSelected) {
    return 'Select a project before running project-scoped CLI commands.';
  }

  if (input.userMode === 'guided' && entry?.stability === 'advanced') {
    return 'Advanced CLI commands are blocked in guided mode. Switch to expert mode first.';
  }

  const mutating = entry ? isMutatingCliEntry(entry) : false;
  if (mutating) {
    const mutationBlockReason = resolveStudioMutationBlockReason(input.telemetry);
    if (mutationBlockReason) {
      return mutationBlockReason;
    }
  }

  return null;
}

export function canDispatchIncidentCliSurface(input: IncidentCliSurfaceDispatchInput): boolean {
  return resolveIncidentCliSurfaceBlockReason(input) === null;
}

export function resolveIncidentCliActionEntryForActionType(
  actionType: string | null | undefined,
  hasProjectSelected: boolean
): IncidentCliActionEntry | undefined {
  return resolveIncidentCliActionByActionType(actionType, hasProjectSelected);
}
