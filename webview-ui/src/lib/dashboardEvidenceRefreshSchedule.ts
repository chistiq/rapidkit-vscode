export const DASHBOARD_EVIDENCE_REFRESH_DEBOUNCE_MS = 750;
export const DASHBOARD_EVIDENCE_REFRESH_FOLLOWUP_MS = 5000;

export type DashboardEvidenceRefreshScheduler = {
  schedule: (run: () => void) => void;
  cancel: () => void;
};

export function createDashboardEvidenceRefreshScheduler(options?: {
  debounceMs?: number;
  followupMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): DashboardEvidenceRefreshScheduler {
  const debounceMs = options?.debounceMs ?? DASHBOARD_EVIDENCE_REFRESH_DEBOUNCE_MS;
  const followupMs = options?.followupMs ?? DASHBOARD_EVIDENCE_REFRESH_FOLLOWUP_MS;
  const setTimer = options?.setTimeoutFn ?? setTimeout;
  const clearTimer = options?.clearTimeoutFn ?? clearTimeout;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let followupTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRun: (() => void) | null = null;

  const cancel = () => {
    if (debounceTimer != null) {
      clearTimer(debounceTimer);
      debounceTimer = null;
    }
    if (followupTimer != null) {
      clearTimer(followupTimer);
      followupTimer = null;
    }
  };

  const schedule = (run: () => void) => {
    pendingRun = run;
    cancel();
    debounceTimer = setTimer(() => {
      debounceTimer = null;
      run();
      followupTimer = setTimer(() => {
        followupTimer = null;
        pendingRun?.();
      }, followupMs);
    }, debounceMs);
  };

  return { schedule, cancel };
}
