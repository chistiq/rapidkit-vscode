import { describe, expect, it } from 'vitest';

import {
  describeStudioTerminalFailure,
  isStudioRepairActivelyOwned,
  settleStudioTimeline,
  terminalizeStudioProgress,
  terminalizeStudioTimeline,
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
        status: 'failed',
        phase: 'repair-stopped',
        title: 'Repair stopped',
      })
    );
  });

  it('turns a CLI handshake failure into one honest non-resumable terminal event', () => {
    const presentation = describeStudioTerminalFailure({
      error:
        "Workspai CLI repair protocol handshake failed. No installed executable is safe to use: error: unknown option '--json'",
      terminalReason: 'cli-repair-contract-mismatch',
    });

    expect(presentation).toMatchObject({
      title: 'CLI connection failed',
      connectionFailure: true,
      terminalReason: 'cli-repair-contract-mismatch',
    });
    expect(presentation.summary).toContain('No workspace files were changed');
    expect(
      terminalizeStudioTimeline(
        [
          { ...runningProgress, action: 'recover-active-blocker', title: 'Action failed' },
          { ...runningProgress, action: 'recover-active-blocker', title: 'Action failed' },
        ],
        presentation
      )
    ).toEqual([
      expect.objectContaining({
        status: 'failed',
        title: 'CLI connection failed',
        technicalDetail: expect.stringContaining('unknown option'),
      }),
    ]);
  });

  it('presents a repeated controller-owned producer as a stopped repair, not a decision', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'The same forbidden evidence producer was requested again.',
        terminalReason: 'source-repair-policy-loop',
        requiresUserDecision: false,
      })
    ).toMatchObject({
      title: 'Source repair stopped',
      summary:
        'Studio blocked a repeated evidence command because no causal source edit was made. The workspace source was left unchanged.',
      terminalReason: 'source-repair-policy-loop',
      connectionFailure: false,
      technicalDetail: 'The same forbidden evidence producer was requested again.',
    });
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
