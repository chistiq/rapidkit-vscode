/**
 * Privacy boundary for the retired retention/cohort analytics experiment.
 *
 * Collection and consent UI are intentionally disabled. The legacy setting keys
 * remain exported only so older tests/migrations can identify stale user settings;
 * their values never enable collection. Local operational evidence used by the
 * Dashboard and Incident Studio is outside this analytics boundary.
 */

export const ANALYTICS_OPT_IN_KEY = 'analytics.optIn';
export const ANALYTICS_CONSENT_SHOWN_KEY = 'analytics.consentPromptShown';
export const RETENTION_ANALYTICS_ENABLED = false;

/** Fail closed even when an older installation still has opt-in=true persisted. */
export function resolveAnalyticsOptIn(): boolean {
  return RETENTION_ANALYTICS_ENABLED;
}

/** Consent UI is retired while analytics collection is disabled. */
export function shouldShowAnalyticsConsentPrompt(): boolean {
  return false;
}

/**
 * Compatibility entry point retained for callers compiled against the earlier
 * internal module. It never displays UI and never mutates user configuration.
 */
export async function showAnalyticsConsentPrompt(): Promise<boolean> {
  return false;
}
