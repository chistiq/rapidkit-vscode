import { describe, expect, it } from 'vitest';

import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import { requireStudioCardRepairCapability } from '../contracts/studioCardRepairCapabilities.js';
import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';
import { StudioAgentSession, type StudioAgentSessionStore } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { buildStudioBlockerHandoff } from '../core/studioBlockerHandoffBuilder.js';

class MemoryStore implements StudioAgentSessionStore {
  async save(_session: StudioAgentPersistedSession): Promise<void> {}
}

describe('Studio card repair end-to-end matrix', () => {
  it.each(DASHBOARD_EVIDENCE_CARD_IDS)(
    'accepts completion for %s only after its exact Stop Gate passes',
    async (cardId) => {
      const capability = requireStudioCardRepairCapability(cardId);
      expect(capability.targetClosure).toBe('exact-producer-and-causal-action-set');
      expect(capability.workspacePosture).toBe('reported-separately');
      const handoff = await buildStudioBlockerHandoff({
        workspacePath: '/tmp/workspai-card-stop-gate',
        card: {
          id: cardId,
          label: cardId,
          status: 'fail',
          scope: capability.scope,
          artifactPath: capability.producerArtifact,
          blockers: [`${cardId}: fixture blocker`],
        },
        ...(capability.scope === 'project'
          ? { projectPath: '/tmp/workspai-card-stop-gate/project' }
          : {}),
      });
      const registry = new StudioAgentToolRegistry();
      let verifyCalls = 0;
      let modelCalls = 0;
      registry.register({
        name: 'verify-blocker',
        title: 'Verify exact card producer',
        activity: 'verify',
        risk: 'read',
        async execute() {
          verifyCalls += 1;
          expect(handoff.verifyCommand).toBe(capability.verifyCommand);
          expect(handoff.verifyArtifact).toBe(capability.verifyArtifact);
          return {
            ok: true,
            cardBlocking: false,
            evidenceGeneration: `${cardId}-verified`,
            output: {
              exactProducerCommand: handoff.verifyCommand,
              exactProducerArtifact: handoff.verifyArtifact,
              aggregateVerifyCommand: capability.aggregateVerifyCommand,
            },
          };
        },
      });
      const session = new StudioAgentSession(
        {
          id: `card-stop-gate-${cardId}`,
          workspacePath: '/tmp/workspai-card-stop-gate',
          ...(capability.scope === 'project'
            ? { projectPath: '/tmp/workspai-card-stop-gate/project' }
            : {}),
          cardId,
          assistantMode: 'agent',
          repairPolicy: capability.repairPolicy,
          permissionLevel: 'autopilot',
          workspaceTrusted: true,
          requiresVerifiedCompletion: true,
        },
        {
          async next() {
            modelCalls += 1;
            return { type: 'complete', summary: `${cardId} repaired` };
          },
        },
        registry,
        new MemoryStore()
      );

      const result = await session.run(`Repair ${cardId}`);

      expect(result.status).toBe('completed');
      expect(verifyCalls).toBe(1);
      expect(modelCalls).toBe(capability.repairPolicy === 'refresh-producer' ? 0 : 1);
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'model.checkpoint',
          data: expect.objectContaining({
            recovery:
              capability.repairPolicy === 'refresh-producer'
                ? 'exact-producer-refresh'
                : 'completion-stop-gate',
          }),
        })
      );
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'verify.completed',
          data: expect.objectContaining({
            ok: true,
            cardBlocking: false,
          }),
        })
      );
    }
  );

  it.each(
    DASHBOARD_EVIDENCE_CARD_IDS.filter(
      (cardId) => requireStudioCardRepairCapability(cardId).repairPolicy === 'refresh-producer'
    )
  )('hands unresolved producer-owned card %s to governed source mutation', async (cardId) => {
    const registry = new StudioAgentToolRegistry();
    let modelCalls = 0;
    registry.register({
      name: 'verify-blocker',
      title: 'Refresh exact producer',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: false, cardBlocking: true, error: `${cardId} remains blocked.` };
      },
    });
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply governed source repair',
      activity: 'change',
      risk: 'guarded-write',
      async execute() {
        return {
          ok: true,
          changed: true,
          output: {
            changedPaths: ['project/source.fixture'],
            transaction: {
              transactionId: `repair-${cardId}`,
              state: 'closed',
              verification: {
                status: 'passed',
                targetStatus: 'passed',
                workspaceStatus: 'passed',
                remainingActionIds: [],
                summary: `${cardId} passed canonical verification.`,
              },
            },
          },
        };
      },
    });
    const session = new StudioAgentSession(
      {
        workspacePath: '/tmp/workspai-card-source-repair',
        cardId,
        assistantMode: 'agent',
        repairPolicy: 'refresh-producer',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
      },
      {
        async next(context) {
          modelCalls += 1;
          expect(context.sourceRepairDirective).toEqual(
            expect.objectContaining({
              nextAction: 'general-source-repair',
              cardId,
            })
          );
          expect(context.tools.map((tool) => tool.name)).toContain('apply-workspace-patch');
          return {
            type: 'tool',
            toolName: 'apply-workspace-patch',
            input: { patches: [] },
            reason: 'Apply the diagnosed causal source repair.',
          };
        },
      },
      registry,
      new MemoryStore()
    );

    const result = await session.run(`Repair ${cardId}`);

    expect(result.status).toBe('completed');
    expect(modelCalls).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'model.checkpoint',
        data: expect.objectContaining({ recovery: 'producer-to-source-repair' }),
      })
    );
  });
});
