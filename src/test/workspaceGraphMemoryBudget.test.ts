import { describe, expect, it } from 'vitest';

import type { WorkspaceGraphStreamState } from '../contracts/workspaceGraphStream.js';
import {
  estimateWorkspaceGraphStreamStateBytes,
  sampleWorkspaceGraphMemoryBudget,
  WorkspaceGraphMemoryAccountant,
} from '../core/workspaceGraphMemoryBudget.js';

function state(entityCount: number): WorkspaceGraphStreamState {
  return {
    workspaceId: 'workspace:test',
    sessionId: 'session:test',
    generation: 1,
    revision: 1,
    modelHash: 'model',
    graphHash: 'graph',
    entities: new Map(
      Array.from({ length: entityCount }, (_, index) => [
        `entity:${index}`,
        {
          id: `entity:${index}`,
          kind: 'file',
          label: `Entity ${index}`,
          path: `src/${index}.ts`,
        },
      ])
    ),
    relations: new Map(),
    proofs: new Map(),
    providers: new Map(),
    quality: {},
    diagnostics: [],
  };
}

describe('Workspace Graph memory budget', () => {
  it('measures retained stream state rather than the bounded Webview projection', () => {
    const small = estimateWorkspaceGraphStreamStateBytes(state(10));
    const large = estimateWorkspaceGraphStreamStateBytes(state(1_000));
    expect(large).toBeGreaterThan(small);
  });

  it('reports deterministic utilization and ceiling violations', () => {
    const graph = state(100);
    const estimatedBytes = estimateWorkspaceGraphStreamStateBytes(graph);
    expect(sampleWorkspaceGraphMemoryBudget(graph, estimatedBytes)).toMatchObject({
      estimatedBytes,
      budgetBytes: estimatedBytes,
      utilizationRatio: 1,
      exceeded: false,
    });
    expect(sampleWorkspaceGraphMemoryBudget(graph, estimatedBytes - 1).exceeded).toBe(true);
  });

  it('updates changed identities without rescanning unchanged graph records', () => {
    const initial = state(1_000);
    const accountant = new WorkspaceGraphMemoryAccountant();
    const before = accountant.estimate(initial);
    const updated: WorkspaceGraphStreamState = {
      ...initial,
      revision: 2,
      entities: new Map(initial.entities),
    };
    updated.entities.set('entity:999', {
      id: 'entity:999',
      kind: 'service',
      label: 'A much larger changed service record',
      path: 'services/changed/index.ts',
      description: 'changed'.repeat(100),
    });
    const after = accountant.estimate(updated, {
      schemaVersion: 'workspace-graph-stream.v1',
      type: 'graph.delta',
      workspaceId: updated.workspaceId,
      sessionId: updated.sessionId,
      generation: updated.generation,
      baseRevision: 1,
      revision: 2,
      modelHash: updated.modelHash,
      graphHash: updated.graphHash,
      generatedAt: '2026-07-23T00:00:00.000Z',
      causationId: 'cause',
      correlationId: 'correlation',
      payload: {
        entitiesAdded: [],
        entitiesUpdated: [updated.entities.get('entity:999')],
        entitiesRemoved: [],
        relationsAdded: [],
        relationsUpdated: [],
        relationsRemoved: [],
        proofsAdded: [],
        proofsUpdated: [],
        proofsRemoved: [],
        providersUpdated: [],
      },
    });
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(estimateWorkspaceGraphStreamStateBytes(updated));
  });
});
