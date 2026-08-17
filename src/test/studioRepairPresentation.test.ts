import { describe, expect, it } from 'vitest';

import {
  deduplicateStudioMessage,
  describeStudioRepairOutcome,
} from '../core/studioRepairPresentation.js';

describe('Studio repair outcome presentation', () => {
  it('deduplicates repeated CLI decision causes without losing the causal detail', () => {
    const sentence =
      '.workspai/workspace.contract.json is canonical and cannot be edited. It is a no-op.';
    expect(deduplicateStudioMessage(`${sentence} ${sentence}`)).toBe(sentence);
  });

  it('does not present a cancelled manual takeover as another pending decision', () => {
    expect(describeStudioRepairOutcome({ state: 'cancelled' })).toEqual({
      status: 'failed',
      phase: 'repair-cancelled',
      title: 'Automatic repair ended',
      summary:
        'Source ownership was released without an unverified success. No automatic repair remains pending.',
      requiresUserDecision: false,
      terminalReason: 'repair-cancelled',
    });
  });

  it('keeps only genuine decision-required transactions actionable', () => {
    expect(
      describeStudioRepairOutcome({
        state: 'decision-required',
        decision: { reason: 'Approval required.', options: ['manual-repair', 'cancel'] },
      })
    ).toMatchObject({
      status: 'review',
      title: 'Decision required',
      requiresUserDecision: true,
    });
  });
});
