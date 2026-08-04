import { describe, expect, it } from 'vitest';

import {
  isStudioRepairActivelyOwned,
  settleStudioTimeline,
  terminalizeStudioProgress,
} from '../../webview-ui/src/lib/studioSessionLifecycle';

const runningProgress = {
  action: 'verify-blocker',
  status: 'running' as const,
  phase: 'verify-observation',
  title: 'Verify found remaining work',
  summary: 'The blocker remains active.',
};

describe('Studio session lifecycle', () => {
  it('never presents terminal or hydrated inactive sessions as running', () => {
    expect(
      isStudioRepairActivelyOwned({
        sessionStatus: 'error',
        autoFixBusy: false,
        patchApplyBusy: false,
        progressStatus: 'running',
      })
    ).toBe(false);
    expect(
      isStudioRepairActivelyOwned({
        sessionStatus: 'streaming',
        autoFixBusy: true,
        patchApplyBusy: false,
        progressStatus: 'running',
      })
    ).toBe(true);
  });

  it('terminalizes unresolved verify progress when the owning session fails', () => {
    expect(
      terminalizeStudioProgress(runningProgress, {
        title: 'Repair stopped',
        summary: 'The bounded repair session ended with remaining work.',
      })
    ).toEqual(
      expect.objectContaining({
        status: 'done',
        phase: 'repair-stopped',
        title: 'Repair stopped',
      })
    );
  });

  it('settles persisted live evidence before hydration renders history', () => {
    expect(
      settleStudioTimeline([
        runningProgress,
        { ...runningProgress, action: 'live-evidence', phase: 'observing-evidence' },
      ])
    ).toEqual([
      expect.objectContaining({ status: 'done', phase: 'verify-observation' }),
      expect.objectContaining({ status: 'done', phase: 'evidence-observed' }),
    ]);
  });
});
