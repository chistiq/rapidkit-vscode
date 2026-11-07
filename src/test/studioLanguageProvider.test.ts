import { describe, expect, it, vi } from 'vitest';
import { waitForStudioLanguageProvider } from '../core/studioLanguageProvider.js';
describe('Public language provider waiting', () => {
  it('returns promptly on cancellation and ignores a late completion', async () => {
    const controller = new AbortController();
    let finish!: (result: string) => void;
    const result = waitForStudioLanguageProvider(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      controller.signal
    );
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toThrow('cancelled');
    finish('late');
  });
  it('times out a silent provider and never invokes an already-cancelled request', async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForStudioLanguageProvider(
        () => new Promise<never>(() => {}),
        undefined,
        1000
      );
      const rejected = expect(pending).rejects.toThrow('timeout');
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      const controller = new AbortController();
      controller.abort();
      const action = vi.fn();
      await expect(waitForStudioLanguageProvider(action, controller.signal)).rejects.toThrow(
        'cancelled'
      );
      expect(action).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not dispatch a provider when cancellation arrives before its microtask', async () => {
    const controller = new AbortController();
    const action = vi.fn(async () => 'late');
    const result = waitForStudioLanguageProvider(action, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow('cancelled');
    expect(action).not.toHaveBeenCalled();
  });
});
