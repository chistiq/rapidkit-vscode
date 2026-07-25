export type WorkspaceGraphStreamEventType =
  | 'graph.snapshot'
  | 'graph.delta'
  | 'graph.provider-progress'
  | 'graph.quality-changed'
  | 'graph.proof-invalidated'
  | 'graph.resync-required'
  | 'graph.paused'
  | 'graph.complete'
  | 'graph.heartbeat'
  | 'graph.error';

export type WorkspaceGraphStreamEnvelope = {
  schemaVersion: 'workspace-graph-stream.v1';
  type: WorkspaceGraphStreamEventType;
  workspaceId: string;
  sessionId: string;
  generation: number;
  baseRevision?: number;
  baseModelHash?: string;
  baseGraphHash?: string;
  revision: number;
  modelHash: string;
  graphHash: string;
  generatedAt: string;
  causationId: string;
  correlationId: string;
  payload: Record<string, unknown>;
};

export type WorkspaceGraphStreamState = {
  workspaceId: string;
  sessionId: string;
  generation: number;
  revision: number;
  modelHash: string;
  graphHash: string;
  entities: Map<string, Record<string, unknown>>;
  relations: Map<string, Record<string, unknown>>;
  proofs: Map<string, Record<string, unknown>>;
  providers: Map<string, Record<string, unknown>>;
  quality: Record<string, unknown>;
  diagnostics: unknown[];
};

export type WorkspaceGraphStreamApplyResult =
  | { status: 'applied'; state: WorkspaceGraphStreamState }
  | { status: 'ignored'; state: WorkspaceGraphStreamState; reason: 'duplicate' }
  | {
      status: 'resync-required';
      state: WorkspaceGraphStreamState | null;
      reason:
        | 'revision-gap'
        | 'identity-mismatch'
        | 'generation-regression'
        | 'schema-unsupported'
        | 'hash-discontinuity'
        | 'validation-failed';
    };

export function createWorkspaceGraphReplaySnapshot(
  state: WorkspaceGraphStreamState,
  generatedAt = new Date().toISOString()
): WorkspaceGraphStreamEnvelope {
  const replayId = `replay:${state.sessionId}:${state.revision}`;
  return {
    schemaVersion: 'workspace-graph-stream.v1',
    type: 'graph.snapshot',
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    generation: state.generation,
    revision: state.revision,
    modelHash: state.modelHash,
    graphHash: state.graphHash,
    generatedAt,
    causationId: replayId,
    correlationId: replayId,
    payload: {
      replay: true,
      graph: {
        entities: [...state.entities.values()],
        relations: [...state.relations.values()],
        proofs: [...state.proofs.values()],
        providers: [...state.providers.values()],
        quality: state.quality,
        diagnostics: state.diagnostics,
      },
    },
  };
}

function recordsById(value: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const result = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id) {
      return null;
    }
    result.set(record.id, record);
  }
  return result;
}

function stringIds(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

function applyCollectionDelta(
  current: Map<string, Record<string, unknown>>,
  added: unknown,
  updated: unknown,
  removed: unknown
): Map<string, Record<string, unknown>> | null {
  const additions = recordsById(added);
  const updates = recordsById(updated);
  const removals = stringIds(removed);
  if (!additions || !updates || !removals) {
    return null;
  }
  const next = new Map(current);
  for (const id of removals) {
    next.delete(id);
  }
  for (const [id, record] of additions) {
    next.set(id, record);
  }
  for (const [id, record] of updates) {
    if (!next.has(id)) {
      return null;
    }
    next.set(id, record);
  }
  return next;
}

export function applyWorkspaceGraphStreamEvent(
  state: WorkspaceGraphStreamState | null,
  event: WorkspaceGraphStreamEnvelope
): WorkspaceGraphStreamApplyResult {
  if (event.schemaVersion !== 'workspace-graph-stream.v1') {
    return { status: 'resync-required', state, reason: 'schema-unsupported' };
  }
  if (event.type === 'graph.snapshot') {
    const graph = event.payload.graph;
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    const raw = graph as Record<string, unknown>;
    const entities = recordsById(raw.entities);
    const relations = recordsById(raw.relations);
    const proofs = recordsById(raw.proofs);
    const providers = recordsById(raw.providers);
    if (!entities || !relations || !proofs || !providers) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    return {
      status: 'applied',
      state: {
        workspaceId: event.workspaceId,
        sessionId: event.sessionId,
        generation: event.generation,
        revision: event.revision,
        modelHash: event.modelHash,
        graphHash: event.graphHash,
        entities,
        relations,
        proofs,
        providers,
        quality:
          raw.quality && typeof raw.quality === 'object' && !Array.isArray(raw.quality)
            ? (raw.quality as Record<string, unknown>)
            : {},
        diagnostics: Array.isArray(raw.diagnostics) ? raw.diagnostics : [],
      },
    };
  }
  if (!state) {
    return { status: 'resync-required', state, reason: 'revision-gap' };
  }
  if (event.workspaceId !== state.workspaceId || event.sessionId !== state.sessionId) {
    return { status: 'resync-required', state, reason: 'identity-mismatch' };
  }
  if (event.generation < state.generation) {
    return { status: 'resync-required', state, reason: 'generation-regression' };
  }
  if (event.type !== 'graph.delta') {
    return { status: 'applied', state };
  }
  if (event.revision === state.revision && event.graphHash === state.graphHash) {
    return { status: 'ignored', state, reason: 'duplicate' };
  }
  if (event.baseRevision !== state.revision || event.revision !== state.revision + 1) {
    return { status: 'resync-required', state, reason: 'revision-gap' };
  }
  if (event.baseGraphHash !== state.graphHash || event.baseModelHash !== state.modelHash) {
    return { status: 'resync-required', state, reason: 'hash-discontinuity' };
  }
  const entities = applyCollectionDelta(
    state.entities,
    event.payload.entitiesAdded,
    event.payload.entitiesUpdated,
    event.payload.entitiesRemoved
  );
  const relations = applyCollectionDelta(
    state.relations,
    event.payload.relationsAdded,
    event.payload.relationsUpdated,
    event.payload.relationsRemoved
  );
  const proofs = applyCollectionDelta(
    state.proofs,
    event.payload.proofsAdded,
    event.payload.proofsUpdated,
    event.payload.proofsRemoved
  );
  const providers = applyCollectionDelta(state.providers, [], event.payload.providersUpdated, []);
  if (!entities || !relations || !proofs || !providers) {
    return { status: 'resync-required', state, reason: 'validation-failed' };
  }
  for (const relation of relations.values()) {
    if (!entities.has(String(relation.from)) || !entities.has(String(relation.to))) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
  }
  return {
    status: 'applied',
    state: {
      ...state,
      generation: event.generation,
      revision: event.revision,
      modelHash: event.modelHash,
      graphHash: event.graphHash,
      entities,
      relations,
      proofs,
      providers,
      quality:
        event.payload.quality && typeof event.payload.quality === 'object'
          ? (event.payload.quality as Record<string, unknown>)
          : state.quality,
      diagnostics: Array.isArray(event.payload.diagnostics)
        ? event.payload.diagnostics
        : state.diagnostics,
    },
  };
}
