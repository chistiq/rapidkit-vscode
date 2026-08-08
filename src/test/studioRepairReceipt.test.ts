import { describe, expect, it } from 'vitest';

import { buildStudioVerifiedRepairReceipt } from '../core/studioRepairReceipt.js';

describe('Studio verified repair receipt', () => {
  it('derives changed files, transaction identity, and full closure from durable events', () => {
    const receipt = buildStudioVerifiedRepairReceipt({
      events: [
        {
          type: 'model.message',
          data: { text: 'Everything is fixed. Trust me.' },
        },
        {
          type: 'tool.completed',
          data: {
            output: {
              changedPaths: ['web/package-lock.json', 'web/package.json'],
              transaction: { transactionId: 'repair-transaction-123' },
            },
          },
        },
        {
          type: 'verify.completed',
          data: {
            output: {
              cardVerification: { resolved: true },
              workspaceVerification: { resolved: true },
            },
          },
        },
      ],
    });

    expect(receipt).toEqual({
      answer:
        'Fixed and verified. Changed 2 files: web/package-lock.json, web/package.json. Selected blocker and dependent workspace gates passed fresh verification.',
      changedPaths: ['web/package-lock.json', 'web/package.json'],
      transactionIds: ['repair-transaction-123'],
      verificationSummary:
        'Selected blocker and dependent workspace gates passed fresh verification.',
    });
    expect(receipt.answer).not.toContain('Trust me');
  });

  it('separates selected-blocker closure from unrelated workspace findings', () => {
    const receipt = buildStudioVerifiedRepairReceipt({
      events: [
        {
          type: 'verify.completed',
          data: {
            output: {
              cardVerification: { resolved: true },
              workspaceVerification: { resolved: false },
            },
          },
        },
      ],
    });

    expect(receipt.answer).toBe(
      'Fixed and verified. No source file mutation was required. Selected blocker passed; unrelated workspace findings remain visible.'
    );
  });
});
