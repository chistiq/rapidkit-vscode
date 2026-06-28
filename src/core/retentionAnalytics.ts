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
}

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

  return {
    schemaVersion: 'retention-cohort.v1',
    extensionVersion: input.extensionVersion ?? input.ttfv?.extensionVersion,
    daysSinceInstall,
    ttfvResolved: Boolean(input.ttfv),
    ttfvMs: input.ttfv?.ttfvMs ?? null,
    ttfvPreexisting: input.ttfv?.preexisting === true,
    registeredWorkspaceCount: Math.max(0, Math.floor(input.registeredWorkspaceCount)),
    activityEntryCount: input.activity.length,
    activityDispatchedCount: buckets.dispatched,
    activityCompletedCount: buckets.completed,
    activityFailedCount: buckets.failed,
    totalCommandRuns: buckets.totalRuns,
    firstArtifactGenerated:
      Boolean(milestones.firstArtifactGeneratedAt) ||
      Boolean(input.ttfv && !input.ttfv.preexisting),
    firstBlockerFixed: Boolean(milestones.firstBlockerFixedAt),
    verifyPassAfterStudioFix: Boolean(milestones.verifyPassAfterStudioFixAt),
    returnToDashboardAfterVerify: Boolean(milestones.returnToDashboardAfterVerifyAt),
    totalCommandFailures: milestones.totalCommandFailures,
    commandFailuresBySurface: { ...milestones.commandFailuresBySurface },
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
