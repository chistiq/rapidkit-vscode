import { describe, expect, it } from 'vitest';

import {
  applyWorkspaceGraphStreamEvent,
  createWorkspaceGraphReplaySnapshot,
  type WorkspaceGraphStreamEnvelope,
} from '../contracts/workspaceGraphStream.js';

const hash = (character: string) => character.repeat(64);

function event(
  type: WorkspaceGraphStreamEnvelope['type'],
  payload: Record<string, unknown>,
  overrides: Partial<WorkspaceGraphStreamEnvelope> = {}
): WorkspaceGraphStreamEnvelope {
  return {
    schemaVersion: 'workspace-graph-stream.v1',
    type,
    workspaceId: 'workspace:one',
    sessionId: 'session:one',
    generation: 1,
    revision: 1,
    modelHash: hash('a'),
    graphHash: hash('b'),
    generatedAt: '2026-07-22T00:00:00.000Z',
    causationId: 'cause:one',
    correlationId: 'correlation:one',
    payload,
    ...overrides,
  };
}

describe('workspace graph stream reducer', () => {
  const snapshot = event('graph.snapshot', {
    graph: {
      entities: [{ id: 'project:a' }],
      relations: [],
      proofs: [],
      providers: [{ id: 'filesystem' }],
      quality: { entityCount: 1 },
      diagnostics: [],
    },
  });

  it('replays an atomic delta only when revision and hash chains match', () => {
    const hydrated = applyWorkspaceGraphStreamEvent(null, snapshot);
    expect(hydrated.status).toBe('applied');
    if (hydrated.status !== 'applied') return;

    const result = applyWorkspaceGraphStreamEvent(
      hydrated.state,
      event(
        'graph.delta',
        {
          entitiesAdded: [{ id: 'project:b' }],
          entitiesUpdated: [],
          entitiesRemoved: [],
          relationsAdded: [{ id: 'depends', from: 'project:a', to: 'project:b' }],
          relationsUpdated: [],
          relationsRemoved: [],
          proofsAdded: [],
          proofsUpdated: [],
          proofsRemoved: [],
          providersUpdated: [{ id: 'filesystem', status: 'passed' }],
          quality: { entityCount: 2 },
          diagnostics: [],
        },
        {
          baseRevision: 1,
          revision: 2,
          baseModelHash: hash('a'),
          baseGraphHash: hash('b'),
          modelHash: hash('c'),
          graphHash: hash('d'),
        }
      )
    );

    expect(result.status).toBe('applied');
    if (result.status === 'applied') {
      expect([...result.state.entities]).toHaveLength(2);
      expect([...result.state.relations]).toHaveLength(1);
      expect(result.state.revision).toBe(2);
    }
  });

  it.each([
    [{ baseRevision: 0 }, 'revision-gap'],
    [{ baseGraphHash: hash('f') }, 'hash-discontinuity'],
    [{ workspaceId: 'workspace:other' }, 'identity-mismatch'],
    [{ generation: 0 }, 'generation-regression'],
  ] as const)('requests resync for invalid continuity %#', (override, reason) => {
    const hydrated = applyWorkspaceGraphStreamEvent(null, snapshot);
    if (hydrated.status !== 'applied') throw new Error('fixture hydration failed');
    const result = applyWorkspaceGraphStreamEvent(
      hydrated.state,
      event(
        'graph.delta',
        {
          entitiesAdded: [],
          entitiesUpdated: [],
          entitiesRemoved: [],
          relationsAdded: [],
          relationsUpdated: [],
          relationsRemoved: [],
          proofsAdded: [],
          proofsUpdated: [],
          proofsRemoved: [],
          providersUpdated: [],
          diagnostics: [],
        },
        {
          baseRevision: 1,
          revision: 2,
          baseModelHash: hash('a'),
          baseGraphHash: hash('b'),
          ...override,
        }
      )
    );
    expect(result).toMatchObject({ status: 'resync-required', reason });
  });

  it('serializes retained state into an identity-preserving replay snapshot', () => {
    const hydrated = applyWorkspaceGraphStreamEvent(null, snapshot);
    if (hydrated.status !== 'applied') throw new Error('fixture hydration failed');
    const replay = createWorkspaceGraphReplaySnapshot(hydrated.state, '2026-07-23T00:00:00.000Z');
    expect(replay).toMatchObject({
      type: 'graph.snapshot',
      workspaceId: hydrated.state.workspaceId,
      sessionId: hydrated.state.sessionId,
      generation: hydrated.state.generation,
      revision: hydrated.state.revision,
      modelHash: hydrated.state.modelHash,
      graphHash: hydrated.state.graphHash,
      generatedAt: '2026-07-23T00:00:00.000Z',
      payload: { replay: true },
    });
  });
});
