import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GOAL_INDEX_RELATIVE_PATH,
  buildActiveGoalPromptSection,
  parseGoalCommandOutput,
  parseGoalEntry,
  parseGoalIndex,
  findGoalPackForVerifiedGoal,
  readGoalIndex,
  readActiveGoalHandoff,
  readPreparedVerifiedGoal,
  readGoalVerificationAttempts,
  sanitizeGoalCommandDetail,
} from '../core/workspaceGoals.js';

const temporaryDirectories: string[] = [];

function goalEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'goal_12345678',
    fingerprint: 'a'.repeat(64),
    objective: 'Raise test coverage to 85%',
    category: 'test-coverage',
    state: 'ready-to-plan',
    lifecycle: 'active',
    scope: {
      kind: 'project',
      projects: ['api'],
      selectionSource: 'explicit',
    },
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:01.000Z',
    goalPack: '.workspai/goals/goal_12345678/goal-pack.json',
    agentHandoff: '.workspai/goals/goal_12345678/agent-handoff.json',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.remove(directory)));
});

describe('workspace governed Goals', () => {
  it('accepts one canonical entry and rejects local or escaping artifact paths', () => {
    expect(parseGoalEntry(goalEntry())).not.toBeNull();
    expect(parseGoalEntry(goalEntry({ goalPack: '/home/user/private/goal-pack.json' }))).toBeNull();
    expect(
      parseGoalEntry(goalEntry({ agentHandoff: '.workspai/goals/../agent-handoff.json' }))
    ).toBeNull();
    expect(
      parseGoalEntry(
        goalEntry({
          repairTransactionId: 'repair_1234567890',
          repairTransactionIds: ['repair_1234567890'],
        })
      )
    ).not.toBeNull();
    expect(
      parseGoalEntry(
        goalEntry({
          repairTransactionId: 'repair_1234567890',
          repairTransactionIds: ['repair_0987654321'],
        })
      )
    ).toBeNull();
  });

  it('requires activeGoalId to reference a registered Goal', () => {
    const valid = {
      schemaVersion: 'workspai.goal-index.v1',
      generatedAt: '2026-08-16T10:00:02.000Z',
      activeGoalId: 'goal_12345678',
      goals: [goalEntry()],
    };
    expect(parseGoalIndex(valid)?.activeGoalId).toBe('goal_12345678');
    expect(parseGoalIndex({ ...valid, activeGoalId: 'goal_missing0' })).toBeNull();
  });

  it('reads only the canonical index and fails closed on incompatible content', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-extension-goals-'));
    temporaryDirectories.push(root);
    const artifactPath = path.join(root, GOAL_INDEX_RELATIVE_PATH);
    await fs.ensureDir(path.dirname(artifactPath));
    await fs.writeJson(artifactPath, {
      schemaVersion: 'workspai.goal-index.v1',
      generatedAt: '2026-08-16T10:00:02.000Z',
      activeGoalId: 'goal_12345678',
      goals: [goalEntry()],
    });
    await expect(readGoalIndex(root)).resolves.toMatchObject({
      kind: 'valid',
      value: { activeGoalId: 'goal_12345678' },
    });
    await fs.writeJson(artifactPath, { schemaVersion: 'future.goal-index.v2' });
    await expect(readGoalIndex(root)).resolves.toMatchObject({ kind: 'incompatible' });
  });

  it('binds a prepared verified-goal contract back to its canonical Goal Pack', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-extension-prepared-goal-'));
    temporaryDirectories.push(root);
    const verifiedGoalId = 'goal-test-coverage-12345678';
    const entry = goalEntry({ lifecycle: 'verification-ready', verifiedGoalId });
    await fs.outputJson(path.join(root, GOAL_INDEX_RELATIVE_PATH), {
      schemaVersion: 'workspai.goal-index.v1',
      generatedAt: '2026-08-16T10:00:02.000Z',
      activeGoalId: entry.id,
      goals: [entry],
    });
    await fs.outputJson(path.join(root, '.workspai', 'goals', verifiedGoalId, 'goal.json'), {
      schemaVersion: 'workspai.verified-goal.v1',
      id: verifiedGoalId,
      fingerprint: 'c'.repeat(64),
      createdAt: '2026-08-16T10:00:00.000Z',
      updatedAt: '2026-08-16T10:00:01.000Z',
      workspace: { name: 'fixture', path: root },
      kind: 'test-coverage',
      summary: 'Raise project test coverage to 85%',
      scope: { kind: 'project', projectName: 'api', projectPath: path.join(root, 'api') },
      constraints: {
        allowBreakingChanges: false,
        allowForce: false,
        requireBuild: true,
        requireTests: true,
      },
      criteria: { kind: 'test-coverage', metric: 'auto', minimumPercent: 85 },
      baseline: {
        measuredAt: '2026-08-16T10:00:00.000Z',
        value: 42,
        target: 85,
        unit: 'percent',
        status: 'unsatisfied',
        evidencePaths: ['.workspai/reports/project-coverage-last-run.json'],
        message: 'Coverage is below target.',
      },
      artifactPaths: {
        goal: path.join(root, '.workspai', 'goals', verifiedGoalId, 'goal.json'),
        status: path.join(root, '.workspai', 'goals', verifiedGoalId, 'status.json'),
        latestReport: path.join(root, '.workspai', 'reports', 'verified-goal-last-run.json'),
      },
    });
    await fs.outputJson(path.join(root, '.workspai', 'goals', verifiedGoalId, 'status.json'), {
      schemaVersion: 'workspai.verified-goal-status.v1',
      goalId: verifiedGoalId,
      goalFingerprint: 'c'.repeat(64),
      workspacePath: root,
      attempt: 2,
    });

    const prepared = await readPreparedVerifiedGoal(root, verifiedGoalId);
    expect(prepared).toMatchObject({
      id: verifiedGoalId,
      kind: 'test-coverage',
    });
    await expect(readGoalVerificationAttempts(root, prepared!)).resolves.toBe(2);
    await expect(findGoalPackForVerifiedGoal(root, verifiedGoalId)).resolves.toMatchObject({
      id: entry.id,
      lifecycle: 'verification-ready',
    });
    await expect(readPreparedVerifiedGoal(root, '../private')).resolves.toBeNull();
  });

  it('loads a bounded active handoff without leaking the workspace root into model context', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-extension-goal-handoff-'));
    temporaryDirectories.push(root);
    const entry = goalEntry();
    await fs.outputJson(path.join(root, GOAL_INDEX_RELATIVE_PATH), {
      schemaVersion: 'workspai.goal-index.v1',
      generatedAt: '2026-08-16T10:00:02.000Z',
      activeGoalId: entry.id,
      goals: [entry],
    });
    await fs.outputJson(path.join(root, entry.agentHandoff), {
      schemaVersion: 'workspai.goal-agent-handoff.v1',
      goalId: entry.id,
      goalFingerprint: entry.fingerprint,
      generatedAt: '2026-08-16T10:00:02.000Z',
      consumer: 'generic',
      state: entry.state,
      objective: entry.objective,
      scope: entry.scope,
      discovery: {
        index: GOAL_INDEX_RELATIVE_PATH,
        statusCommand: `workspai goal --status ${entry.id} --json`,
        requiredReads: [GOAL_INDEX_RELATIVE_PATH, entry.goalPack, entry.agentHandoff],
      },
      retrieval: {
        status: 'grounded',
        strategy: 'deterministic-category-v1',
        queries: ['test coverage'],
        anchors: [{ entityId: 'api:test', kind: 'test', label: 'API tests', proofIds: ['p1'] }],
      },
      evidence: ['model', 'graph', 'goal'].map((role) => ({
        role,
        artifact: `.workspai/reports/${role}.json`,
        binding: {
          algorithm: 'sha256',
          semantics: role === 'model' ? 'workspace-model-structural-v1' : 'canonical-json-v1',
          value: 'b'.repeat(64),
        },
      })),
      guardrails: [
        'Do not widen scope',
        'Require approval',
        'Use CLI verification',
        'Do not grant network access',
        'Do not claim success from model output',
      ],
      workflow: [
        { order: 1, owner: 'workspai-cli', instruction: 'Bind evidence' },
        { order: 2, owner: 'agent', instruction: 'Propose a focused change' },
        { order: 3, owner: 'human', instruction: 'Approve the plan' },
        { order: 4, owner: 'workspai-cli', instruction: 'Execute the transaction' },
        { order: 5, owner: 'workspai-cli', instruction: 'Verify the outcome' },
      ],
      renewal: {
        command: `workspai goal "${entry.objective}" --refresh`,
        reason: 'Refresh evidence',
      },
    });
    const handoff = await readActiveGoalHandoff(root);
    const prompt = buildActiveGoalPromptSection(handoff);
    expect(handoff?.goalId).toBe(entry.id);
    expect(prompt).toContain('ACTIVE GOVERNED GOAL');
    expect(prompt).toContain('API tests [test] · 1 proof(s)');
    expect(prompt).not.toContain(root);
  });

  it('rejects an active handoff whose canonical evidence binding is incomplete', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-extension-goal-invalid-'));
    temporaryDirectories.push(root);
    const entry = goalEntry();
    await fs.outputJson(path.join(root, GOAL_INDEX_RELATIVE_PATH), {
      schemaVersion: 'workspai.goal-index.v1',
      generatedAt: '2026-08-16T10:00:02.000Z',
      activeGoalId: entry.id,
      goals: [entry],
    });
    await fs.outputJson(path.join(root, entry.agentHandoff), {
      schemaVersion: 'workspai.goal-agent-handoff.v1',
      goalId: entry.id,
      goalFingerprint: entry.fingerprint,
      generatedAt: '2026-08-16T10:00:02.000Z',
      consumer: 'generic',
      state: entry.state,
      objective: entry.objective,
      scope: entry.scope,
      discovery: {
        index: GOAL_INDEX_RELATIVE_PATH,
        statusCommand: `workspai goal --status ${entry.id} --json`,
        requiredReads: [GOAL_INDEX_RELATIVE_PATH, entry.goalPack, entry.agentHandoff],
      },
      retrieval: {
        status: 'grounded',
        strategy: 'deterministic-category-v1',
        queries: ['test coverage'],
        anchors: [],
      },
      evidence: [{ role: 'model', artifact: '/home/user/model.json', binding: {} }],
      guardrails: ['one', 'two', 'three', 'four', 'five'],
      workflow: Array.from({ length: 5 }, (_, index) => ({
        order: index + 1,
        owner: 'workspai-cli',
        instruction: 'Verify evidence',
      })),
      renewal: { command: `workspai goal "${entry.objective}" --refresh`, reason: 'Refresh' },
    });

    await expect(readActiveGoalHandoff(root)).resolves.toBeNull();
  });

  it('parses versioned plan results without accepting unsafe artifacts', () => {
    const plan = {
      schemaVersion: 'workspai.goal-plan-result.v1',
      result: 'planned',
      resolution: { source: 'local-link', invocationScope: 'project' },
      goalPack: {
        schemaVersion: 'workspai.goal-pack.v1',
        id: 'goal_12345678',
        fingerprint: 'a'.repeat(64),
      },
      agentHandoff: {
        schemaVersion: 'workspai.goal-agent-handoff.v1',
        goalId: 'goal_12345678',
        goalFingerprint: 'a'.repeat(64),
      },
      writtenArtifacts: ['.workspai/goals/goal_12345678/goal-pack.json'],
      dryRun: false,
      resumed: false,
    };
    expect(parseGoalCommandOutput(JSON.stringify(plan))).toMatchObject({ result: 'planned' });
    expect(
      parseGoalCommandOutput(
        JSON.stringify({ ...plan, writtenArtifacts: ['/home/user/private/goal-pack.json'] })
      )
    ).toBeNull();
  });

  it('rejects terminal prose and unknown Goal result schemas', () => {
    expect(parseGoalCommandOutput('Goal planned successfully')).toBeNull();
    expect(
      parseGoalCommandOutput(JSON.stringify({ schemaVersion: 'workspai.goal-result.v2' }))
    ).toBeNull();
  });

  it('redacts local workspace and home paths from surfaced CLI failures', () => {
    const workspacePath = path.join(os.homedir(), '.workspai', 'workspaces', 'private-name');
    const detail = sanitizeGoalCommandDetail(
      `Missing evidence at ${workspacePath}/.workspai/reports/workspace-model.json`,
      workspacePath
    );
    expect(detail).toContain('$WORKSPACE/.workspai/reports/workspace-model.json');
    expect(detail).not.toContain(os.homedir());
    expect(detail).not.toContain('private-name');
  });
});
