import { describe, expect, it } from 'vitest';

import {
  buildStudioVerifiedRepairReceipt,
  describeStudioPostCliSourceRepair,
  presentStudioCliOwnedRepairObservation,
  resolveStudioCliRepairDisposition,
  selectStudioPostCliSourceCandidates,
  selectStudioSourceRepairCandidates,
} from '../core/studioRepairReceipt.js';
import type { WorkspaceRepairCliExecutionResult } from '../core/workspaceRepairCliClient.js';

describe('Studio verified repair receipt', () => {
  it('keeps canonical state and lockfiles out of source repair on every path separator', () => {
    expect(
      selectStudioSourceRepairCandidates([
        '.workspai/workspace.contract.json',
        '.rapidkit\\state.json',
        'project\\package-lock.json',
        'project/src/index.ts',
        'project\\src\\index.ts',
        'project/src/worker.ts',
      ])
    ).toEqual(['project/src/index.ts', 'project/src/worker.ts']);
  });

  it('keeps remaining Analyze targets ahead of a rolled-back checkpoint file', () => {
    expect(
      selectStudioPostCliSourceCandidates({
        autonomousTargetPaths: ['.github/workflows/ci.yml'],
        checkpointFiles: [
          { path: 'package.json' },
          { path: '.workspai/reports/analyze-last-run.json' },
        ],
      })
    ).toEqual(['.github/workflows/ci.yml', 'package.json']);
  });

  it('keeps missing SDK/toolchain preconditions out of general source repair', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'decision-required',
          decision: {
            options: ['replan', 'manual-repair', 'cancel'],
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
      modelCorrectableProposal: false,
      rolledBackForAnotherSourceAttempt: false,
      requiresUserDecision: true,
      nextAction: 'review-required',
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
            options: ['replan', 'manual-repair', 'cancel'],
            causes: [{ kind: 'source-repair-required', projectPath: 'web' }],
          },
          adapterEvaluations: [],
        },
        sourceCandidates: ['web/package.json'],
      })
    ).toMatchObject({
      generalSourceRepair: true,
      requiresUserDecision: false,
      nextAction: 'general-source-repair',
      missingExecutables: [],
    });
  });

  it('routes a stale precondition to replanning without inventing a user decision', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'decision-required',
          decision: {
            options: ['cancel'],
            causes: [{ kind: 'failed-precondition' }],
          },
          adapterEvaluations: [],
        },
        sourceCandidates: [],
      })
    ).toEqual({
      closed: false,
      generalSourceRepair: false,
      modelCorrectableProposal: true,
      rolledBackForAnotherSourceAttempt: false,
      requiresUserDecision: false,
      nextAction: 'replan-required',
      missingExecutables: [],
    });
  });

  it('returns a rejected no-op proposal to governed causal source repair', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'decision-required',
          decision: {
            options: ['cancel'],
            causes: [{ kind: 'failed-precondition', projectPath: 'commerce-api' }],
          },
          adapterEvaluations: [],
        },
        sourceCandidates: ['commerce-api/package.json'],
      })
    ).toMatchObject({
      closed: false,
      generalSourceRepair: true,
      modelCorrectableProposal: true,
      requiresUserDecision: false,
      nextAction: 'general-source-repair',
    });
  });

  it('preserves a real engineering decision when failed preconditions expose more than cancel', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'decision-required',
          decision: {
            options: ['replan', 'manual-repair', 'cancel'],
            causes: [{ kind: 'failed-precondition', projectPath: 'commerce-api' }],
          },
          adapterEvaluations: [],
        },
        sourceCandidates: ['commerce-api/package.json'],
      })
    ).toMatchObject({
      generalSourceRepair: false,
      modelCorrectableProposal: false,
      requiresUserDecision: true,
      nextAction: 'review-required',
    });
  });

  it('accepts only a closed CLI transaction as a closed repair action', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: { state: 'closed' },
        sourceCandidates: [],
      })
    ).toMatchObject({
      closed: true,
      requiresUserDecision: false,
      nextAction: 'closed',
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
      modelCorrectableProposal: false,
      rolledBackForAnotherSourceAttempt: false,
      requiresUserDecision: false,
      nextAction: 'repair-stopped',
      missingExecutables: [],
    });
  });

  it('returns failed target verification to another bounded source attempt after rollback', () => {
    expect(
      resolveStudioCliRepairDisposition({
        transaction: {
          state: 'rolled-back',
          verification: { status: 'failed', targetStatus: 'failed' },
          adapterEvaluations: [],
        },
        sourceCandidates: ['web/package.json'],
      })
    ).toEqual({
      closed: false,
      generalSourceRepair: true,
      modelCorrectableProposal: false,
      rolledBackForAnotherSourceAttempt: true,
      requiresUserDecision: false,
      nextAction: 'general-source-repair',
      missingExecutables: [],
      sourceRepairInstruction: describeStudioPostCliSourceRepair({
        rolledBack: true,
        sourceCandidates: ['web/package.json'],
      }),
    });
  });

  it('names remaining Analyze candidates after a rolled-back verify failure', () => {
    expect(
      describeStudioPostCliSourceRepair({
        rolledBack: true,
        sourceCandidates: ['.github/workflows/ci.yml', 'commerce-api/package.json'],
      })
    ).toContain('Remaining source candidates: .github/workflows/ci.yml, commerce-api/package.json');
  });

  it('turns a rolled-back CLI transaction into a source-repair observation for every host', () => {
    const observation = presentStudioCliOwnedRepairObservation({
      result: {
        changedPaths: ['commerce-api/package.json'],
        fileChanges: [],
        transaction: {
          schemaVersion: 'workspai.workspace-repair-transaction.v1',
          transactionId: 'repair-analyze-rollback',
          state: 'rolled-back',
          target: { cardId: 'analyze', scope: 'project', actionIds: [] },
          checkpoint: {
            status: 'restored',
            files: [{ path: 'commerce-api/package.json', existed: true, beforeHash: 'abc' }],
          },
          stages: [],
          verification: {
            status: 'failed',
            targetStatus: 'failed',
            artifact: '.workspai/reports/workspace-intelligence-run-last-run.json',
            exitCode: 1,
            summary: 'Analyze still missing CI',
          },
        },
      } as WorkspaceRepairCliExecutionResult,
      sourceCandidates: ['.github/workflows/ci.yml', 'commerce-api/package.json'],
      proposalRejectedInstruction: 'Do not retry the rejected content.',
    });

    expect(observation.ok).toBe(false);
    expect(observation.changed).toBe(false);
    expect(observation.output).toMatchObject({
      nextAction: 'general-source-repair',
      recoveryPath: 'general-source-repair',
      sourceCandidates: ['.github/workflows/ci.yml', 'commerce-api/package.json'],
      changedPaths: [],
    });
    expect(String(observation.error)).toContain('.github/workflows/ci.yml');
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
