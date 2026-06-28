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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (isDoctorFixExecutionResult(record.fixResult)) {
    return record.fixResult;
  }
  if (isDoctorFixExecutionResult(record)) {
    return record;
  }
  return null;
}
