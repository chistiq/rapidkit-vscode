import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceGraphProjectionCoalescer } from '../core/workspaceGraphProjectionCoalescer.js';

describe('WorkspaceGraphProjectionCoalescer', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps only the latest value during a burst and exposes pressure telemetry', () => {
    vi.useFakeTimers();
    const emitted: Array<{ value: number; coalesced: number }> = [];
    const coalescer = new WorkspaceGraphProjectionCoalescer<number>(
      (value, stats) => emitted.push({ value, coalesced: stats.coalesced }),
      50
    );
    for (let value = 0; value < 100; value += 1) coalescer.push(value);
    vi.advanceTimersByTime(50);

    expect(emitted).toEqual([{ value: 99, coalesced: 99 }]);
    expect(coalescer.stats()).toEqual({ received: 100, emitted: 1, coalesced: 99 });
  });

  it('clears pending cross-workspace values before they reach the Webview', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const coalescer = new WorkspaceGraphProjectionCoalescer(emit, 50);
    coalescer.push({ workspaceId: 'old' });
    coalescer.clear();
    vi.advanceTimersByTime(100);
    expect(emit).not.toHaveBeenCalled();
  });
});
