import { describe, expect, it } from 'vitest';

import {
  describeStudioCliRepairPhase,
  describeStudioTerminalFailure,
  isStudioRepairActivelyOwned,
  isStudioUserFacingNarration,
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
    expect(
      isStudioRepairActivelyOwned({
        sessionStatus: 'streaming',
        autoFixBusy: false,
        patchApplyBusy: false,
        progressStatus: 'done',
      })
    ).toBe(true);
    expect(
      isStudioRepairActivelyOwned({
        sessionStatus: 'idle',
        autoFixBusy: false,
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

  it('presents a legacy repeated-producer terminal as generic stopped recovery, not a decision', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'The same forbidden evidence producer was requested again.',
        terminalReason: 'source-repair-policy-loop',
        requiresUserDecision: false,
      })
    ).toMatchObject({
      title: 'Recovery stopped',
      summary:
        'Studio blocked a repeated evidence command because no materially different causal action followed. Governed workspace state remains available for review.',
      terminalReason: 'source-repair-policy-loop',
      connectionFailure: false,
      technicalDetail: 'The same forbidden evidence producer was requested again.',
    });
  });

  it('presents an AI provider outage after CLI rollback as reconnect, not Resume', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'Request Failed: 502 Bad Gateway',
        terminalReason: 'ai-provider-unavailable',
        repairTransactionState: 'rolled-back',
      })
    ).toMatchObject({
      title: 'Latest repair rolled back · AI connection needed',
      summary: expect.stringContaining('Reconnect the AI provider'),
      terminalReason: 'ai-provider-unavailable',
      connectionFailure: false,
      technicalDetail: 'Request Failed: 502 Bad Gateway',
    });
  });

  it('presents a provider outage without a CLI mutation as a retained reconnect', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'Request Failed: fetch failed',
        terminalReason: 'ai-provider-unavailable',
      })
    ).toMatchObject({
      title: 'AI connection needed',
      summary: expect.stringContaining('latest CLI repair outcome is retained'),
      terminalReason: 'ai-provider-unavailable',
      connectionFailure: false,
    });
  });

  it('presents exhausted autonomous recovery as an unverified continuation pause', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'No causal progress was produced.',
        terminalReason: 'model-causal-progress-exhausted',
        requiresUserDecision: false,
      })
    ).toMatchObject({
      title: 'Verification still open',
      summary: expect.stringContaining('nothing was marked verified'),
      terminalReason: 'model-causal-progress-exhausted',
      connectionFailure: false,
    });
  });

  it('presents a model that cannot call tools as a model switch, not a finished task', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'Selected model did not produce a valid native Studio tool call after 3 attempts.',
        terminalReason: 'model-tool-protocol-exhausted',
      })
    ).toMatchObject({
      title: 'Model cannot drive tools',
      summary: expect.stringContaining('tool-capable model'),
      terminalReason: 'model-tool-protocol-exhausted',
    });
  });

  it('presents a typed environment prerequisite as setup work, not a generic pause', () => {
    expect(
      describeStudioTerminalFailure({
        error: 'Required repair executable is unavailable: go (nova-api).',
        terminalReason: 'environment-prerequisite-required',
        requiresUserDecision: false,
      })
    ).toMatchObject({
      title: 'Environment setup required',
      summary: 'Required repair executable is unavailable: go (nova-api).',
      terminalReason: 'environment-prerequisite-required',
      connectionFailure: false,
    });
  });

  it('collapses CLI repair phases into one product-facing applying step', () => {
    expect(describeStudioCliRepairPhase({ phase: 'execute' })).toMatchObject({
      title: 'Applying the repair',
    });
    expect(describeStudioCliRepairPhase({ rolledBack: true })).toMatchObject({
      title: 'Restored the last change',
    });
    expect(describeStudioCliRepairPhase({ closed: true })).toMatchObject({
      title: 'Verified the change',
    });
  });

  it('keeps protocol payloads out of user-facing narration', () => {
    expect(isStudioUserFacingNarration('The CI workflow is missing for commerce-api.')).toBe(true);
    expect(isStudioUserFacingNarration('{"toolName":"inspect-source"}')).toBe(false);
  });

  it('settles persisted live evidence before hydration renders history', () => {
    expect(
      settleStudioTimeline([
        runningProgress,
        { ...runningProgress, action: 'live-evidence', phase: 'observing-evidence' },
      ])
    ).toEqual([
      expect.objectContaining({ status: 'failed', phase: 'verify-observation' }),
      expect.objectContaining({ status: 'done', phase: 'evidence-observed' }),
    ]);
  });

  it('keeps a failed remediation in the paused timeline and names the cause', () => {
    const timeline = terminalizeStudioTimeline(
      [
        {
          action: 'execute-remediation-step',
          status: 'failed' as const,
          phase: 'execute-remediation-step',
          title: 'Remediation step did not clear the blocker',
          summary:
            'Workspace repair transaction violates contract: $LOCAL_PATH must NOT have fewer than 1 items',
        },
        {
          action: 'inspect-evidence',
          status: 'failed' as const,
          phase: 'inspect-evidence',
          title: 'Evidence inspection needs another path',
          summary: 'inspect-evidence repeated the same input 3 times',
        },
        {
          action: 'verify-blocker',
          status: 'failed' as const,
          phase: 'verify-observation',
          title: 'Verify found remaining work',
          summary: 'The blocker remains active.',
        },
        {
          action: 'repair-session',
          status: 'running' as const,
          phase: 'failed',
          title: 'Verification still open',
          summary: 'placeholder',
        },
      ],
      {
        title: 'Verification still open',
        summary:
          'The task is not complete and nothing was marked verified. Studio paused so this attempt would not keep spending tokens. Resume continues the same session with another bounded attempt.',
        terminalReason: 'model-causal-progress-exhausted',
      }
    );

    expect(timeline.map((entry) => entry.action)).toEqual([
      'execute-remediation-step',
      'verify-blocker',
      'repair-session',
    ]);
    expect(timeline.at(-1)).toMatchObject({
      title: 'Verification still open',
      summary: expect.stringContaining('repair transaction had no file checkpoint'),
    });
    expect(timeline.at(-1)?.summary).toContain('Canonical verify still reports remaining work');
  });

  it('keeps a coalesced inspect loop in the paused timeline and names it', () => {
    const timeline = terminalizeStudioTimeline(
      [
        {
          action: 'inspect-evidence',
          status: 'failed' as const,
          phase: 'inspect-evidence',
          title: 'Read evidence',
          summary: 'Read doctor-last-run.json.',
          occurrences: 71,
        },
        {
          action: 'execute-remediation-step',
          status: 'failed' as const,
          phase: 'execute-remediation-step',
          title: 'Remediation step did not clear the blocker',
          summary:
            'Workspace repair transaction violates contract: $LOCAL_PATH must NOT have fewer than 1 items',
        },
        {
          action: 'verify-blocker',
          status: 'failed' as const,
          phase: 'verify-observation',
          title: 'Verify found remaining work',
          summary: 'The blocker remains active.',
        },
        {
          action: 'repair-session',
          status: 'running' as const,
          phase: 'failed',
          title: 'Verification still open',
          summary: 'placeholder',
        },
      ],
      {
        title: 'Verification still open',
        summary:
          'The task is not complete and nothing was marked verified. Studio paused so this attempt would not keep spending tokens. Resume continues the same session with another bounded attempt.',
        terminalReason: 'model-causal-progress-exhausted',
      }
    );

    expect(timeline.map((entry) => entry.action)).toEqual([
      'inspect-evidence',
      'execute-remediation-step',
      'verify-blocker',
      'repair-session',
    ]);
    expect(timeline.at(-1)?.summary).toContain('re-read the same evidence 71 times');
  });
});
