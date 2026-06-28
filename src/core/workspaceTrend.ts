import * as fs from 'fs-extra';
import * as path from 'path';

import { WORKSPACE_HISTORY_PATH } from './workspaceIntelligencePaths';

/**
 * Chart-ready trend types. These intentionally mirror the webview payload
 * contract (`webview-ui/src/lib/dashboardEvidence.ts` → DashboardTrendPoint /
 * DashboardTrendSummary); the structures are kept in sync by `dashboardTrendContract`
 * guard tests, since the host tsconfig `rootDir` forbids importing webview source.
 */
export type DashboardTrendPoint = {
  generatedAt: string;
  gateHealth: number;
  impactRisk: number;
  affectedProjects: number;
  gatePassed: boolean;
  blockingReasons: number;
  policyViolations: number;
  verdict: string;
  risk: string;
};

export type DashboardTrendSummary = {
  windowDays: number;
  points: DashboardTrendPoint[];
  latest: DashboardTrendPoint | null;
  gateHealthDelta: number | null;
  impactRiskDelta: number | null;
  gatePassRate: number;
  totalRuns: number;
};

/**
 * Health/impact 30-day trend (roadmap item 2.8). Consumes the CLI-written
 * `workspace-intelligence-history.json` ring buffer (schema
 * `workspace-intelligence-history.v1`) — appended on every `workspace verify` —
 * and normalizes it into a chart-ready series. Pure mapping functions are kept
 * separate from disk IO so the trend math is deterministically testable.
 */
export const WORKSPACE_HISTORY_SCHEMA_VERSION = 'workspace-intelligence-history.v1';

export const DEFAULT_TREND_WINDOW_DAYS = 30;

export interface WorkspaceHistoryEntry {
  generatedAt?: string;
  kind?: string;
  verdict?: string;
  risk?: string;
  affectedProjects?: number;
  freshness?: string;
  gatePassed?: boolean;
  blockingReasons?: number;
  policyViolations?: number;
}

/** Map a verify verdict to a 0–100 "gate health" score for the trend line. */
export function verdictToHealth(verdict: unknown): number {
  switch (verdict) {
    case 'ready':
      return 100;
    case 'needs-attention':
      return 60;
    case 'blocked':
      return 20;
    default:
      return 0;
  }
}

/** Map an impact risk band to a 0–100 score (higher = riskier). */
export function riskToScore(risk: unknown): number {
  switch (risk) {
    case 'critical':
      return 100;
    case 'high':
      return 75;
    case 'moderate':
    case 'medium':
      return 50;
    case 'low':
      return 25;
    case 'none':
      return 0;
    default:
      return 0;
  }
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Parse the raw `entries` array of the history file into typed entries. */
export function normalizeHistoryEntries(raw: unknown): WorkspaceHistoryEntry[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const entries = (raw as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(
    (entry): entry is WorkspaceHistoryEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).generatedAt === 'string'
  );
}

function toPoint(entry: WorkspaceHistoryEntry): DashboardTrendPoint {
  const verdict = typeof entry.verdict === 'string' ? entry.verdict : 'unknown';
  const risk = typeof entry.risk === 'string' ? entry.risk : 'none';
  return {
    generatedAt: entry.generatedAt ?? '',
    gateHealth: verdictToHealth(verdict),
    impactRisk: riskToScore(risk),
    affectedProjects: toCount(entry.affectedProjects),
    gatePassed: entry.gatePassed === true,
    blockingReasons: toCount(entry.blockingReasons),
    policyViolations: toCount(entry.policyViolations),
    verdict,
    risk,
  };
}

/**
 * Build a trend summary from raw history entries, filtered to a rolling window
 * (default 30 days) and sorted oldest→newest.
 */
export function buildWorkspaceTrend(
  entries: WorkspaceHistoryEntry[],
  options?: { now?: number; windowDays?: number }
): DashboardTrendSummary {
  const now = options?.now ?? Date.now();
  const windowDays = options?.windowDays ?? DEFAULT_TREND_WINDOW_DAYS;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  const points = entries
    .filter((entry) => entry.kind !== 'agent-action')
    .map((entry) => ({ entry, time: Date.parse(entry.generatedAt ?? '') }))
    .filter(({ time }) => Number.isFinite(time) && time >= cutoff)
    .sort((a, b) => a.time - b.time)
    .map(({ entry }) => toPoint(entry));

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const first = points.length > 0 ? points[0] : null;
  const gateHealthDelta = latest && first ? latest.gateHealth - first.gateHealth : null;
  const impactRiskDelta = latest && first ? latest.impactRisk - first.impactRisk : null;
  const passes = points.filter((point) => point.gatePassed).length;
  const gatePassRate = points.length > 0 ? passes / points.length : 0;

  return {
    windowDays,
    points,
    latest,
    gateHealthDelta,
    impactRiskDelta,
    gatePassRate,
    totalRuns: points.length,
  };
}

/** Read and build the workspace trend from disk; returns null when no history. */
export async function readWorkspaceTrend(
  workspacePath: string | null | undefined,
  options?: { now?: number; windowDays?: number }
): Promise<DashboardTrendSummary | null> {
  if (!workspacePath) {
    return null;
  }
  const filePath = path.join(workspacePath, WORKSPACE_HISTORY_PATH);
  try {
    if (!(await fs.pathExists(filePath))) {
      return null;
    }
    const raw = await fs.readJSON(filePath);
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== WORKSPACE_HISTORY_SCHEMA_VERSION) {
      return null;
    }
    const entries = normalizeHistoryEntries(raw);
    if (entries.length === 0) {
      return null;
    }
    return buildWorkspaceTrend(entries, options);
  } catch {
    return null;
  }
}
