import { describe, expect, it } from 'vitest';

import {
  deduplicateStudioMessage,
  describeStudioRepairOutcome,
  summarizeStudioRepairMessage,
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
        decision: { reason: 'Approval required.', options: ['replan', 'manual-repair', 'cancel'] },
      })
    ).toMatchObject({
      status: 'review',
      title: 'Decision required',
      requiresUserDecision: true,
    });
  });

  it('replaces embedded producer JSON and local paths with a bounded repair summary', () => {
    const summary = summarizeStudioRepairMessage(
      `Target precondition failed before checkpoint: ${JSON.stringify({
        workspace: { path: '/home/example/private/workspace' },
        projects: Array.from({ length: 100 }, (_, index) => ({ index, status: 'blocked' })),
      })}`
    );

    expect(summary).toBe(
      'Fresh evidence no longer matched the approved repair target. Studio will compile a new bounded plan before changing source.'
    );
    expect(summary).not.toContain('/home/example');
    expect(summary?.length).toBeLessThan(200);
  });

  it('does not ask the user to decide when fresh evidence only requires replanning', () => {
    expect(
      describeStudioRepairOutcome({
        state: 'decision-required',
        decision: {
          reason: 'Target precondition failed before checkpoint: {"status":"blocked"}',
          options: ['cancel'],
          causes: [
            {
              kind: 'failed-precondition',
              id: 'runtime:stale-target',
              message: 'Fresh evidence changed.',
            },
          ],
        },
      })
    ).toEqual({
      status: 'review',
      phase: 'repair-replan-required',
      title: 'Refining source target',
      summary:
        'Fresh evidence no longer matched the approved repair target. Studio will compile a new bounded plan before changing source.',
      requiresUserDecision: false,
    });
  });

  it('keeps failed preconditions with engineering alternatives user-controlled', () => {
    expect(
      describeStudioRepairOutcome({
        state: 'decision-required',
        decision: {
          reason: 'The protected boundary needs an operator-selected recovery path.',
          options: ['replan', 'manual-repair', 'cancel'],
          causes: [
            {
              kind: 'failed-precondition',
              id: 'precondition:protected-boundary',
              message: 'The protected boundary needs an operator-selected recovery path.',
            },
          ],
        },
      })
    ).toMatchObject({
      phase: 'repair-decision-required',
      requiresUserDecision: true,
      terminalReason: 'cli-repair-decision-required',
    });
  });
});
