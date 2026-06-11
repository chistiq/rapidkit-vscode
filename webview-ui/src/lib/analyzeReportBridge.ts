/**
 * Normalize analyze report messages from the extension host.
 * Host posts top-level fields (`exists`, `data`, `error`); legacy handlers used nested `data.*`.
 */

export function parseReportExistsResult(message: {
  exists?: boolean;
  data?: { exists?: boolean };
}): boolean {
  if (typeof message.exists === 'boolean') {
    return message.exists;
  }
  return Boolean(message.data?.exists);
}

export function parseReportLoadedMessage(message: { data?: unknown; error?: string | null }): {
  report: unknown | null;
  error: string | null;
} {
  if (typeof message.error === 'string' && message.error.trim().length > 0) {
    return { report: null, error: message.error.trim() };
  }

  const payload = message.data;
  if (!payload) {
    return { report: null, error: null };
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'schemaVersion' in payload &&
    'summary' in payload
  ) {
    return { report: payload, error: null };
  }

  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const nested = payload as { data?: unknown; error?: string | null };
    return {
      report: nested.data ?? null,
      error:
        typeof nested.error === 'string' && nested.error.trim().length > 0
          ? nested.error.trim()
          : null,
    };
  }

  return { report: payload, error: null };
}

export function isAnalyzeEvidencePending(input: {
  isLoading: boolean;
  report: unknown | null;
  error: string | null;
  exists?: boolean | null;
}): boolean {
  void input.exists;
  return input.isLoading && input.report == null && input.error == null;
}
