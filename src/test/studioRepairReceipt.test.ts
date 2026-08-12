import { describe, expect, it } from 'vitest';

import {
  buildStudioVerifiedRepairReceipt,
  resolveStudioCliRepairDisposition,
} from '../core/studioRepairReceipt.js';

describe('Studio verified repair receipt', () => {
  it('keeps missing SDK/toolchain preconditions out of general source repair', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'decision-required',
          decision: {
            options: ['manual-repair', 'cancel'],
            causes: [
              {
                kind: 'missing-executable',
                projectPath: 'atlas-api',
                executable: 'dotnet',
              },
              {
                kind: 'missing-executable',
                projectPath: 'compass-service',
                executable: 'cargo',
              },
            ],
          },
          adapterEvaluations: [
            { projectPath: 'atlas-api', missingExecutables: ['dotnet'] },
            { projectPath: 'compass-service', missingExecutables: ['cargo'] },
          ],
        },
        sourceCandidates: ['atlas-api/atlas-api.sln', 'compass-service/Cargo.toml'],
      })
    ).toEqual({
      closed: false,
      generalSourceRepair: false,
      requiresUserDecision: true,
      terminalReason: 'repair-toolchain-unavailable',
      missingExecutables: [
        { projectPath: 'atlas-api', executable: 'dotnet' },
        { projectPath: 'compass-service', executable: 'cargo' },
      ],
    });
  });

  it('delegates a manual-only decision to source repair only when source candidates exist', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'decision-required',
          decision: {
            options: ['manual-repair', 'cancel'],
            causes: [{ kind: 'source-repair-required', projectPath: 'web' }],
          },
          adapterEvaluations: [],
        },
        sourceCandidates: ['web/package.json'],
      })
    ).toMatchObject({
      generalSourceRepair: true,
      requiresUserDecision: false,
      missingExecutables: [],
    });
  });

  it('does not invent a user decision for a rolled-back transaction', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'rolled-back',
          adapterEvaluations: [],
        },
        sourceCandidates: ['web/package.json'],
      })
    ).toEqual({
      closed: false,
      generalSourceRepair: false,
      requiresUserDecision: false,
      missingExecutables: [],
    });
  });

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
