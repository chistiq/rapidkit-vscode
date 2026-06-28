export const DOCTOR_FIX_RESULT_SCHEMA_VERSION = 'rapidkit-doctor-fix-result-v1' as const;

export type DoctorAppliedFixOutcome = 'applied' | 'failed' | 'skipped' | 'guidance';

export type DoctorAppliedFix = {
  path: string;
  action: string;
  outcome: DoctorAppliedFixOutcome;
};

export type DoctorFixExecutionResult = {
  schemaVersion: typeof DOCTOR_FIX_RESULT_SCHEMA_VERSION;
  appliedFixes: DoctorAppliedFix[];
  remainingBlockers: string[];
  verifyRecommended: string;
};

export type DoctorFixExecutionResultParseResult =
  | { kind: 'valid'; result: DoctorFixExecutionResult }
  | { kind: 'missing' }
  | { kind: 'incompatible'; error: string };

export function isDoctorFixExecutionResult(value: unknown): value is DoctorFixExecutionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === DOCTOR_FIX_RESULT_SCHEMA_VERSION &&
    Array.isArray(record.appliedFixes) &&
    Array.isArray(record.remainingBlockers) &&
    typeof record.verifyRecommended === 'string'
  );
}

export function extractDoctorFixResult(payload: unknown): DoctorFixExecutionResult | null {
  const result = extractDoctorFixResultDetailed(payload);
  return result.kind === 'valid' ? result.result : null;
}

export function extractDoctorFixResultDetailed(
  payload: unknown
): DoctorFixExecutionResultParseResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { kind: 'missing' };
  }
  const record = payload as Record<string, unknown>;
  if (isDoctorFixExecutionResult(record.fixResult)) {
    return { kind: 'valid', result: record.fixResult };
  }
  if (isDoctorFixExecutionResult(record)) {
    return { kind: 'valid', result: record };
  }
  const candidate =
    record.fixResult && typeof record.fixResult === 'object' && !Array.isArray(record.fixResult)
      ? (record.fixResult as Record<string, unknown>)
      : record;
  if ('schemaVersion' in candidate || 'fixResult' in record) {
    const actual =
      typeof candidate.schemaVersion === 'string' && candidate.schemaVersion.trim()
        ? candidate.schemaVersion.trim()
        : 'missing';
    return {
      kind: 'incompatible',
      error: `Doctor fix result schema is incompatible: expected ${DOCTOR_FIX_RESULT_SCHEMA_VERSION}, got ${actual}.`,
    };
  }
  return { kind: 'missing' };
}
