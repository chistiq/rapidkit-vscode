import type { WorkspaceVerifyPolicyViolation } from './workspaceVerifyReader';

/**
 * Normalized policy-violation model shared by the Workspace Health tree and the
 * dashboard (roadmap item 2.5). Mirrors the `policyViolations[]` block of the
 * `workspace-verify.v1` contract emitted by `workspai workspace verify`.
 */
export type PolicyViolationSource = 'model' | 'contract';
export type PolicyViolationSeverity = 'error' | 'warning';

export interface PolicyViolation {
  source: PolicyViolationSource;
  severity: PolicyViolationSeverity;
  code: string;
  message: string;
  target?: string;
}

export interface PolicyViolationSummary {
  mode: string | null;
  violations: PolicyViolation[];
  errors: number;
  warnings: number;
  /** Persistent blockers = blocking reasons + error-severity policy violations. */
  blockers: string[];
}

function normalizeSeverity(value: unknown): PolicyViolationSeverity {
  return value === 'warning' ? 'warning' : 'error';
}

function normalizeSource(value: unknown): PolicyViolationSource {
  return value === 'contract' ? 'contract' : 'model';
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Parse a raw `policyViolations` array into normalized, well-typed violations. */
export function normalizePolicyViolations(value: unknown): PolicyViolation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: PolicyViolation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as WorkspaceVerifyPolicyViolation & Record<string, unknown>;
    const message = toStringValue(record.message);
    const code = toStringValue(record.code);
    if (!message && !code) {
      continue;
    }
    result.push({
      source: normalizeSource(record.source),
      severity: normalizeSeverity(record.severity),
      code: code ?? 'policy',
      message: message ?? code ?? 'Policy violation',
      target: toStringValue(record.target),
    });
  }
  return result;
}

/** Human-readable, stable label for a single violation. */
export function formatPolicyViolation(violation: PolicyViolation): string {
  const target = violation.target ? ` (${violation.target})` : '';
  return `policy.${violation.code}: ${violation.message}${target}`;
}

function collectStringItems(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

/**
 * Summarize policy posture from a raw verify report. Error-severity violations
 * are always treated as persistent blockers even when `policyMode` is `warn`
 * (where the CLI does not fold them into `blockingReasons`), so governance
 * problems never silently disappear from the Health surfaces.
 */
export function summarizePolicyViolations(
  raw: Record<string, unknown> | null | undefined
): PolicyViolationSummary {
  if (!raw || typeof raw !== 'object') {
    return { mode: null, violations: [], errors: 0, warnings: 0, blockers: [] };
  }

  const violations = normalizePolicyViolations(raw.policyViolations);
  const errors = violations.filter((violation) => violation.severity === 'error');
  const warnings = violations.filter((violation) => violation.severity === 'warning');

  const blockingReasons = collectStringItems(raw.blockingReasons, 12);
  const errorLabels = errors.map(formatPolicyViolation);

  const blockers: string[] = [];
  for (const reason of [...blockingReasons, ...errorLabels]) {
    if (!blockers.includes(reason)) {
      blockers.push(reason);
    }
  }

  return {
    mode: toStringValue(raw.policyMode) ?? null,
    violations,
    errors: errors.length,
    warnings: warnings.length,
    blockers: blockers.slice(0, 12),
  };
}
