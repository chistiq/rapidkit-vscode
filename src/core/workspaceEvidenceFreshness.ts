import { readWorkspaceModelReport } from './workspaceModelReader';
import { readWorkspaceAgentContextReport } from './workspaceAgentContextReader';
import { readWorkspaceVerifyReport } from './workspaceVerifyReader';

/**
 * Aggregate freshness of the workspace intelligence evidence the extension
 * feeds to AI/Copilot/agent actions (roadmap item 2.4).
 *
 * - `missing`: a required report does not exist yet.
 * - `stale`:   the graph-aware verify verdict is `stale`, or the evidence is
 *              older than {@link EVIDENCE_STALE_THRESHOLD_MS}.
 * - `aging`:   older than {@link EVIDENCE_AGING_THRESHOLD_MS} (informational).
 * - `fresh`:   recent and (when known) hash-fresh per verify.
 * - `unknown`: present but no timestamp/verdict to judge.
 */
export type EvidenceFreshnessVerdict = 'fresh' | 'aging' | 'stale' | 'missing' | 'unknown';

export type VerifyFreshnessVerdict = 'fresh' | 'stale' | 'unknown';

export interface EvidenceReportInput {
  id: string;
  present: boolean;
  /** Whether this report must exist for AI grounding (e.g. the model). */
  required: boolean;
  generatedAt: string | null;
}

export interface EvidenceFreshnessInputs {
  now: number;
  reports: EvidenceReportInput[];
  /** Graph-aware verdict from the verify report's `freshness.verdict`, if any. */
  verifyVerdict: VerifyFreshnessVerdict | null;
}

export interface EvidenceFreshnessAssessment {
  verdict: EvidenceFreshnessVerdict;
  reason: string;
  /** Age of the oldest present report, in ms (null when undeterminable). */
  oldestAgeMs: number | null;
  verifyVerdict: VerifyFreshnessVerdict | null;
  /** Required reports that are missing. */
  missingReports: string[];
}

// 6 hours: evidence starts "aging" (informational, non-blocking).
export const EVIDENCE_AGING_THRESHOLD_MS = 6 * 60 * 60 * 1000;
// 24 hours: evidence is considered stale by time when no hash verdict says otherwise.
export const EVIDENCE_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Pure freshness verdict. Hash-based verify verdict takes precedence over the
 * time-based heuristic; missing required reports dominate everything.
 */
export function assessEvidenceFreshness(
  inputs: EvidenceFreshnessInputs
): EvidenceFreshnessAssessment {
  const missingReports = inputs.reports
    .filter((report) => report.required && !report.present)
    .map((report) => report.id);

  if (missingReports.length > 0) {
    return {
      verdict: 'missing',
      reason: `Missing intelligence evidence: ${missingReports.join(', ')}.`,
      oldestAgeMs: null,
      verifyVerdict: inputs.verifyVerdict,
      missingReports,
    };
  }

  // Hash-based verdict from the dependency-graph-aware verify report wins.
  if (inputs.verifyVerdict === 'stale') {
    return {
      verdict: 'stale',
      reason: 'Workspace verify reports the model is stale relative to the dependency graph.',
      oldestAgeMs: oldestAge(inputs),
      verifyVerdict: 'stale',
      missingReports: [],
    };
  }

  const oldest = oldestAge(inputs);
  if (oldest === null) {
    // No timestamps and no decisive verify verdict.
    return {
      verdict: inputs.verifyVerdict === 'fresh' ? 'fresh' : 'unknown',
      reason:
        inputs.verifyVerdict === 'fresh'
          ? 'Workspace verify reports the evidence is fresh.'
          : 'Evidence is present but its freshness could not be determined.',
      oldestAgeMs: null,
      verifyVerdict: inputs.verifyVerdict,
      missingReports: [],
    };
  }

  if (oldest > EVIDENCE_STALE_THRESHOLD_MS) {
    return {
      verdict: 'stale',
      reason: `Intelligence evidence is ${formatAge(oldest)} old (older than ${formatAge(EVIDENCE_STALE_THRESHOLD_MS)}).`,
      oldestAgeMs: oldest,
      verifyVerdict: inputs.verifyVerdict,
      missingReports: [],
    };
  }

  if (oldest > EVIDENCE_AGING_THRESHOLD_MS) {
    return {
      verdict: 'aging',
      reason: `Intelligence evidence is ${formatAge(oldest)} old.`,
      oldestAgeMs: oldest,
      verifyVerdict: inputs.verifyVerdict,
      missingReports: [],
    };
  }

  return {
    verdict: 'fresh',
    reason: 'Intelligence evidence is recent.',
    oldestAgeMs: oldest,
    verifyVerdict: inputs.verifyVerdict,
    missingReports: [],
  };
}

function oldestAge(inputs: EvidenceFreshnessInputs): number | null {
  let oldest: number | null = null;
  for (const report of inputs.reports) {
    if (!report.present) {
      continue;
    }
    const timestamp = parseTimestamp(report.generatedAt);
    if (timestamp === null) {
      continue;
    }
    const age = Math.max(0, inputs.now - timestamp);
    oldest = oldest === null ? age : Math.max(oldest, age);
  }
  return oldest;
}

function formatAge(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days}d`;
  }
  if (hours >= 1) {
    return `${Math.round(hours)}h`;
  }
  const minutes = Math.max(1, Math.round(ms / (60 * 1000)));
  return `${minutes}m`;
}

/** True when the verdict should trigger a refresh/warn gate before AI actions. */
export function isEvidenceFreshnessBlocking(verdict: EvidenceFreshnessVerdict): boolean {
  return verdict === 'stale' || verdict === 'missing';
}

/**
 * Gather the relevant intelligence reports for a workspace and assess freshness.
 * The model report is required; agent-context and verify reinforce the verdict.
 */
export async function resolveWorkspaceEvidenceFreshness(
  workspacePath: string,
  now: number = Date.now()
): Promise<EvidenceFreshnessAssessment> {
  const [model, context, verify] = await Promise.all([
    readWorkspaceModelReport(workspacePath),
    readWorkspaceAgentContextReport(workspacePath),
    readWorkspaceVerifyReport(workspacePath),
  ]);

  const verifyVerdict = normalizeVerifyVerdict(verify?.freshness?.verdict);

  return assessEvidenceFreshness({
    now,
    verifyVerdict,
    reports: [
      {
        id: 'workspace-model',
        required: true,
        present: Boolean(model),
        generatedAt: model?.generatedAt ?? null,
      },
      {
        id: 'workspace-context-agent',
        required: true,
        present: Boolean(context),
        generatedAt: context?.generatedAt ?? null,
      },
      {
        id: 'workspace-verify',
        required: false,
        present: Boolean(verify),
        generatedAt: verify?.generatedAt ?? null,
      },
    ],
  });
}

function normalizeVerifyVerdict(value: unknown): VerifyFreshnessVerdict | null {
  return value === 'fresh' || value === 'stale' || value === 'unknown' ? value : null;
}
