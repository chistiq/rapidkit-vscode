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
 * network endpoint. Collection is currently hard-disabled by
 * `resolveAnalyticsOptIn`, including for installations that retain a legacy
 * opt-in setting. The pure builders remain available for local product tests.
 */

export const ANALYTICS_LOCAL_SNAPSHOT_KEY = 'workspai.analytics.lastLocalSnapshot';
export const RETENTION_ANALYTICS_REMOTE_TRANSPORT = 'disabled-for-rc';
export const RETENTION_ANALYTICS_REMOTE_ENDPOINT: null = null;

export const RETENTION_ANALYTICS_PRIVACY_CONTRACT = Object.freeze({
  schemaVersion: 'retention-analytics-privacy-contract.v1',
  remoteTransport: RETENTION_ANALYTICS_REMOTE_TRANSPORT,
  remoteEndpoint: RETENTION_ANALYTICS_REMOTE_ENDPOINT,
  decision: 'defer-remote-analytics-until-after-rc',
  allowedData: ['counts', 'durations', 'boolean milestones', 'enum buckets'] as const,
  deniedData: [
    'paths',
    'workspace names',
    'project names',
    'command arguments',
    'free text',
  ] as const,
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_SIGNAL_SURFACES: ReadonlyArray<RetentionSignalSurface> = [
  'dashboard',
  'studio',
  'advisor',
  'setup',
  'unknown',
];

export const RETENTION_ANALYTICS_ALLOWED_PAYLOAD_KEYS: ReadonlyArray<keyof RetentionCohortSummary> =
  [
    'schemaVersion',
    'extensionVersion',
    'daysSinceInstall',
    'ttfvResolved',
    'ttfvMs',
    'ttfvPreexisting',
    'registeredWorkspaceCount',
    'activityEntryCount',
    'activityDispatchedCount',
    'activityCompletedCount',
    'activityFailedCount',
    'totalCommandRuns',
    'firstArtifactGenerated',
    'firstBlockerFixed',
    'studioOpened',
    'verifyPassAfterStudioFix',
    'returnToDashboardAfterVerify',
    'totalCommandFailures',
    'commandFailuresBySurface',
    'activationStage',
    'repairLoopStage',
    'activationCompletionScore',
    'commandFailureRate',
    'distinctFailureSurfaceCount',
    'repeatedFailureFriction',
    'nextRecommendedFocus',
  ];

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
  studioOpened: boolean;
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
  | 'studio_opened'
  | 'verify_passed'
  | 'returned_after_verify';

export type RetentionRepairLoopStage =
  | 'not_started'
  | 'needs_fix'
  | 'fix_recorded'
  | 'studio_opened'
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

export type RetentionAnalyticsContractValidation = {
  ok: boolean;
  violations: string[];
};

export function validateRetentionAnalyticsPayloadContract(
  payload: RetentionCohortSummary
): RetentionAnalyticsContractValidation {
  const violations: string[] = [];
  const allowedKeys = new Set<string>(RETENTION_ANALYTICS_ALLOWED_PAYLOAD_KEYS);
  const payloadRecord = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(payloadRecord)) {
    if (!allowedKeys.has(key)) {
      violations.push(`unexpected field: ${key}`);
    }
  }
  const failuresBySurface = payload.commandFailuresBySurface;
  if (failuresBySurface && typeof failuresBySurface === 'object') {
    const allowedSurfaces = new Set<string>(RETENTION_SIGNAL_SURFACES);
    for (const surface of Object.keys(failuresBySurface)) {
      if (!allowedSurfaces.has(surface)) {
        violations.push(`unexpected failure surface: ${surface}`);
      }
    }
  }
  if (
    RETENTION_ANALYTICS_PRIVACY_CONTRACT.remoteTransport !== 'disabled-for-rc' ||
    RETENTION_ANALYTICS_PRIVACY_CONTRACT.remoteEndpoint !== null
  ) {
    violations.push('remote analytics transport is not disabled for RC');
  }
  return {
    ok: violations.length === 0,
    violations,
  };
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
  studioOpened: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
}): RetentionActivationStage {
  if (input.returnToDashboardAfterVerify) {
    return 'returned_after_verify';
  }
  if (input.verifyPassAfterStudioFix) {
    return 'verify_passed';
  }
  if (input.studioOpened) {
    return 'studio_opened';
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
  studioOpened: boolean;
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
  if (input.studioOpened) {
    return 'studio_opened';
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
  studioOpened: boolean;
  verifyPassAfterStudioFix: boolean;
  returnToDashboardAfterVerify: boolean;
}): number {
  const completed = [
    input.ttfvResolved || input.firstArtifactGenerated,
    input.firstBlockerFixed,
    input.studioOpened,
    input.verifyPassAfterStudioFix,
    input.returnToDashboardAfterVerify,
  ].filter(Boolean).length;
  return Math.round((completed / 5) * 100);
}

function resolveRecommendedFocus(input: {
  ttfvResolved: boolean;
  firstArtifactGenerated: boolean;
  firstBlockerFixed: boolean;
  studioOpened: boolean;
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
  if (!input.studioOpened) {
    return 'fix_first_blocker';
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
  const studioOpened =
    hasMilestone(milestones.studioOpenedAt) ||
    verifyPassAfterStudioFix ||
    returnToDashboardAfterVerify;
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
    studioOpened,
    verifyPassAfterStudioFix,
    returnToDashboardAfterVerify,
  });
  const repairLoopStage = resolveRepairLoopStage({
    firstBlockerFixed,
    studioOpened,
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
    studioOpened,
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
      studioOpened,
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
      studioOpened,
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
 * Disabled/deferred sink. There is intentionally NO network endpoint and the
 * central analytics gate currently prevents local snapshot persistence too.
 */
export async function sendRetentionAnalyticsPayload(
  context: vscode.ExtensionContext,
  payload: RetentionCohortSummary
): Promise<boolean> {
  if (!resolveAnalyticsOptIn()) {
    return false;
  }
  const validation = validateRetentionAnalyticsPayloadContract(payload);
  if (!validation.ok) {
    Logger.getInstance().warn(
      `[Analytics] Retention payload rejected by privacy contract: ${validation.violations.join(', ')}`
    );
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
