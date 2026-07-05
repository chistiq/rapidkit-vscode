import type * as vscode from 'vscode';

export const RETENTION_MILESTONES_KEY = 'workspai.retention.milestones.v1';

export type RetentionMilestoneType =
  | 'first_artifact_generated'
  | 'first_blocker_fixed'
  | 'studio_opened'
  | 'verify_pass_after_studio_fix'
  | 'return_to_dashboard_after_verify'
  | 'command_failure';

export type RetentionSignalSurface = 'dashboard' | 'studio' | 'advisor' | 'setup' | 'unknown';

export interface RetentionMilestoneState {
  schemaVersion: 'workspai-retention-milestones-v1';
  firstArtifactGeneratedAt?: number;
  firstBlockerFixedAt?: number;
  studioOpenedAt?: number;
  verifyPassAfterStudioFixAt?: number;
  returnToDashboardAfterVerifyAt?: number;
  commandFailuresBySurface: Partial<Record<RetentionSignalSurface, number>>;
  totalCommandFailures: number;
  updatedAt?: number;
}

export function emptyRetentionMilestoneState(): RetentionMilestoneState {
  return {
    schemaVersion: 'workspai-retention-milestones-v1',
    commandFailuresBySurface: {},
    totalCommandFailures: 0,
  };
}

export function getRetentionMilestones(context: vscode.ExtensionContext): RetentionMilestoneState {
  const raw = context.globalState.get<RetentionMilestoneState>(RETENTION_MILESTONES_KEY);
  if (!raw || typeof raw !== 'object') {
    return emptyRetentionMilestoneState();
  }
  return {
    ...emptyRetentionMilestoneState(),
    ...raw,
    commandFailuresBySurface:
      raw.commandFailuresBySurface && typeof raw.commandFailuresBySurface === 'object'
        ? raw.commandFailuresBySurface
        : {},
    totalCommandFailures:
      typeof raw.totalCommandFailures === 'number' && raw.totalCommandFailures > 0
        ? Math.floor(raw.totalCommandFailures)
        : 0,
  };
}

export function applyRetentionMilestone(
  state: RetentionMilestoneState,
  milestone: RetentionMilestoneType,
  options?: { surface?: RetentionSignalSurface; now?: number }
): RetentionMilestoneState {
  const now = options?.now ?? Date.now();
  const next: RetentionMilestoneState = {
    ...state,
    commandFailuresBySurface: { ...state.commandFailuresBySurface },
    updatedAt: now,
  };
  if (milestone === 'first_artifact_generated') {
    next.firstArtifactGeneratedAt ??= now;
  } else if (milestone === 'first_blocker_fixed') {
    next.firstBlockerFixedAt ??= now;
  } else if (milestone === 'studio_opened') {
    next.studioOpenedAt ??= now;
  } else if (milestone === 'verify_pass_after_studio_fix') {
    next.verifyPassAfterStudioFixAt ??= now;
  } else if (milestone === 'return_to_dashboard_after_verify') {
    next.returnToDashboardAfterVerifyAt ??= now;
  } else if (milestone === 'command_failure') {
    const surface = options?.surface ?? 'unknown';
    next.commandFailuresBySurface[surface] = (next.commandFailuresBySurface[surface] ?? 0) + 1;
    next.totalCommandFailures += 1;
  }
  return next;
}

export async function recordRetentionMilestone(
  context: vscode.ExtensionContext | undefined,
  milestone: RetentionMilestoneType,
  options?: { surface?: RetentionSignalSurface; now?: number }
): Promise<RetentionMilestoneState | null> {
  if (!context) {
    return null;
  }
  const next = applyRetentionMilestone(getRetentionMilestones(context), milestone, options);
  await context.globalState.update(RETENTION_MILESTONES_KEY, next);
  return next;
}
