import * as vscode from 'vscode';

import { Logger } from '../utils/logger';
import { getTtfvRecord, type TtfvRecord } from './ttfvBridge';
import { getDashboardActivityLog, type DashboardActivityEntry } from './dashboardActivityBridge';
import { resolveAnalyticsOptIn } from './analyticsConsent';
import {
  emptyRetentionMilestoneState,
  getRetentionMilestones,
  type RetentionMilestoneState,
  type RetentionSignalSurface,
} from './retentionMilestones';

/**
 * Local retention/cohort aggregation (roadmap item 2.10).
 *
 * Produces an **anonymous, count-and-duration-only** summary suitable for cohort
 * analysis. It deliberately excludes anything identifying: no file paths, no
 * workspace/project names, no command arguments, no free text. The pure builder
 * (`buildRetentionCohortSummary`) is separated from IO so the redaction
 * guarantees are testable, and the "sink" is a no-op scaffold — there is no real
 * network endpoint. Nothing leaves the machine unless the user has explicitly
 * opted in (double-gated via `resolveAnalyticsOptIn`), and even then this build
 * only persists a local snapshot for inspection.
 */

export const ANALYTICS_LOCAL_SNAPSHOT_KEY = 'workspai.analytics.lastLocalSnapshot';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RetentionCohortSummary {
  schemaVersion: 'retention-cohort.v1';
  extensionVersion?: string;
  /** Whole days since first activation (null when install time is unknown). */
  daysSinceInstall: number | null;
  ttfvResolved: boolean;
  ttfvMs: number | null;
  ttfvPreexisting: boolean;
  registeredWorkspaceCount: number;
  /** Total command activity entries retained locally. */
  activityEntryCount: number;
  activityDispatchedCount: number;
  activityCompletedCount: number;
  activityFailedCount: number;
  /** Sum of per-command run counts (no command identifiers included). */
  totalCommandRuns: number;
  firstArtifactGenerated: boolean;
  firstBlockerFixed: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
  totalCommandFailures: number;
  commandFailuresBySurface: Partial<Record<RetentionSignalSurface, number>>;
  /** Highest anonymous product funnel step reached by this install. */
  activationStage: RetentionActivationStage;
  /** Studio/repair loop progress without blocker text, command ids, paths, or names. */
  repairLoopStage: RetentionRepairLoopStage;
  /** 0-100 local completion score for first-value and repair-loop milestones. */
  activationCompletionScore: number;
  /** Failed activity entries divided by retained activity entries. */
  commandFailureRate: number;
  /** Number of broad surfaces that have seen command failures. */
  distinctFailureSurfaceCount: number;
  /** True when local signals suggest the user is hitting repeated execution friction. */
  repeatedFailureFriction: boolean;
  /** Anonymous local guidance bucket; never includes commands, paths, names, or free text. */
  nextRecommendedFocus: RetentionRecommendedFocus;
}

export type RetentionActivationStage =
  | 'not_started'
  | 'first_artifact'
  | 'first_blocker_fixed'
  | 'verify_passed'
  | 'returned_after_verify';

export type RetentionRepairLoopStage =
  | 'not_started'
  | 'needs_fix'
  | 'fix_recorded'
  | 'verify_passed'
  | 'returned_to_dashboard';

export type RetentionRecommendedFocus =
  | 'setup'
  | 'generate_first_artifact'
  | 'fix_first_blocker'
  | 'verify_fix'
  | 'return_to_dashboard'
  | 'reduce_command_failures'
  | 'sustain';

export interface RetentionCohortInput {
  now?: number;
  extensionVersion?: string;
  ttfv: TtfvRecord | null;
  registeredWorkspaceCount: number;
  activity: DashboardActivityEntry[];
  milestones?: RetentionMilestoneState | null;
}

function bucketActivity(activity: DashboardActivityEntry[]): {
  dispatched: number;
  completed: number;
  failed: number;
  totalRuns: number;
} {
  let dispatched = 0;
  let completed = 0;
  let failed = 0;
  let totalRuns = 0;
  for (const entry of activity) {
    totalRuns += typeof entry.runCount === 'number' && entry.runCount > 0 ? entry.runCount : 1;
    if (entry.status === 'completed') {
      completed += 1;
    } else if (entry.status === 'failed') {
      failed += 1;
    } else {
      dispatched += 1;
    }
  }
  return { dispatched, completed, failed, totalRuns };
}

function countFailureSurfaces(
  failuresBySurface: Partial<Record<RetentionSignalSurface, number>>
): number {
  return Object.values(failuresBySurface).filter(
    (value): value is number => typeof value === 'number' && value > 0
  ).length;
}

function hasMilestone(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function resolveActivationStage(input: {
  ttfvResolved: boolean;
  firstArtifactGenerated: boolean;
  firstBlockerFixed: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
}): RetentionActivationStage {
  if (input.returnToDashboardAfterVerify) {
    return 'returned_after_verify';
  }
  if (input.verifyPassAfterStudioFix) {
    return 'verify_passed';
  }
  if (input.firstBlockerFixed) {
    return 'first_blocker_fixed';
  }
  if (input.firstArtifactGenerated || input.ttfvResolved) {
    return 'first_artifact';
  }
  return 'not_started';
}

function resolveRepairLoopStage(input: {
  firstBlockerFixed: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
  activityFailedCount: number;
  totalCommandFailures: number;
}): RetentionRepairLoopStage {
  if (input.returnToDashboardAfterVerify) {
    return 'returned_to_dashboard';
  }
  if (input.verifyPassAfterStudioFix) {
    return 'verify_passed';
  }
  if (input.firstBlockerFixed) {
    return 'fix_recorded';
  }
  if (input.activityFailedCount > 0 || input.totalCommandFailures > 0) {
    return 'needs_fix';
  }
  return 'not_started';
}

function activationCompletionScore(input: {
  ttfvResolved: boolean;
  firstArtifactGenerated: boolean;
  firstBlockerFixed: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
}): number {
  const completed = [
    input.ttfvResolved || input.firstArtifactGenerated,
    input.firstBlockerFixed,
    input.verifyPassAfterStudioFix,
    input.returnToDashboardAfterVerify,
  ].filter(Boolean).length;
  return Math.round((completed / 4) * 100);
}

function resolveRecommendedFocus(input: {
  ttfvResolved: boolean;
  firstArtifactGenerated: boolean;
  firstBlockerFixed: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
  repeatedFailureFriction: boolean;
}): RetentionRecommendedFocus {
  if (!input.ttfvResolved) {
    return 'setup';
  }
  if (!input.firstArtifactGenerated) {
    return 'generate_first_artifact';
  }
  if (!input.firstBlockerFixed) {
    return input.repeatedFailureFriction ? 'reduce_command_failures' : 'fix_first_blocker';
  }
  if (!input.verifyPassAfterStudioFix) {
    return 'verify_fix';
  }
  if (!input.returnToDashboardAfterVerify) {
    return 'return_to_dashboard';
  }
  return input.repeatedFailureFriction ? 'reduce_command_failures' : 'sustain';
}

/** Pure: build the anonymous cohort summary from already-collected signals. */
export function buildRetentionCohortSummary(input: RetentionCohortInput): RetentionCohortSummary {
  const now = input.now ?? Date.now();
  const installedAt = input.ttfv?.installedAt;
  const daysSinceInstall =
    typeof installedAt === 'number' && Number.isFinite(installedAt)
      ? Math.max(0, Math.floor((now - installedAt) / MS_PER_DAY))
      : null;
  const buckets = bucketActivity(input.activity);
  const milestones = input.milestones ?? emptyRetentionMilestoneState();
  const firstArtifactGenerated =
    hasMilestone(milestones.firstArtifactGeneratedAt) ||
    Boolean(input.ttfv && !input.ttfv.preexisting);
  const firstBlockerFixed = hasMilestone(milestones.firstBlockerFixedAt);
  const verifyPassAfterStudioFix = hasMilestone(milestones.verifyPassAfterStudioFixAt);
  const returnToDashboardAfterVerify = hasMilestone(milestones.returnToDashboardAfterVerifyAt);
  const totalCommandFailures = Math.max(0, Math.floor(milestones.totalCommandFailures));
  const commandFailureRate =
    input.activity.length > 0 ? Number((buckets.failed / input.activity.length).toFixed(4)) : 0;
  const distinctFailureSurfaceCount = countFailureSurfaces(milestones.commandFailuresBySurface);
  const repeatedFailureFriction =
    totalCommandFailures >= 2 || buckets.failed >= 2 || commandFailureRate >= 0.5;
  const ttfvResolved = Boolean(input.ttfv);
  const activationStage = resolveActivationStage({
    ttfvResolved,
    firstArtifactGenerated,
    firstBlockerFixed,
    verifyPassAfterStudioFix,
    returnToDashboardAfterVerify,
  });
  const repairLoopStage = resolveRepairLoopStage({
    firstBlockerFixed,
    verifyPassAfterStudioFix,
    returnToDashboardAfterVerify,
    activityFailedCount: buckets.failed,
    totalCommandFailures,
  });

  return {
    schemaVersion: 'retention-cohort.v1',
    extensionVersion: input.extensionVersion ?? input.ttfv?.extensionVersion,
    daysSinceInstall,
    ttfvResolved,
    ttfvMs: input.ttfv?.ttfvMs ?? null,
    ttfvPreexisting: input.ttfv?.preexisting === true,
    registeredWorkspaceCount: Math.max(0, Math.floor(input.registeredWorkspaceCount)),
    activityEntryCount: input.activity.length,
    activityDispatchedCount: buckets.dispatched,
    activityCompletedCount: buckets.completed,
    activityFailedCount: buckets.failed,
    totalCommandRuns: buckets.totalRuns,
    firstArtifactGenerated,
    firstBlockerFixed,
    verifyPassAfterStudioFix,
    returnToDashboardAfterVerify,
    totalCommandFailures,
    commandFailuresBySurface: { ...milestones.commandFailuresBySurface },
    activationStage,
    repairLoopStage,
    activationCompletionScore: activationCompletionScore({
      ttfvResolved,
      firstArtifactGenerated,
      firstBlockerFixed,
      verifyPassAfterStudioFix,
      returnToDashboardAfterVerify,
    }),
    commandFailureRate,
    distinctFailureSurfaceCount,
    repeatedFailureFriction,
    nextRecommendedFocus: resolveRecommendedFocus({
      ttfvResolved,
      firstArtifactGenerated,
      firstBlockerFixed,
      verifyPassAfterStudioFix,
      returnToDashboardAfterVerify,
      repeatedFailureFriction,
    }),
  };
}

function resolveRegisteredWorkspaceCount(): number {
  try {
    // Lazy require avoids a hard dependency cycle and keeps this testable.
    const { WorkspaceManager } = require('./workspaceManager') as {
      WorkspaceManager: { getInstance: () => { getWorkspaces: () => unknown[] } };
    };
    const workspaces = WorkspaceManager.getInstance().getWorkspaces();
    return Array.isArray(workspaces) ? workspaces.length : 0;
  } catch {
    return 0;
  }
}

/** Collect local signals and build the anonymous summary. */
export function buildRetentionAnalyticsPayload(
  context: vscode.ExtensionContext,
  options?: { now?: number; extensionVersion?: string }
): RetentionCohortSummary {
  return buildRetentionCohortSummary({
    now: options?.now,
    extensionVersion: options?.extensionVersion,
    ttfv: getTtfvRecord(context),
    registeredWorkspaceCount: resolveRegisteredWorkspaceCount(),
    activity: getDashboardActivityLog(context),
    milestones: getRetentionMilestones(context),
  });
}

/**
 * No-op / deferred sink. There is intentionally NO network endpoint. When the
 * user has opted in (double-gated), we persist the latest anonymous snapshot to
 * globalState for local inspection and log a debug line. A real transport can be
 * wired here later behind the same consent gate.
 */
export async function sendRetentionAnalyticsPayload(
  context: vscode.ExtensionContext,
  payload: RetentionCohortSummary
): Promise<boolean> {
  if (!resolveAnalyticsOptIn()) {
    return false;
  }
  await context.globalState.update(ANALYTICS_LOCAL_SNAPSHOT_KEY, {
    payload,
    builtAt: Date.now(),
  });
  Logger.getInstance().info(
    `[Analytics] Local cohort snapshot built (opt-in active): ` +
      `daysSinceInstall=${payload.daysSinceInstall ?? 'n/a'}, ` +
      `ttfvMs=${payload.ttfvMs ?? 'n/a'}, commandRuns=${payload.totalCommandRuns}. ` +
      `No data transmitted (no endpoint configured).`
  );
  return true;
}

/** Build + (locally) record the cohort snapshot when analytics are opted in. */
export async function captureRetentionAnalytics(
  context: vscode.ExtensionContext,
  options?: { now?: number; extensionVersion?: string }
): Promise<RetentionCohortSummary | null> {
  if (!resolveAnalyticsOptIn()) {
    return null;
  }
  const payload = buildRetentionAnalyticsPayload(context, options);
  await sendRetentionAnalyticsPayload(context, payload);
  return payload;
}
