export const DASHBOARD_EVIDENCE_REFRESH_DEBOUNCE_MS = 750;
export const DASHBOARD_EVIDENCE_CARD_REFRESH_DEBOUNCE_MS = 300;
export const DASHBOARD_EVIDENCE_REFRESH_FOLLOWUP_MS = 5000;

export type DashboardEvidenceRefreshScheduler = {
  scheduleFull: (run: () => void) => void;
  scheduleCards: (run: () => void) => void;
  /** @deprecated Prefer scheduleFull or scheduleCards */
  schedule: (run: () => void) => void;
  cancel: () => void;
};

export function createDashboardEvidenceRefreshScheduler(options?: {
  debounceMs?: number;
  cardDebounceMs?: number;
  followupMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): DashboardEvidenceRefreshScheduler {
  const debounceMs = options?.debounceMs ?? DASHBOARD_EVIDENCE_REFRESH_DEBOUNCE_MS;
  const cardDebounceMs = options?.cardDebounceMs ?? DASHBOARD_EVIDENCE_CARD_REFRESH_DEBOUNCE_MS;
  const followupMs = options?.followupMs ?? DASHBOARD_EVIDENCE_REFRESH_FOLLOWUP_MS;
  const setTimer = options?.setTimeoutFn ?? setTimeout;
  const clearTimer = options?.clearTimeoutFn ?? clearTimeout;

  let fullDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let fullFollowupTimer: ReturnType<typeof setTimeout> | null = null;
  let cardDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let cardFollowupTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFullRun: (() => void) | null = null;
  let pendingCardRun: (() => void) | null = null;

  const cancel = () => {
    if (fullDebounceTimer != null) {
      clearTimer(fullDebounceTimer);
      fullDebounceTimer = null;
    }
    if (fullFollowupTimer != null) {
      clearTimer(fullFollowupTimer);
      fullFollowupTimer = null;
    }
    if (cardDebounceTimer != null) {
      clearTimer(cardDebounceTimer);
      cardDebounceTimer = null;
    }
    if (cardFollowupTimer != null) {
      clearTimer(cardFollowupTimer);
      cardFollowupTimer = null;
    }
  };

  const scheduleFull = (run: () => void) => {
    pendingFullRun = run;
    if (cardDebounceTimer != null) {
      clearTimer(cardDebounceTimer);
      cardDebounceTimer = null;
    }
    if (fullDebounceTimer != null) {
      clearTimer(fullDebounceTimer);
    }
    if (fullFollowupTimer != null) {
      clearTimer(fullFollowupTimer);
      fullFollowupTimer = null;
    }

    fullDebounceTimer = setTimer(() => {
      fullDebounceTimer = null;
      run();
      fullFollowupTimer = setTimer(() => {
        fullFollowupTimer = null;
        pendingFullRun?.();
      }, followupMs);
    }, debounceMs);
  };

  const scheduleCards = (run: () => void) => {
    pendingCardRun = run;
    if (cardDebounceTimer != null) {
      clearTimer(cardDebounceTimer);
    }
    if (cardFollowupTimer != null) {
      clearTimer(cardFollowupTimer);
      cardFollowupTimer = null;
    }
    cardDebounceTimer = setTimer(() => {
      cardDebounceTimer = null;
      run();
      cardFollowupTimer = setTimer(() => {
        cardFollowupTimer = null;
        pendingCardRun?.();
      }, followupMs);
    }, cardDebounceMs);
  };

  return {
    scheduleFull,
    scheduleCards,
    schedule: scheduleFull,
    cancel,
  };
}
