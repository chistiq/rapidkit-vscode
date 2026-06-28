export type StudioVerifyFailureView = {
  commandText?: string;
  exitCode?: number | null;
  stderrTail?: string;
  topBlocker?: string;
  error?: string;
};

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseStudioVerifyFailure(value: unknown): StudioVerifyFailureView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.action !== 'verify-handoff' || record.status !== 'failed') {
    return null;
  }
  return {
    commandText: optionalTrimmedString(record.commandText),
    exitCode:
      typeof record.exitCode === 'number' || record.exitCode === null ? record.exitCode : undefined,
    stderrTail: optionalTrimmedString(record.stderrTail),
    topBlocker: optionalTrimmedString(record.topBlocker),
    error: optionalTrimmedString(record.error),
  };
}

export function studioVerifyFailureSummary(failure: StudioVerifyFailureView): string {
  if (failure.stderrTail) {
    return failure.stderrTail;
  }
  if (failure.topBlocker) {
    return failure.topBlocker;
  }
  return failure.error ?? 'Verify failed. Inspect the command output and rerun verify.';
}
