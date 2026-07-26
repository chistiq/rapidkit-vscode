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

describe('Studio Agent session runtime', () => {
  it('runs deterministic blocker recovery before spending a model decision', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: true, evidenceGeneration: 'source-v2' };
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

  it('closes a single audit-authorized dependency upgrade without another model decision', async () => {
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
      name: 'repair-dependency-security',
      title: 'Bounded dependency repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: false,
          output: {
            target: { projectName: 'atlas-web' },
            nextAction: 'upgrade-dependency-security',
            upgradeCandidates: [{ packageName: 'next', currentRange: '16.2.10', target: 'latest' }],
          },
          error: 'Non-force repair requires a direct upgrade.',
        };
      },
    });
    registry.register({
      name: 'upgrade-dependency-security',
      title: 'Upgrade dependency',
      activity: 'change',
      risk: 'guarded-write',
      async execute(input) {
        return { ok: true, changed: true, output: input };
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
        return { ok: true, cardBlocking: false, blockerSignature: 'resolved-v2' };
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
          return {
            type: 'tool',
            toolName: 'inspect-dependency-security',
            input: { projectName: 'atlas-web' },
            reason: 'Inspect the dependency blocker',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear readiness');

    expect(result.status).toBe('completed');
    expect(modelTurns).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.requested',
        data: expect.objectContaining({
          toolName: 'upgrade-dependency-security',
          input: { projectName: 'atlas-web', packageName: 'next' },
        }),
      })
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'dependency-upgrade-transaction' }),
      })
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'dependency-bounded-repair' }),
      })
    );
  });

  it('attempts bounded repair for transitive audit findings without direct upgrade candidates', async () => {
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
      name: 'repair-dependency-security',
      title: 'Bounded dependency repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return { ok: true, changed: true };
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
        return { ok: true, cardBlocking: false };
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
      ]),
      registry,
      new MemoryStore()
    );

    const result = await session.run('Clear transitive dependency findings');

    expect(result.status).toBe('completed');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool.requested',
        data: expect.objectContaining({ toolName: 'repair-dependency-security' }),
      })
    );
  });

  it('runs the governed chain and verify without another model turn after a source mutation', async () => {
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
    ).toHaveLength(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'session.completed',
        data: expect.objectContaining({ summary: expect.stringContaining('Post-mutation') }),
      })
    );
  });

  it('refuses completion when the canonical chain failed after the latest source mutation', async () => {
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
        data: expect.objectContaining({ error: expect.stringContaining('turn budget') }),
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
        return { ok: true, changed: true, evidenceGeneration: 'source-generation-2' };
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
        return { ok: true, changed: true };
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
        return { ok: true, changed: true, evidenceGeneration: 'generation-2' };
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
});
