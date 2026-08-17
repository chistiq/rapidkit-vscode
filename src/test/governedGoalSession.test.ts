import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { describe, expect, it, vi } from 'vitest';

import {
  prepareGovernedGoalSession,
  restoreGovernedGoalSession,
} from '../core/governedGoalSession.js';
import type { VerifiedGoalContractPayload } from '../core/verifiedGoalIntent.js';
import type {
  GoalCommandResult,
  GoalEntry,
  GoalLifecycleResult,
  GoalPlanResult,
} from '../core/workspaceGoals.js';

const goalPackId = 'goal-1234567890abcdef';
const verifiedGoalId = 'goal-test-coverage-12345678';

function entry(
  lifecycle: GoalEntry['lifecycle'],
  input: Partial<Pick<GoalEntry, 'objective' | 'category' | 'scope'>> = {}
): GoalEntry {
  return {
    id: goalPackId,
    fingerprint: 'a'.repeat(64),
    objective: input.objective ?? 'Raise test coverage to 75%',
    category: input.category ?? 'test-coverage',
    state: 'ready-to-plan',
    lifecycle,
    scope: input.scope ?? {
      kind: 'project',
      projects: ['api'],
      selectionSource: 'explicit',
    },
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:01.000Z',
    goalPack: `.workspai/goals/${goalPackId}/goal-pack.json`,
    agentHandoff: `.workspai/goals/${goalPackId}/agent-handoff.json`,
    ...(lifecycle === 'verification-ready' || lifecycle === 'failed' ? { verifiedGoalId } : {}),
  };
}

function result(value: GoalPlanResult | GoalLifecycleResult): GoalCommandResult {
  return {
    ok: true,
    command: {
      exitCode: 0,
      stdout: JSON.stringify(value),
      stderr: '',
      displayCommand: 'workspai goal',
    },
    value,
  };
}

function lifecycle(
  operation: GoalLifecycleResult['operation'],
  goal: GoalEntry,
  boundGoalId: string | null
): GoalLifecycleResult {
  return {
    schemaVersion: 'workspai.goal-lifecycle-result.v1',
    operation,
    activeGoalId: goal.id,
    goal,
    goals: [goal],
    goalPack: {
      schemaVersion: 'workspai.goal-pack.v1',
      id: goal.id,
      fingerprint: goal.fingerprint,
      state: goal.state,
    },
    verifiedGoalId: boundGoalId,
    verification: null,
  };
}

function verifiedGoal(): VerifiedGoalContractPayload {
  return {
    schemaVersion: 'workspai.verified-goal.v1',
    id: verifiedGoalId,
    fingerprint: 'b'.repeat(64),
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:01.000Z',
    workspace: { name: 'fixture', path: '/workspace' },
    kind: 'test-coverage',
    summary: 'Raise test coverage to 75%',
    scope: { kind: 'project', projectName: 'api', projectPath: '/project' },
    constraints: {
      allowBreakingChanges: false,
      allowForce: false,
      requireBuild: true,
      requireTests: true,
    },
    criteria: { kind: 'test-coverage', minimumPercent: 75 },
    baseline: {
      measuredAt: '2026-08-16T10:00:00.000Z',
      value: 50,
      target: 75,
      unit: 'percent',
      status: 'unsatisfied',
      evidencePaths: ['.workspai/reports/project-coverage-last-run.json'],
      message: 'Coverage is below target.',
    },
    artifactPaths: {
      goal: '/workspace/.workspai/goals/verified/goal.json',
      status: '/workspace/.workspai/goals/verified/status.json',
      latestReport: '/workspace/.workspai/reports/verified-goal-last-run.json',
    },
  };
}

describe('governed Goal Assistant session', () => {
  it('plans, activates, prepares, and binds one project-scoped verified goal', async () => {
    const plan: GoalPlanResult = {
      schemaVersion: 'workspai.goal-plan-result.v1',
      result: 'planned',
      resolution: { source: 'explicit', invocationScope: 'workspace' },
      goalPack: {
        schemaVersion: 'workspai.goal-pack.v1',
        id: goalPackId,
        fingerprint: 'a'.repeat(64),
      },
      agentHandoff: {
        schemaVersion: 'workspai.goal-agent-handoff.v1',
        goalId: goalPackId,
        goalFingerprint: 'a'.repeat(64),
      },
      writtenArtifacts: [`.workspai/goals/${goalPackId}/goal-pack.json`],
      dryRun: false,
      resumed: false,
    };
    const run = vi
      .fn()
      .mockResolvedValueOnce(result(plan))
      .mockResolvedValueOnce(result(lifecycle('activate', entry('active'), null)))
      .mockResolvedValueOnce(
        result(lifecycle('prepare', entry('verification-ready'), verifiedGoalId))
      );
    const phases: string[] = [];

    const binding = await prepareGovernedGoalSession({
      workspacePath: '/workspace',
      objective: 'Raise test coverage to 75%',
      projectName: 'api',
      run,
      readIndex: async () => ({
        kind: 'valid' as const,
        artifactPath: '/workspace/.workspai/goals/index.json',
        value: {
          schemaVersion: 'workspai.goal-index.v1' as const,
          generatedAt: '2026-08-16T10:00:01.000Z',
          activeGoalId: null,
          goals: [entry('planned')],
        },
      }),
      readExecutionPolicy: async () => ({ maxAttempts: 5 }),
      readVerificationAttempts: async () => 0,
      readPreparedGoal: async () => verifiedGoal(),
      onPhase: (phase) => phases.push(phase),
    });

    expect(binding).toMatchObject({
      goalPackId,
      maxAttempts: 5,
      attemptsUsed: 0,
      governedGoal: {
        id: goalPackId,
        completionMode: 'deterministic-verification',
      },
      verifiedGoal: { id: verifiedGoalId },
    });
    expect(run.mock.calls.map(([call]) => call.args)).toEqual([
      ['Raise test coverage to 75%', '--for-agent', 'generic', '--scope', 'project:api'],
      ['--activate', goalPackId],
      ['--prepare', goalPackId],
    ]);
    expect(phases).toEqual([
      'Defining an evidence-bound CLI-governed Goal...',
      'Activating the immutable Goal Pack...',
      'Binding deterministic verification to the Goal...',
    ]);
  });

  it('routes ambiguous goals to explicit review before granting mutation tools', async () => {
    const run = vi.fn().mockResolvedValue(
      result({
        schemaVersion: 'workspai.goal-plan-result.v1',
        result: 'needs-confirmation',
        resolution: { source: 'explicit', invocationScope: 'workspace' },
        goalPack: {
          schemaVersion: 'workspai.goal-pack.v1',
          id: goalPackId,
          fingerprint: 'a'.repeat(64),
        },
        agentHandoff: {
          schemaVersion: 'workspai.goal-agent-handoff.v1',
          goalId: goalPackId,
          goalFingerprint: 'a'.repeat(64),
        },
        writtenArtifacts: [],
        dryRun: false,
        resumed: false,
      })
    );

    await expect(
      prepareGovernedGoalSession({
        workspacePath: '/workspace',
        objective: 'Improve the project',
        run,
      })
    ).rejects.toThrow('Goal requires review before execution (needs-confirmation)');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('activates arbitrary engineering goals without inventing a deterministic verifier', async () => {
    const general = entry('planned', {
      objective: 'Add a release notes editor with retry support',
      category: 'feature-change',
    });
    const plan: GoalPlanResult = {
      schemaVersion: 'workspai.goal-plan-result.v1',
      result: 'planned',
      resolution: { source: 'explicit', invocationScope: 'workspace' },
      goalPack: {
        schemaVersion: 'workspai.goal-pack.v1',
        id: goalPackId,
        fingerprint: general.fingerprint,
      },
      agentHandoff: {
        schemaVersion: 'workspai.goal-agent-handoff.v1',
        goalId: goalPackId,
        goalFingerprint: general.fingerprint,
      },
      writtenArtifacts: [general.goalPack, general.agentHandoff],
      dryRun: false,
      resumed: false,
    };
    const run = vi
      .fn()
      .mockResolvedValueOnce(result(plan))
      .mockResolvedValueOnce(
        result(lifecycle('activate', { ...general, lifecycle: 'active' }, null))
      );

    const binding = await prepareGovernedGoalSession({
      workspacePath: '/workspace',
      objective: general.objective,
      projectName: 'api',
      run,
      readIndex: async () => ({
        kind: 'valid' as const,
        artifactPath: '/workspace/.workspai/goals/index.json',
        value: {
          schemaVersion: 'workspai.goal-index.v1' as const,
          generatedAt: general.updatedAt,
          activeGoalId: null,
          goals: [general],
        },
      }),
      readExecutionPolicy: async () => ({ maxAttempts: 4 }),
    });

    expect(binding).toMatchObject({
      goalPackId,
      maxAttempts: 4,
      attemptsUsed: 0,
      governedGoal: {
        objective: general.objective,
        category: 'feature-change',
        completionMode: 'evidence-review',
      },
    });
    expect(binding.verifiedGoal).toBeUndefined();
    expect(run.mock.calls.map(([call]) => call.args)).toEqual([
      [general.objective, '--for-agent', 'generic', '--scope', 'project:api'],
      ['--activate', goalPackId],
    ]);
  });

  it('restores only the active Goal Pack and retains failed goals for another bounded attempt', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'governed-goal-restore-'));
    const failed = {
      ...entry('failed'),
      repairTransactionId: 'repair_2222222222',
      repairTransactionIds: ['repair_1111111111', 'repair_2222222222'],
    };
    await fs.outputJson(path.join(workspacePath, '.workspai/goals/index.json'), {
      schemaVersion: 'workspai.goal-index.v1',
      generatedAt: failed.updatedAt,
      activeGoalId: failed.id,
      goals: [failed],
    });
    await fs.outputJson(path.join(workspacePath, failed.goalPack), {
      schemaVersion: 'workspai.goal-pack.v1',
      id: failed.id,
      fingerprint: failed.fingerprint,
      policy: { maxAttempts: 3 },
    });

    try {
      await expect(
        restoreGovernedGoalSession({
          workspacePath,
          verifiedGoal: verifiedGoal(),
          readVerificationAttempts: async () => 0,
        })
      ).resolves.toMatchObject({ goalPackId: failed.id, maxAttempts: 3, attemptsUsed: 2 });

      await fs.outputJson(path.join(workspacePath, '.workspai/goals/index.json'), {
        schemaVersion: 'workspai.goal-index.v1',
        generatedAt: failed.updatedAt,
        activeGoalId: null,
        goals: [failed],
      });
      await expect(
        restoreGovernedGoalSession({ workspacePath, verifiedGoal: verifiedGoal() })
      ).rejects.toThrow('no longer linked to an active canonical Goal Pack');
    } finally {
      await fs.remove(workspacePath);
    }
  });
});
