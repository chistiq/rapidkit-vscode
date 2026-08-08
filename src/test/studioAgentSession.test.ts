import { describe, expect, it } from 'vitest';

import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';
import {
  StudioAgentSession,
  type StudioAgentModelAction,
  type StudioAgentModelAdapter,
  type StudioAgentSessionStore,
} from '../core/studioAgentSession.js';
import { StudioAgentSessionService } from '../core/studioAgentSessionService.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';

class MemoryStore implements StudioAgentSessionStore {
  saved: StudioAgentPersistedSession[] = [];

  async save(session: StudioAgentPersistedSession): Promise<void> {
    this.saved.push(structuredClone(session));
  }
}

function sequenceModel(actions: StudioAgentModelAction[]): StudioAgentModelAdapter {
  let index = 0;
  return {
    async next() {
      const action = actions[index++];
      if (!action) throw new Error('Model action sequence exhausted.');
      return action;
    },
  };
}

function verifiedDependencyGoal(): NonNullable<StudioAgentPersistedSession['goal']> {
  return {
    schemaVersion: 'workspai.verified-goal.v1',
    id: 'goal-dependency-security-12345678',
    fingerprint: 'a'.repeat(64),
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    workspace: { name: 'workspace', path: '/workspace' },
    kind: 'dependency-security',
    summary: 'Resolve dependency vulnerabilities without unsafe changes.',
    scope: { kind: 'workspace' },
    constraints: {
      allowBreakingChanges: false,
      allowForce: false,
      requireBuild: true,
      requireTests: true,
    },
    criteria: {
      kind: 'dependency-security',
      maximumBlockingVulnerabilities: 0,
      requireFreshAudit: true,
    },
    baseline: {
      measuredAt: '2026-07-30T00:00:00.000Z',
      value: 12,
      target: 0,
      unit: 'blocking-vulnerabilities',
      status: 'unsatisfied',
      evidencePaths: ['.workspai/reports/doctor-last-run.json'],
      message: '12 blocking dependency vulnerabilities remain.',
    },
    artifactPaths: {
      goal: '.workspai/goals/goal-dependency-security-12345678/goal.json',
      status: '.workspai/goals/goal-dependency-security-12345678/status.json',
      latestReport: '.workspai/reports/verified-goal-last-run.json',
    },
  };
}

function closedCliRepairResult(input?: {
  transactionId?: string;
  changedPaths?: string[];
  workspaceStatus?: 'passed' | 'blocked';
  remainingActionIds?: string[];
  evidenceGeneration?: string;
  blockerSignature?: string;
}) {
  const changedPaths = input?.changedPaths ?? ['api/package.json'];
  return {
    ok: true,
    changed: changedPaths.length > 0,
    ...(input?.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
    ...(input?.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
    output: {
      changedPaths,
      transaction: {
        schemaVersion: 'workspai.workspace-repair-transaction.v1',
        transactionId: input?.transactionId ?? 'repair-test-transaction',
        state: 'closed',
        verification: {
          status: 'passed',
          targetStatus: 'passed',
          workspaceStatus: input?.workspaceStatus ?? 'passed',
          remainingActionIds: input?.remainingActionIds ?? [],
          summary: 'The selected repair target passed canonical verification.',
        },
      },
    },
  };
}

describe('Studio Agent session runtime', () => {
  it('persists tool progress so canonical stage movement survives a webview reload', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'run-chain',
      title: 'Run chain',
      activity: 'inspect',
      risk: 'read',
      async execute(_input, context) {
        await context.reportProgress?.({
          intelligencePhase: 'impact',
          intelligenceMilestoneKind: 'stage',
          intelligenceMilestoneStatus: 'started',
        });
        return { ok: true };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'durable-stage-progress-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'ask',
        permissionLevel: 'default',
        workspaceTrusted: true,
      },
      sequenceModel([
        { type: 'tool', toolName: 'run-chain', input: {}, reason: 'Refresh the chain.' },
        { type: 'complete', summary: 'Observed the current stage.' },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Inspect chain progress');

    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.progress',
        data: expect.objectContaining({
          toolName: 'run-chain',
          intelligencePhase: 'impact',
          intelligenceMilestoneStatus: 'started',
        }),
      })
    );
  });

  it('runs deterministic blocker recovery before spending a model decision', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ evidenceGeneration: 'source-v2' });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: true, evidenceGeneration: 'chain-v2' };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved-v2' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'deterministic-recovery-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'blocked-v1',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return { type: 'complete', summary: 'should not be called' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness dependency vulnerabilities');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'active-blocker-prelude' }),
      })
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.requested',
        data: expect.objectContaining({ toolName: 'recover-active-blocker' }),
      })
    );
  });

  it('accepts one closed CLI repair receipt without running a second closure plane', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: true,
          changed: true,
          output: {
            changedPaths: ['api/package.json', 'api/package-lock.json'],
            transaction: {
              schemaVersion: 'workspai.workspace-repair-transaction.v1',
              transactionId: 'repair-closed-1',
              state: 'closed',
              verification: {
                status: 'passed',
                targetStatus: 'passed',
                workspaceStatus: 'blocked',
                remainingActionIds: [],
                summary: 'Selected repair target passed; unrelated workspace findings remain.',
              },
            },
          },
        };
      },
    });
    registry.register({
      name: 'complete-dependency-transaction',
      title: 'Legacy dependency closure',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        throw new Error('A closed CLI transaction must never enter a second transaction.');
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Legacy chain closure',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        throw new Error('A closed CLI transaction must never rerun the intelligence chain.');
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Legacy card verify',
      activity: 'verify',
      risk: 'read',
      async execute() {
        throw new Error('A closed CLI transaction must never be verified twice.');
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'canonical-cli-closure',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return { type: 'complete', summary: 'should not be called' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair the selected Doctor blocker');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(0);
    expect(
      result.events
        .filter((event) => event.type === 'tool.requested')
        .map((event) => (event.data as { toolName?: string }).toolName)
    ).toEqual(['recover-active-blocker']);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'verify.completed',
        data: expect.objectContaining({
          ok: true,
          cardBlocking: false,
          output: expect.objectContaining({
            closureAuthority: 'cli-repair-engine',
            cardVerification: expect.objectContaining({ resolved: true }),
            workspaceVerification: expect.objectContaining({ resolved: false }),
          }),
        }),
      })
    );
  });

  it('closes a dependency transaction reported by multi-project blocker recovery before verify', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ...closedCliRepairResult({
            transactionId: 'repair-multi-project',
            changedPaths: ['api/package-lock.json', 'web/package-lock.json'],
          }),
        };
      },
    });
    registry.register({
      name: 'complete-dependency-transaction',
      title: 'Complete dependency transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute(input) {
        expect(input).toMatchObject({
          projectNames: ['api', 'web'],
          changedPaths: ['api/package-lock.json', 'web/package-lock.json'],
        });
        return { ok: true, changed: false, output: { closureReady: true } };
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'multi-project-dependency-closure',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return { type: 'complete', summary: 'should not be called' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair every vulnerable project');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(0);
    expect(
      result.events
        .filter((event) => event.type === 'tool.requested')
        .map((event) => (event.data as { toolName?: string }).toolName)
    ).toEqual(['recover-active-blocker']);
  });

  it('verifies a blocker cleared during deterministic recovery without spending a model decision', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: true,
          changed: false,
          evidenceGeneration: 'doctor-v2',
          output: { nextAction: 'verify-blocker' },
        };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved-v2' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'deterministic-recovery-verify-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'blocked-v1',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return { type: 'complete', summary: 'should not be called' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Verify refreshed dependency evidence');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'recovery-verify' }),
      })
    );
  });

  it('pauses immediately for an engineering decision when no compatible dependency fix exists', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: false,
          changed: false,
          output: {
            recoveryPath: 'dependency-security',
            nextAction: 'review-required',
            terminalReason: 'safe-fix-unavailable',
            requiresUserDecision: true,
            transaction: {
              transactionId: 'tx-decision',
              decision: { options: ['allow-breaking', 'manual-repair', 'cancel'] },
            },
          },
          error: 'No compatible non-breaking remediation is available.',
        };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'dependency-review-required-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return { type: 'complete', summary: 'should not be called' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair dependencies without breaking changes');

    expect(result.status).toBe('failed');
    expect(modelTurns).toBe(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({
          error: 'No compatible non-breaking remediation is available.',
          terminalReason: 'safe-fix-unavailable',
          requiresUserDecision: true,
          transactionId: 'tx-decision',
          decisionOptions: ['allow-breaking', 'manual-repair', 'cancel'],
        }),
      })
    );
  });

  it('stops after any CLI-owned mutation reports decision-required', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source proposal',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: false,
          changed: false,
          output: {
            nextAction: 'review-required',
            terminalReason: 'cli-repair-decision-required',
            requiresUserDecision: true,
            transaction: {
              transactionId: 'tx-source',
              decision: { options: ['approve-invasive', 'cancel'] },
            },
          },
          error: 'The CLI requires explicit approval for invasive source repair.',
        };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'source-review-required-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Apply an inspected source repair');

    expect(modelTurns).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({
          transactionId: 'tx-source',
          decisionOptions: ['approve-invasive', 'cancel'],
          requiresUserDecision: true,
        }),
      })
    );
  });

  it('stops immediately when the installed CLI fails the repair protocol handshake', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source proposal',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        throw new Error(
          'Workspai CLI repair protocol handshake failed. No installed executable is safe to use.'
        );
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'cli-contract-mismatch-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Apply inspected source repair.',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair the blocker');

    expect(modelTurns).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({
          terminalReason: 'cli-repair-contract-mismatch',
          requiresUserDecision: false,
        }),
      })
    );
  });

  it('lets the deterministic CLI prelude close dependency repair before model diagnosis', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-dependency-security',
      title: 'Inspect dependency security',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return {
          ok: true,
          output: {
            target: { projectName: 'atlas-web' },
            nextAction: 'upgrade-dependency-security',
            upgradeCandidates: [{ packageName: 'next', currentRange: '16.2.10', target: 'latest' }],
          },
        };
      },
    });
    registry.register({
      name: 'recover-active-blocker',
      title: 'CLI repair transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-audit-authorized' });
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'dependency-upgrade-closure-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return modelTurns === 1
            ? {
                type: 'tool',
                toolName: 'inspect-dependency-security',
                input: { projectName: 'atlas-web' },
                reason: 'Inspect the dependency blocker',
              }
            : {
                type: 'tool',
                toolName: 'recover-active-blocker',
                input: {},
                reason: 'Delegate the mutation and closure to the CLI Repair Engine.',
              };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.requested',
        data: expect.objectContaining({
          toolName: 'recover-active-blocker',
        }),
      })
    );
    expect(
      result.events.some(
        (event) =>
          event.type === 'tool.requested' &&
          ['repair-dependency-security', 'upgrade-dependency-security'].includes(
            String((event.data as { toolName?: string }).toolName)
          )
      )
    ).toBe(false);
  });

  it('routes transitive audit findings through the canonical CLI repair transaction', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-dependency-security',
      title: 'Inspect dependency security',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return {
          ok: true,
          output: {
            target: { projectName: 'atlas-web' },
            upgradeCandidates: [],
          },
        };
      },
    });
    registry.register({
      name: 'recover-active-blocker',
      title: 'CLI repair transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-transitive' });
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'transitive-dependency-repair-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'inspect-dependency-security',
          input: { projectName: 'atlas-web' },
          reason: 'Inspect transitive dependency findings',
        },
        {
          type: 'tool',
          toolName: 'recover-active-blocker',
          input: {},
          reason: 'Execute the canonical runtime-native repair transaction',
        },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear transitive dependency findings');

    expect(result.status).toBe('completed');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.requested',
        data: expect.objectContaining({ toolName: 'recover-active-blocker' }),
      })
    );
  });

  it('accepts a model-proposed source repair only after the CLI closes verification', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply patch',
      activity: 'change',
      risk: 'safe-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-source-patch' });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run producer',
      activity: 'change',
      risk: 'guarded-write',
      async execute(input) {
        return { ok: true, changed: true, output: input };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved-v2' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'post-mutation-closure-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'blocked-v1',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Apply the source fix',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(1);
    expect(
      result.events.filter(
        (event) =>
          event.type === 'tool.started' &&
          (event.data as { toolName?: string }).toolName === 'run-governed-command'
      )
    ).toHaveLength(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.completed',
        data: expect.objectContaining({ transactionId: 'repair-source-patch' }),
      })
    );
  });

  it('uses the CLI transaction receipt as durable goal repair closure', async () => {
    const registry = new StudioAgentToolRegistry();
    const verifyBlocker = vi.fn(async () => ({
      ok: false,
      cardBlocking: true,
      error: 'The blocker-card verifier must not own a durable goal.',
    }));
    const verifyGoal = vi.fn(async () => ({
      ok: true,
      cardBlocking: false,
      output: { state: 'verified' },
    }));
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply patch',
      activity: 'change',
      risk: 'safe-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-goal' });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Refresh canonical evidence',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: true,
          cardBlocking: true,
          changed: false,
          output: { exitCode: 2, evidenceRefreshCompleted: true },
        };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      execute: verifyBlocker,
    });
    registry.register({
      name: 'verify-goal',
      title: 'Verify goal',
      activity: 'verify',
      risk: 'read',
      execute: verifyGoal,
    });
    const session = new StudioAgentSession(
      {
        id: 'verified-goal-closure-session',
        workspacePath: '/workspace',
        cardId: 'goal-dependency-security-12345678',
        assistantMode: 'agent',
        goal: verifiedDependencyGoal(),
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: { patches: [] },
          reason: 'Apply a compatible dependency repair.',
        },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Resolve dependency vulnerabilities without breaking changes');

    expect(result.status).toBe('completed');
    expect(verifyGoal).not.toHaveBeenCalled();
    expect(verifyBlocker).not.toHaveBeenCalled();
    expect(result.goal?.baseline.value).toBe(12);
  });

  it('rejects a mutation receipt that is not closed by the CLI repair engine', async () => {
    const registry = new StudioAgentToolRegistry();
    const chain = vi.fn(async () => ({ ok: true, changed: false }));
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply dependency patch',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: true };
      },
    });
    registry.register({
      name: 'complete-dependency-transaction',
      title: 'Complete dependency transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: false,
          changed: true,
          output: {
            closureReady: false,
            nextAction: 'general-source-repair',
            fallbackCapability: 'general-source-repair',
          },
          error: 'Audit still reports a blocker.',
        };
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      execute: chain,
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: false, cardBlocking: true };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'dependency-transaction-pending',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        maxTurns: 2,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: {
            patches: [
              {
                relativePath: 'api/package.json',
                patchedContent: '{"dependencies":{}}',
              },
            ],
          },
          reason: 'Update the dependency manifest',
        },
        { type: 'complete', summary: 'Not yet closed' },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair dependency blocker');

    expect(result.status).toBe('failed');
    expect(chain).not.toHaveBeenCalled();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.failed',
        data: expect.objectContaining({
          toolName: 'apply-workspace-patch',
          terminalReason: 'cli-repair-closure-missing',
        }),
      })
    );
  });

  it('does not start a second closure plane after a dependency patch transaction closes', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply dependency patch',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-dependency-patch' });
      },
    });
    registry.register({
      name: 'complete-dependency-transaction',
      title: 'Complete dependency transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: true, output: { closureReady: true } };
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved' };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'dependency-transaction-closed',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: {
            patches: [
              {
                relativePath: 'api/package.json',
                patchedContent: '{"dependencies":{}}',
              },
            ],
          },
          reason: 'Update the dependency manifest',
        },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair dependency blocker');

    expect(result.status).toBe('completed');
    const requestedTools = result.events
      .filter((event) => event.type === 'tool.requested')
      .map((event) => (event.data as { toolName?: string }).toolName);
    expect(requestedTools).toEqual(['apply-workspace-patch']);
  });

  it('closes from a CLI receipt even when the runtime reconciliation is idempotent', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply dependency patch',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({
          transactionId: 'repair-idempotent-install',
          changedPaths: ['api/package-lock.json'],
        });
      },
    });
    registry.register({
      name: 'complete-dependency-transaction',
      title: 'Complete dependency transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false, output: { closureReady: true } };
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved' };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'dependency-transaction-explicit',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: {
            patches: [
              {
                relativePath: 'api/package-lock.json',
                patchedContent: '{"lockfileVersion":3}',
              },
            ],
          },
          reason: 'Update the dependency lockfile',
        },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair dependency blocker');

    expect(result.status).toBe('completed');
    expect(
      result.events
        .filter((event) => event.type === 'tool.requested')
        .map((event) => (event.data as { toolName?: string }).toolName)
    ).toEqual(['apply-workspace-patch']);
  });

  it('accepts a compatibility transaction alias only when it returns a closed CLI receipt', async () => {
    const registry = new StudioAgentToolRegistry();
    let transactionRuns = 0;
    registry.register({
      name: 'complete-dependency-transaction',
      title: 'Complete dependency transaction',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        transactionRuns += 1;
        return closedCliRepairResult({
          transactionId: 'repair-compatibility-alias',
          changedPaths: [],
        });
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'dependency-transaction-without-mutation',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        maxTurns: 1,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'complete-dependency-transaction',
          input: { projectNames: ['api'] },
          reason: 'Materialize the missing dependency tree through the CLI-owned transaction.',
        },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair dependency blocker');

    expect(result.status).toBe('completed');
    expect(transactionRuns).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.completed',
        data: expect.objectContaining({ toolName: 'complete-dependency-transaction', ok: true }),
      })
    );
  });

  it('refuses completion when a mutation lacks canonical CLI closure', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply patch',
      activity: 'change',
      risk: 'safe-write',
      async execute() {
        return { ok: true, changed: true };
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run canonical chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: false, changed: false, error: 'Canonical readiness stage failed.' };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'failed-chain-closure-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        maxTurns: 2,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: { patches: [] },
          reason: 'Apply source fix',
        },
        { type: 'complete', summary: 'Do not accept this completion' },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair readiness');

    expect(result.status).toBe('failed');
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({
          terminalReason: 'cli-repair-closure-missing',
          error: expect.stringContaining('closed CLI Repair Engine transaction'),
        }),
      })
    );
  });

  it('breaks a repeated causal tool loop with deterministic blocker verification', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-evidence',
      title: 'Inspect evidence',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true, output: { observed: true } };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved-v2' };
      },
    });
    const repeatingModel: StudioAgentModelAdapter = {
      async next() {
        return {
          type: 'tool',
          toolName: 'inspect-evidence',
          input: { paths: ['same-report.json'] },
          reason: 'Repeat the same observation',
        };
      },
    };
    const session = new StudioAgentSession(
      {
        id: 'causal-recovery-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      repeatingModel,
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness');

    expect(result.status).toBe('completed');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'verify-blocker' }),
      })
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.completed',
        data: expect.objectContaining({ summary: expect.stringContaining('blocker is resolved') }),
      })
    );
  });

  it('terminates a causal retry loop when deterministic recovery cannot advance evidence', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-evidence',
      title: 'Inspect evidence',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true, output: { observed: true } };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: false, cardBlocking: true, blockerSignature: 'blocked-v1' };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'causal-stop-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'blocked-v1',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          return {
            type: 'tool',
            toolName: 'inspect-evidence',
            input: { paths: ['same-report.json'] },
            reason: 'Repeat the same observation',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness');

    expect(result.status).toBe('failed');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({ error: expect.stringContaining('causal retry loop') }),
      })
    );
    expect(result.sequence).toBeLessThan(100);
  });

  it('protects provider credits when distinct reads do not produce a source change', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-evidence',
      title: 'Inspect evidence',
      activity: 'inspect',
      risk: 'read',
      async execute(input) {
        return { ok: true, output: input };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: false, cardBlocking: true, blockerSignature: 'still-blocked' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'provider-credit-protection-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        maxModelDecisionsWithoutSourceProgress: 4,
      },
      {
        async next() {
          modelTurns += 1;
          return {
            type: 'tool',
            toolName: 'inspect-evidence',
            input: { path: `report-${modelTurns}.json` },
            reason: 'Inspect another report',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness');

    expect(result.status).toBe('failed');
    expect(modelTurns).toBe(4);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'provider-call-circuit-breaker' }),
      })
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({
          error: expect.stringContaining('no additional model credit'),
        }),
      })
    );
  });

  it('does not treat no-op change evidence churn as causal progress', async () => {
    const registry = new StudioAgentToolRegistry();
    let noOpCalls = 0;
    registry.register({
      name: 'upgrade-dependency-security',
      title: 'Upgrade dependency',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        noOpCalls += 1;
        return {
          ok: false,
          changed: false,
          evidenceGeneration: `generated-audit-${noOpCalls}`,
          output: { nextAction: 'general-source-repair' },
          error: 'Dependency upgrade did not change source.',
        };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({
          transactionId: 'repair-after-noop',
          evidenceGeneration: 'source-generation-2',
        });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-exhausted-accelerator' });
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved' };
      },
    });
    const repeatedNoOp = {
      type: 'tool' as const,
      toolName: 'upgrade-dependency-security',
      input: { projectName: 'atlas-web', packageName: 'next' },
      reason: 'Retry the no-op accelerator',
    };
    const session = new StudioAgentSession(
      {
        id: 'no-op-evidence-churn-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        repeatedNoOp,
        repeatedNoOp,
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: { patches: [] },
          reason: 'Use the general capability plane to repair source',
        },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair the blocker');

    expect(result.status).toBe('completed');
    expect(noOpCalls).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.failed',
        data: expect.objectContaining({
          toolName: 'upgrade-dependency-security',
          duplicate: true,
        }),
      })
    );
  });

  it('removes an exhausted accelerator until a general source capability advances evidence', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-dependency-security',
      title: 'Inspect dependency',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return {
          ok: true,
          output: {
            nextAction: 'general-source-repair',
            exhaustedTools: ['inspect-dependency-security'],
          },
        };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-exhausted-accelerator' });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: true };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false };
      },
    });
    let turn = 0;
    const session = new StudioAgentSession(
      {
        id: 'exhausted-accelerator-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next(context) {
          turn += 1;
          if (turn === 1) {
            expect(context.tools.map((tool) => tool.name)).toContain('inspect-dependency-security');
            return {
              type: 'tool',
              toolName: 'inspect-dependency-security',
              input: {},
              reason: 'Use accelerator first',
            };
          }
          expect(context.tools.map((tool) => tool.name)).not.toContain(
            'inspect-dependency-security'
          );
          expect(context.tools.map((tool) => tool.name)).toContain('apply-workspace-patch');
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Own the fallback through a source transaction',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Resolve the blocker');

    expect(result.status).toBe('completed');
    expect(turn).toBe(2);
  });

  it('locks an unresolved blocker into the general source plane until runtime verification closes it', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: false,
          changed: false,
          output: {
            recoveryPath: 'general-source-repair',
            nextAction: 'general-source-repair',
            unresolvedProjects: ['polyglot-api', 'polyglot-app'],
            sourceCandidates: ['polyglot-api/package.json', 'polyglot-app/package.json'],
          },
          error: 'A source repair is required.',
        };
      },
    });
    registry.register({
      name: 'inspect-source',
      title: 'Inspect source',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true, output: [] };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({
          transactionId: 'repair-general-source',
          evidenceGeneration: 'source-generation-2',
        });
      },
    });
    registry.register({
      name: 'inspect-remediation-plan',
      title: 'Inspect remediation plan',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true };
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run canonical chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false, evidenceGeneration: 'chain-generation-3' };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'general-source-plane-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next(context) {
          modelTurns += 1;
          expect(context.sourceRepairDirective).toMatchObject({
            nextAction: 'general-source-repair',
            unresolvedProjects: ['polyglot-api', 'polyglot-app'],
          });
          expect(context.tools.map((tool) => tool.name)).toEqual([
            'inspect-source',
            'apply-workspace-patch',
          ]);
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Apply the diagnosed source repair.',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Resolve every dependency blocker');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({
          recovery: 'general-source-inspection',
          sourceCandidates: ['polyglot-api/package.json', 'polyglot-app/package.json'],
        }),
      })
    );
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        type: 'tool.requested',
        data: expect.objectContaining({ toolName: 'inspect-remediation-plan' }),
      })
    );
  });

  it('removes read-only tools after bounded source inspection and requires a repair action', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: false,
          changed: false,
          output: {
            recoveryPath: 'general-source-repair',
            nextAction: 'general-source-repair',
            sourceCandidates: ['api/src/security.ts'],
          },
          error: 'A source repair is required.',
        };
      },
    });
    registry.register({
      name: 'inspect-source',
      title: 'Inspect source',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true, changed: false, output: [] };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({ transactionId: 'repair-bounded-source' });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run canonical chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'bounded-source-inspection-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        maxModelDecisionsWithoutSourceProgress: 8,
      },
      {
        async next(context) {
          modelTurns += 1;
          if (context.sourceActionRequired) {
            expect(context.tools.map((tool) => tool.name)).toEqual(['apply-workspace-patch']);
            return {
              type: 'tool',
              toolName: 'apply-workspace-patch',
              input: { patches: [] },
              reason: 'Advance the repair transaction.',
            };
          }
          return {
            type: 'tool',
            toolName: 'inspect-source',
            input: { paths: [`api/src/security-${modelTurns}.ts`] },
            reason: 'Inspect source.',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Resolve the blocker');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(5);
  });

  it('preserves inspected source in model memory after an intervening diagnostic', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: 'Inspect source',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return {
          ok: true,
          output: [
            {
              path: 'api/package.json',
              sha256: 'source-sha',
              content: '{"dependencies":{"example":"1.0.0"}}',
              truncated: false,
            },
          ],
        };
      },
    });
    registry.register({
      name: 'inspect-workspace-diagnostics',
      title: 'Inspect diagnostics',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true, output: { diagnostics: [] } };
      },
    });
    let turn = 0;
    const session = new StudioAgentSession(
      {
        id: 'ephemeral-causal-memory-session',
        workspacePath: '/workspace',
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      {
        async next(context) {
          turn += 1;
          if (turn === 1) {
            return {
              type: 'tool',
              toolName: 'inspect-source',
              input: { paths: ['api/package.json'] },
              reason: 'Read the manifest.',
            };
          }
          if (turn === 2) {
            return {
              type: 'tool',
              toolName: 'inspect-workspace-diagnostics',
              input: { paths: ['api/package.json'] },
              reason: 'Check diagnostics.',
            };
          }
          expect(context.recentObservations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                toolName: 'inspect-source',
                result: expect.objectContaining({
                  output: expect.arrayContaining([
                    expect.objectContaining({
                      path: 'api/package.json',
                      content: '{"dependencies":{"example":"1.0.0"}}',
                    }),
                  ]),
                }),
              }),
            ])
          );
          return { type: 'complete', summary: 'Source remains available.' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Inspect the project');

    expect(result.status).toBe('completed');
    const durableInspect = result.events.find(
      (event) =>
        event.type === 'tool.completed' &&
        (event.data as { toolName?: string }).toolName === 'inspect-source'
    );
    expect(JSON.stringify(durableInspect)).toContain('[omitted from durable session]');
    expect(JSON.stringify(durableInspect)).not.toContain('"example":"1.0.0"');
  });

  it('closes the selected card without absorbing a different dependent blocker', async () => {
    const registry = new StudioAgentToolRegistry();
    let recoveryCalls = 0;
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        recoveryCalls += 1;
        if (recoveryCalls === 1) {
          return {
            ok: false,
            output: {
              recoveryPath: 'general-source-repair',
              nextAction: 'general-source-repair',
            },
            error: 'Repair the source.',
          };
        }
        return closedCliRepairResult({
          transactionId: 'repair-dependent-blocker',
          blockerSignature: 'dependent-fixed',
        });
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({
          transactionId: 'repair-selected-card',
          workspaceStatus: 'blocked',
          remainingActionIds: ['workspaceVerify'],
        });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run canonical chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false };
      },
    });
    let verifyCalls = 0;
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        verifyCalls += 1;
        if (verifyCalls === 1) {
          return {
            ok: false,
            cardBlocking: true,
            blockerSignature: 'workspace-verify-v2',
            output: {
              activeHandoff: {
                cardId: 'workspaceVerify',
                blockers: ['Readiness passed; workspace verification is now blocking.'],
              },
            },
          };
        }
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved-v3' };
      },
    });
    let modelTurns = 0;
    const session = new StudioAgentSession(
      {
        id: 'dependent-blocker-handoff-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'readiness-v1',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next() {
          modelTurns += 1;
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Repair the current blocker.',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Resolve the complete incident graph');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(1);
    expect(recoveryCalls).toBe(1);
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'dependent-blocker-handoff' }),
      })
    );
  });

  it('rehydrates a failed durable source-repair session through one fresh deterministic recovery', async () => {
    const restoredSession: StudioAgentPersistedSession = {
      schemaVersion: 'workspai.studio-agent-session.v1',
      id: 'restored-general-source-session',
      workspacePath: '/workspace',
      cardId: 'readiness',
      assistantMode: 'agent',
      status: 'failed',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:01.000Z',
      sequence: 1,
      events: [
        {
          schemaVersion: 'workspai.studio-agent-event.v1',
          id: 'restored-general-source-session:1',
          sessionId: 'restored-general-source-session',
          sequence: 1,
          timestamp: '2026-07-20T00:00:01.000Z',
          type: 'tool.failed',
          data: {
            toolName: 'recover-active-blocker',
            ok: false,
            changed: false,
            output: {
              recoveryPath: 'general-source-repair',
              nextAction: 'general-source-repair',
              sourceCandidates: ['polyglot-app/package.json'],
            },
            error: 'Source repair required.',
          },
        },
      ],
    };
    const registry = new StudioAgentToolRegistry();
    let recoveryCalls = 0;
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        recoveryCalls += 1;
        return {
          ok: false,
          changed: false,
          blockerSignature: 'dependency-generation-2',
          output: {
            recoveryPath: 'general-source-repair',
            nextAction: 'general-source-repair',
            unresolvedProjects: ['polyglot-app'],
            sourceCandidates: ['polyglot-app/package.json'],
            dependencyDiagnostics: [{ projectName: 'polyglot-app', blockedCandidates: [{}] }],
          },
          error: 'Fresh dependency evidence still requires a source repair.',
        };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return closedCliRepairResult({
          transactionId: 'repair-restored-session',
          blockerSignature: 'dependency-generation-2',
        });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run canonical chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: false };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false };
      },
    });
    const session = new StudioAgentSession(
      {
        id: restoredSession.id,
        workspacePath: restoredSession.workspacePath,
        cardId: restoredSession.cardId,
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        restoredSession,
      },
      {
        async next(context) {
          expect(context.sourceRepairDirective).toMatchObject({
            sourceCandidates: ['polyglot-app/package.json'],
            unresolvedProjects: ['polyglot-app'],
          });
          expect(context.tools.map((tool) => tool.name)).toEqual(['apply-workspace-patch']);
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Continue the durable source repair.',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Resume readiness repair');

    expect(result.status).toBe('completed');
    expect(result.blockerSignature).toBe('dependency-generation-2');
    expect(recoveryCalls).toBe(1);
    expect(
      result.events.filter(
        (event) =>
          event.type === 'tool.requested' &&
          (event.data as { toolName?: string }).toolName === 'recover-active-blocker'
      )
    ).toHaveLength(1);
  });

  it('fails fast when a model repeatedly misses the native action contract', async () => {
    const session = new StudioAgentSession(
      {
        id: 'protocol-miss-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        { type: 'message', text: 'not an action' },
        { type: 'message', text: 'still not an action' },
        { type: 'message', text: 'again not an action' },
      ]),
      new StudioAgentToolRegistry(),
      new MemoryStore()
    );

    const result = await session.run('Repair readiness');
    expect(result.status).toBe('failed');
    expect(result.events.filter((event) => event.type === 'model.message')).toHaveLength(3);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.failed',
        data: expect.objectContaining({
          error: expect.stringContaining('native Studio tool call'),
        }),
      })
    );
  });

  it('does not reuse a successful verify from an earlier restored request', async () => {
    const restored: StudioAgentPersistedSession = {
      schemaVersion: 'workspai.studio-agent-session.v1',
      id: 'restored-session',
      workspacePath: '/workspace',
      cardId: 'readiness',
      assistantMode: 'agent',
      status: 'failed',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:01.000Z',
      sequence: 1,
      events: [
        {
          schemaVersion: 'workspai.studio-agent-event.v1',
          id: 'restored-session:1',
          sessionId: 'restored-session',
          requestId: 'old-request',
          sequence: 1,
          timestamp: '2026-07-20T00:00:01.000Z',
          type: 'verify.completed',
          data: { ok: true, cardBlocking: false },
        },
      ],
    };
    const session = new StudioAgentSession(
      {
        id: restored.id,
        workspacePath: restored.workspacePath,
        cardId: restored.cardId,
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        restoredSession: restored,
        maxTurns: 1,
      },
      sequenceModel([{ type: 'complete', summary: 'Reuse old verify' }]),
      new StudioAgentToolRegistry(),
      new MemoryStore()
    );

    const result = await session.run('Repair the current generation');
    expect(result.status).toBe('failed');
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
  });

  it('allows read-only Ask and Plan sessions to complete without blocker verification', async () => {
    for (const assistantMode of ['ask', 'plan'] as const) {
      const session = new StudioAgentSession(
        {
          id: `${assistantMode}-session`,
          workspacePath: '/workspace',
          cardId: `assistant:${assistantMode}`,
          assistantMode,
          permissionLevel: 'default',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
        },
        sequenceModel([{ type: 'complete', summary: `${assistantMode} result` }]),
        new StudioAgentToolRegistry(),
        new MemoryStore()
      );

      const result = await session.run('Explain the workspace');
      expect(result.status).toBe('completed');
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'session.completed',
          data: { summary: `${assistantMode} result` },
        })
      );
      expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
    }
  });

  it('rejects prose completion until a verify tool clears the blocker', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false, blockerSignature: 'healthy-v2' };
      },
    });
    const store = new MemoryStore();
    const session = new StudioAgentSession(
      {
        id: 'session-1',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'blocked-v1',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        { type: 'complete', summary: 'Claimed too early' },
        { type: 'tool', toolName: 'verify-blocker', input: {}, reason: 'Verify the repair' },
        { type: 'complete', summary: 'Verified repair' },
      ]),
      registry,
      store,
      () => new Date('2026-07-20T00:00:00.000Z')
    );

    const result = await session.run('Fix readiness');

    expect(result.status).toBe('completed');
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'request.started',
        'tool.requested',
        'tool.permission',
        'tool.started',
        'tool.completed',
        'verify.completed',
        'session.completed',
      ])
    );
    expect(result.events.filter((event) => event.type === 'session.completed')).toHaveLength(1);
    expect(store.saved.at(-1)?.status).toBe('completed');
    expect(store.saved.at(-1)?.blockerSignature).toBe('healthy-v2');
  });

  it('keeps permissions separate from model reasoning', async () => {
    const registry = new StudioAgentToolRegistry();
    let executed = false;
    registry.register({
      name: 'guarded-change',
      title: 'Guarded change',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        executed = true;
        return { ok: true, changed: true };
      },
    });
    const store = new MemoryStore();
    const session = new StudioAgentSession(
      {
        id: 'session-default',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        permissionLevel: 'default',
        workspaceTrusted: true,
      },
      sequenceModel([
        { type: 'tool', toolName: 'guarded-change', input: {}, reason: 'Apply change' },
        { type: 'message', text: 'Permission was denied.' },
      ]),
      registry,
      store
    );

    const running = session.run('Fix doctor');
    await new Promise((resolve) => setTimeout(resolve, 5));
    session.cancel();
    const result = await running;

    expect(executed).toBe(false);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.permission',
          data: expect.objectContaining({ allowed: false, requiresUserConfirmation: true }),
        }),
        expect.objectContaining({
          type: 'tool.failed',
          data: expect.objectContaining({
            toolName: 'guarded-change',
            error: expect.stringContaining('requires confirmation'),
          }),
        }),
      ])
    );
  });

  it('keeps full observations in the live turn but redacts file bodies from durable events', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: 'Inspect',
      description: 'Inspect source',
      inputSchema: { type: 'object' },
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return {
          ok: true,
          output: [{ path: 'src/app.ts', content: 'sensitive source body', sha256: 'abc' }],
        };
      },
    });
    let liveObservation: unknown;
    let turn = 0;
    const session = new StudioAgentSession(
      {
        id: 'redacted-session',
        workspacePath: '/workspace',
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      {
        async next(context) {
          turn += 1;
          if (turn === 1) {
            return {
              type: 'tool',
              toolName: 'inspect-source',
              input: { paths: ['src/app.ts'], patchedContent: 'must not persist' },
              reason: 'Inspect the exact source',
            };
          }
          liveObservation = context.latestObservation;
          return { type: 'complete', summary: 'Done' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Inspect');
    expect(JSON.stringify(liveObservation)).toContain('sensitive source body');
    expect(JSON.stringify(result.events)).not.toContain('sensitive source body');
    expect(JSON.stringify(result.events)).not.toContain('must not persist');
    expect(JSON.stringify(result.events)).toContain('[omitted from durable session]');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.started',
        data: expect.objectContaining({
          input: expect.objectContaining({ paths: ['src/app.ts'] }),
          reason: 'Inspect the exact source',
        }),
      })
    );
  });

  it('returns tool failures to the model and requires the latest verify to clear the card', async () => {
    const registry = new StudioAgentToolRegistry();
    let verifyCalls = 0;
    registry.register({
      name: 'change',
      title: 'Change',
      activity: 'change',
      risk: 'safe-write',
      async execute() {
        throw new Error('Patch precondition changed');
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        verifyCalls += 1;
        return verifyCalls === 1
          ? { ok: true, cardBlocking: false }
          : { ok: false, cardBlocking: true, error: 'Blocker returned' };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'latest-verify-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        { type: 'tool', toolName: 'change', input: {}, reason: 'Apply repair' },
        { type: 'tool', toolName: 'verify-blocker', input: {}, reason: 'Verify repair' },
        {
          type: 'tool',
          toolName: 'verify-blocker',
          input: {},
          reason: 'Reverify changed evidence',
        },
        { type: 'complete', summary: 'Must be rejected' },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Fix readiness');

    expect(result.status).toBe('failed');
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.failed',
          data: expect.objectContaining({ error: 'Patch precondition changed' }),
        }),
      ])
    );
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
  });

  it('supports steering an active session through the session service', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'verify-blocker',
      title: 'Verify blocker',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false };
      },
    });
    const store = new MemoryStore();
    let releaseFirstTurn: (() => void) | undefined;
    const firstTurn = new Promise<void>((resolve) => {
      releaseFirstTurn = resolve;
    });
    let calls = 0;
    const observedSteering: string[] = [];
    const service = new StudioAgentSessionService(
      () => ({
        async next(context) {
          calls += 1;
          observedSteering.push(...context.steering);
          if (calls === 1) {
            await firstTurn;
            return { type: 'message', text: 'Continuing' };
          }
          if (calls === 2) {
            return { type: 'tool', toolName: 'verify-blocker', input: {}, reason: 'Verify' };
          }
          return { type: 'complete', summary: 'Done' };
        },
      }),
      () => registry,
      store
    );
    const session = service.create({
      id: 'steering-session',
      workspacePath: '/workspace',
      cardId: 'readiness',
      assistantMode: 'agent',
      permissionLevel: 'autopilot',
      workspaceTrusted: true,
    });
    const running = session.run('Fix blocker');
    expect(service.steer(session.id, 'Prioritize the dependency owner')).toBe(true);
    releaseFirstTurn?.();

    const result = await running;
    expect(result.status).toBe('completed');
    expect(observedSteering).toContain('Prioritize the dependency owner');
    expect(result.events.some((event) => event.type === 'request.steered')).toBe(true);
  });

  it('persists local checkpoints without spending a model call on compaction', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: 'Inspect',
      activity: 'inspect',
      risk: 'read',
      async execute(input) {
        return { ok: true, output: input };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false };
      },
    });
    const actions: StudioAgentModelAction[] = Array.from({ length: 7 }, (_, index) => ({
      type: 'tool' as const,
      toolName: 'inspect-source',
      input: { path: `src/file-${index}.ts` },
      reason: `Inspect causal source ${index}`,
    }));
    actions.push(
      { type: 'tool', toolName: 'verify-blocker', input: {}, reason: 'Verify completion' },
      { type: 'complete', summary: 'Verified after durable checkpoints' }
    );
    const session = new StudioAgentSession(
      {
        id: 'durable-checkpoint-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        checkpointEvery: 2,
      },
      sequenceModel(actions),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Own the repair until verified');

    expect(result.status).toBe('completed');
    expect(
      result.events.filter((event) => event.type === 'model.checkpoint').length
    ).toBeGreaterThan(2);
    expect(
      result.events.some(
        (event) =>
          event.type === 'session.failed' &&
          String((event.data as { error?: unknown }).error).includes('turn budget')
      )
    ).toBe(false);
  });

  it('blocks repeated tool churn until causal evidence advances', async () => {
    const registry = new StudioAgentToolRegistry();
    let inspectCalls = 0;
    let sourcePatched = false;
    registry.register({
      name: 'inspect-dependency-security',
      title: 'Inspect dependency security',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        inspectCalls += 1;
        return { ok: true, evidenceGeneration: 'generation-1', output: { vulnerabilities: 2 } };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply patch',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        sourcePatched = true;
        return closedCliRepairResult({
          transactionId: 'repair-after-causal-churn',
          evidenceGeneration: 'generation-2',
        });
      },
    });
    registry.register({
      name: 'run-governed-command',
      title: 'Run canonical chain',
      activity: 'change',
      risk: 'guarded-write',
      async execute(input) {
        return { ok: true, changed: false, output: input };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return sourcePatched
          ? { ok: true, cardBlocking: false, evidenceGeneration: 'generation-3' }
          : { ok: false, cardBlocking: true, evidenceGeneration: 'generation-1' };
      },
    });
    const audit = {
      type: 'tool' as const,
      toolName: 'inspect-dependency-security',
      input: { projectName: 'web' },
      reason: 'Inspect advisory',
    };
    const session = new StudioAgentSession(
      {
        id: 'semantic-churn-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      sequenceModel([
        audit,
        audit,
        audit,
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: { patches: [] },
          reason: 'Advance source evidence',
        },
        audit,
        { type: 'tool', toolName: 'verify-blocker', input: {}, reason: 'Verify' },
        { type: 'complete', summary: 'Resolved without audit churn' },
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair dependency blocker');

    expect(result.status).toBe('completed');
    expect(inspectCalls).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.failed',
        data: expect.objectContaining({
          toolName: 'inspect-dependency-security',
          duplicate: true,
        }),
      })
    );
  });

  it('runs the canonical stop gate when the model requests completion', async () => {
    const registry = new StudioAgentToolRegistry();
    let verifyCalls = 0;
    registry.register({
      name: 'verify-blocker',
      title: 'Verify',
      activity: 'verify',
      risk: 'read',
      async execute() {
        verifyCalls += 1;
        return { ok: true, cardBlocking: false, evidenceGeneration: 'verified-v2' };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'completion-stop-gate-session',
        workspacePath: '/workspace',
        cardId: 'pipeline',
        assistantMode: 'agent',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requiresVerifiedCompletion: true,
      },
      sequenceModel([{ type: 'complete', summary: 'The repair is complete.' }]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Repair pipeline');

    expect(result.status).toBe('completed');
    expect(verifyCalls).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'completion-stop-gate' }),
      })
    );
  });

  it('streams bounded file diffs to the live UI without persisting source bodies', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-test-patch',
      title: 'Apply patch',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: true,
          changed: true,
          output: {
            patchResult: {
              patches: [
                {
                  relativePath: 'src/example.ts',
                  status: 'applied',
                  originalContent: 'const oldValue = 1;',
                  patchedContent: 'const newValue = 2;',
                  hunks: [
                    {
                      startLine: 1,
                      removedLines: ['const oldValue = 1;'],
                      addedLines: ['const newValue = 2;'],
                    },
                  ],
                },
              ],
            },
          },
        };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'live-diff-session',
        workspacePath: '/workspace',
        cardId: 'workspaceImpact',
        assistantMode: 'ask',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'apply-test-patch',
          input: { patches: [] },
          reason: 'Apply the inspected edit.',
        },
        { type: 'complete', summary: 'Applied.' },
      ]),
      registry,
      new MemoryStore()
    );
    const liveEvents: Array<Record<string, unknown>> = [];
    session.onEvent((event) => {
      if (event.type === 'tool.completed') {
        liveEvents.push(event.data as Record<string, unknown>);
      }
    });

    const result = await session.run('Apply an edit');
    const liveOutput = liveEvents[0]?.output as Record<string, unknown>;
    expect(liveOutput.fileChanges).toEqual([
      expect.objectContaining({
        relativePath: 'src/example.ts',
        diffLines: [
          { type: 'removed', content: 'const oldValue = 1;' },
          { type: 'added', content: 'const newValue = 2;' },
        ],
      }),
    ]);
    const durableEvent = result.events.find((event) => event.type === 'tool.completed');
    expect(JSON.stringify(durableEvent)).not.toContain('const oldValue');
    expect(JSON.stringify(durableEvent)).not.toContain('const newValue');
    expect(JSON.stringify(durableEvent)).not.toContain('fileChanges');
  });

  it('preserves provider call ids through execution and causal observations', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: 'Inspect source',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true, output: { inspected: true } };
      },
    });
    let turn = 0;
    const session = new StudioAgentSession(
      {
        id: 'native-call-correlation-session',
        workspacePath: '/workspace',
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      {
        async next(context) {
          turn += 1;
          if (turn === 1) {
            return {
              type: 'tool',
              callId: 'provider-call-17',
              toolName: 'inspect-source',
              input: { paths: ['package.json'] },
              reason: 'Inspect the exact source.',
            };
          }
          expect(context.recentObservations).toContainEqual(
            expect.objectContaining({
              toolCallId: 'provider-call-17',
              toolName: 'inspect-source',
            })
          );
          return { type: 'complete', summary: 'Inspected.' };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Inspect source');
    const correlatedEvents = result.events.filter((event) =>
      ['tool.requested', 'tool.started', 'tool.completed'].includes(event.type)
    );
    expect(correlatedEvents).toHaveLength(3);
    expect(correlatedEvents.every((event) => event.toolCallId === 'provider-call-17')).toBe(true);
  });

  it('streams command-produced unified diffs without persisting source bodies', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'run-workspace-command',
      title: 'Run command',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: true,
          changed: true,
          output: {
            diff: [
              'diff --git a/package.json b/package.json',
              'index 1111111..2222222 100644',
              '--- a/package.json',
              '+++ b/package.json',
              '@@ -1,3 +1,3 @@',
              ' {',
              '-  "version": "1.0.0"',
              '+  "version": "1.0.1"',
              ' }',
            ].join('\n'),
          },
        };
      },
    });
    const session = new StudioAgentSession(
      {
        id: 'command-live-diff-session',
        workspacePath: '/workspace',
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      sequenceModel([
        {
          type: 'tool',
          toolName: 'run-workspace-command',
          input: { command: 'npm install' },
          reason: 'Reconcile dependencies.',
        },
        { type: 'complete', summary: 'Reconciled.' },
      ]),
      registry,
      new MemoryStore()
    );
    const liveEvents: Array<Record<string, unknown>> = [];
    session.onEvent((event) => {
      if (event.type === 'tool.completed') {
        liveEvents.push(event.data as Record<string, unknown>);
      }
    });

    const result = await session.run('Reconcile dependencies');
    const liveOutput = liveEvents[0]?.output as Record<string, unknown>;
    expect(liveOutput.fileChanges).toEqual([
      expect.objectContaining({
        relativePath: 'package.json',
        diffLines: [
          { type: 'unchanged', content: '{' },
          { type: 'removed', content: '  "version": "1.0.0"' },
          { type: 'added', content: '  "version": "1.0.1"' },
          { type: 'unchanged', content: '}' },
        ],
      }),
    ]);
    expect(JSON.stringify(result.events)).not.toContain('"version": "1.0.0"');
    expect(JSON.stringify(result.events)).not.toContain('fileChanges');
  });
});
