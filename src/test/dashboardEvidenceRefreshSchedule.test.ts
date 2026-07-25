import { describe, expect, it, vi } from 'vitest';

import { createDashboardEvidenceRefreshScheduler } from '../../webview-ui/src/lib/dashboardEvidenceRefreshSchedule';

describe('dashboardEvidenceRefreshSchedule', () => {
  it('runs card refresh with follow-up for terminal-backed artifacts', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const scheduler = createDashboardEvidenceRefreshScheduler({
      cardDebounceMs: 100,
      followupMs: 5000,
    });

    scheduler.scheduleCards(run);
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.cancel();
    vi.useRealTimers();
  });

  it('runs full refresh with follow-up', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const scheduler = createDashboardEvidenceRefreshScheduler({
      debounceMs: 200,
      followupMs: 1000,
    });

    scheduler.scheduleFull(run);
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.cancel();
    vi.useRealTimers();
  });
});
