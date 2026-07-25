import type {
  WorkspaceGraphStreamEnvelope,
  WorkspaceGraphStreamState,
} from '../contracts/workspaceGraphStream.js';

export const DEFAULT_WORKSPACE_GRAPH_MEMORY_BUDGET_BYTES = 250 * 1024 * 1024;

export type WorkspaceGraphMemorySample = {
  estimatedBytes: number;
  budgetBytes: number;
  utilizationRatio: number;
  exceeded: boolean;
};

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function fixedStateBytes(state: WorkspaceGraphStreamState): number {
  return jsonBytes({
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    generation: state.generation,
    revision: state.revision,
    modelHash: state.modelHash,
    graphHash: state.graphHash,
    entities: [],
    relations: [],
    proofs: [],
    providers: [],
    quality: state.quality,
    diagnostics: state.diagnostics,
  });
}

function recordBytes(record: Record<string, unknown>): number {
  return jsonBytes(record) + 1;
}

function hydrateCollection(
  target: Map<string, number>,
  source: Map<string, Record<string, unknown>>
): void {
  target.clear();
  for (const [id, record] of source) {
    target.set(id, recordBytes(record));
  }
}

function changedIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) =>
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>).id === 'string'
      ? [(entry as Record<string, unknown>).id as string]
      : []
  );
}

function removedIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function reconcileCollection(
  sizes: Map<string, number>,
  source: Map<string, Record<string, unknown>>,
  added: unknown,
  updated: unknown,
  removed: unknown
): void {
  for (const id of removedIds(removed)) {
    sizes.delete(id);
  }
  for (const id of [...changedIds(added), ...changedIds(updated)]) {
    const record = source.get(id);
    if (record) {
      sizes.set(id, recordBytes(record));
    }
  }
}

export class WorkspaceGraphMemoryAccountant {
  private readonly entities = new Map<string, number>();
  private readonly relations = new Map<string, number>();
  private readonly proofs = new Map<string, number>();
  private readonly providers = new Map<string, number>();
  private fixedBytes = 0;
  private identity: string | null = null;

  public reset(): void {
    this.entities.clear();
    this.relations.clear();
    this.proofs.clear();
    this.providers.clear();
    this.fixedBytes = 0;
    this.identity = null;
  }

  public estimate(state: WorkspaceGraphStreamState, event?: WorkspaceGraphStreamEnvelope): number {
    const identity = `${state.workspaceId}\0${state.sessionId}`;
    if (!event || event.type === 'graph.snapshot' || this.identity !== identity) {
      hydrateCollection(this.entities, state.entities);
      hydrateCollection(this.relations, state.relations);
      hydrateCollection(this.proofs, state.proofs);
      hydrateCollection(this.providers, state.providers);
      this.identity = identity;
    } else if (event.type === 'graph.delta') {
      reconcileCollection(
        this.entities,
        state.entities,
        event.payload.entitiesAdded,
        event.payload.entitiesUpdated,
        event.payload.entitiesRemoved
      );
      reconcileCollection(
        this.relations,
        state.relations,
        event.payload.relationsAdded,
        event.payload.relationsUpdated,
        event.payload.relationsRemoved
      );
      reconcileCollection(
        this.proofs,
        state.proofs,
        event.payload.proofsAdded,
        event.payload.proofsUpdated,
        event.payload.proofsRemoved
      );
      reconcileCollection(this.providers, state.providers, [], event.payload.providersUpdated, []);
    }
    this.fixedBytes = fixedStateBytes(state);
    return (
      this.fixedBytes +
      sumValues(this.entities) +
      sumValues(this.relations) +
      sumValues(this.proofs) +
      sumValues(this.providers)
    );
  }

  public sample(
    state: WorkspaceGraphStreamState,
    event: WorkspaceGraphStreamEnvelope | undefined,
    budgetBytes = DEFAULT_WORKSPACE_GRAPH_MEMORY_BUDGET_BYTES
  ): WorkspaceGraphMemorySample {
    const normalizedBudget = Math.max(1, Math.floor(budgetBytes));
    const estimatedBytes = this.estimate(state, event);
    return {
      estimatedBytes,
      budgetBytes: normalizedBudget,
      utilizationRatio: estimatedBytes / normalizedBudget,
      exceeded: estimatedBytes > normalizedBudget,
    };
  }
}

function sumValues(values: Map<string, number>): number {
  let total = 0;
  for (const value of values.values()) {
    total += value;
  }
  return total;
}

export function estimateWorkspaceGraphStreamStateBytes(state: WorkspaceGraphStreamState): number {
  return new WorkspaceGraphMemoryAccountant().estimate(state);
}

export function sampleWorkspaceGraphMemoryBudget(
  state: WorkspaceGraphStreamState,
  budgetBytes = DEFAULT_WORKSPACE_GRAPH_MEMORY_BUDGET_BYTES
): WorkspaceGraphMemorySample {
  return new WorkspaceGraphMemoryAccountant().sample(state, undefined, budgetBytes);
}
