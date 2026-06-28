import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';

import { Logger } from '../utils/logger';
import { recordRetentionMilestone } from './retentionMilestones';

/**
 * Time-to-First-Value (TTFV) instrumentation (roadmap item 2.9).
 *
 * Measures the elapsed time from the extension's first-ever activation
 * (`installedAt`) to the moment the user produces their FIRST workspace
 * intelligence artifact (any `.rapidkit/reports/*.json`). The result is a
 * write-once retention metric persisted in `globalState` and logged to the
 * Workspai output channel. It is intentionally local-only — no network egress —
 * and is kept distinct from the dashboard's `isFreshInstall` heuristic (which
 * tracks "zero registered workspaces", not "just installed").
 *
 * Pure helpers (`computeTtfvMs`, `formatTtfvLabel`, `selectEarliestArtifact`)
 * are separated from disk/globalState IO so the timing math is deterministically
 * testable.
 */

export const TTFV_INSTALLED_AT_KEY = 'workspai.extension.installedAt';
export const TTFV_RECORD_KEY = 'workspai.extension.ttfv';

export interface TtfvArtifactRef {
  path: string;
  timestamp: number;
}

export interface TtfvRecord {
  resolvedAt: number;
  installedAt: number;
  firstArtifactAt: number | null;
  firstArtifactPath: string | null;
  ttfvMs: number | null;
  /** True when artifacts already predated the recorded install (no genuine TTFV). */
  preexisting: boolean;
  extensionVersion?: string;
}

/** Non-negative elapsed time between install and the first artifact. */
export function computeTtfvMs(installedAt: number, firstArtifactAt: number): number {
  return Math.max(0, firstArtifactAt - installedAt);
}

/** Human-friendly compact duration (e.g. "45s", "3m 12s", "2h 5m"). */
export function formatTtfvLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** Pick the earliest artifact by timestamp (the user's genuine "first value"). */
export function selectEarliestArtifact(artifacts: TtfvArtifactRef[]): TtfvArtifactRef | null {
  if (artifacts.length === 0) {
    return null;
  }
  return artifacts.reduce((earliest, current) =>
    current.timestamp < earliest.timestamp ? current : earliest
  );
}

function parseGeneratedAt(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const candidate =
    typeof record.generatedAt === 'string'
      ? record.generatedAt
      : typeof record.timestamp === 'string'
        ? record.timestamp
        : null;
  if (!candidate) {
    return null;
  }
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Scan `.rapidkit/reports` for produced artifacts, resolving each one's
 * timestamp from its `generatedAt`/`timestamp` field, falling back to the file
 * mtime. Returns an empty list when the directory does not exist.
 */
export async function scanReportArtifacts(reportsDir: string): Promise<TtfvArtifactRef[]> {
  let entries: string[];
  try {
    if (!(await fs.pathExists(reportsDir))) {
      return [];
    }
    entries = await fs.readdir(reportsDir);
  } catch {
    return [];
  }

  const artifacts: TtfvArtifactRef[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    const filePath = path.join(reportsDir, entry);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }
      let timestamp: number | null = null;
      try {
        timestamp = parseGeneratedAt(await fs.readJSON(filePath));
      } catch {
        timestamp = null;
      }
      artifacts.push({ path: filePath, timestamp: timestamp ?? stat.mtimeMs });
    } catch {
      // Ignore unreadable entries.
    }
  }
  return artifacts;
}

/** Records the first-ever activation timestamp; returns the stored value. */
export async function ensureInstalledAt(
  context: vscode.ExtensionContext,
  now: number = Date.now()
): Promise<number> {
  const existing = context.globalState.get<number>(TTFV_INSTALLED_AT_KEY);
  if (typeof existing === 'number' && Number.isFinite(existing)) {
    return existing;
  }
  await context.globalState.update(TTFV_INSTALLED_AT_KEY, now);
  return now;
}

export function getTtfvRecord(context: vscode.ExtensionContext): TtfvRecord | null {
  const raw = context.globalState.get<TtfvRecord>(TTFV_RECORD_KEY);
  return raw && typeof raw === 'object' ? raw : null;
}

/**
 * Detects the first-artifact moment and records TTFV exactly once. Cheap and
 * idempotent: returns immediately once a record exists, and only scans disk
 * while still unresolved, so it is safe to call from every evidence-refresh path.
 */
export async function recordTtfvIfNeeded(
  context: vscode.ExtensionContext,
  workspacePath: string | null | undefined,
  options?: { now?: number; extensionVersion?: string }
): Promise<TtfvRecord | null> {
  const existing = getTtfvRecord(context);
  if (existing) {
    return existing;
  }
  if (!workspacePath) {
    return null;
  }

  const now = options?.now ?? Date.now();
  const installedAt = await ensureInstalledAt(context, now);
  const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
  const artifacts = await scanReportArtifacts(reportsDir);
  const earliest = selectEarliestArtifact(artifacts);
  if (!earliest) {
    return null;
  }

  const preexisting = earliest.timestamp < installedAt;
  const record: TtfvRecord = {
    resolvedAt: now,
    installedAt,
    firstArtifactAt: earliest.timestamp,
    firstArtifactPath: earliest.path,
    ttfvMs: preexisting ? null : computeTtfvMs(installedAt, earliest.timestamp),
    preexisting,
    extensionVersion: options?.extensionVersion,
  };
  await context.globalState.update(TTFV_RECORD_KEY, record);
  if (!preexisting) {
    await recordRetentionMilestone(context, 'first_artifact_generated', {
      surface: 'dashboard',
      now,
    });
  }

  const logger = Logger.getInstance();
  if (preexisting) {
    logger.info(
      `[TTFV] First artifact predates this install (pre-existing workspace) — no time-to-first-value recorded.`
    );
  } else {
    logger.info(
      `[TTFV] Time to first value: ${formatTtfvLabel(record.ttfvMs ?? 0)} ` +
        `(install → ${path.basename(earliest.path)})`
    );
  }
  return record;
}
