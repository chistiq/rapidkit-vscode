import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceGraphStreamSupervisor,
  type WorkspaceGraphWatchProcess,
} from '../core/workspaceGraphStreamSupervisor.js';

function snapshot(revision = 1) {
  return {
    schemaVersion: 'workspace-graph-stream.v1',
    type: 'graph.snapshot',
    workspaceId: 'workspace:test',
    sessionId: 'session-1',
    generation: 1,
    revision,
    modelHash: 'model-1',
    graphHash: 'graph-1',
    generatedAt: '2026-07-22T00:00:00.000Z',
    causationId: 'cause-1',
    correlationId: 'correlation-1',
    payload: {
      graph: {
        entities: [{ id: 'workspace:test', kind: 'workspace', label: 'test' }],
        relations: [],
        proofs: [],
        providers: [],
        quality: {},
        diagnostics: [],
      },
    },
  };
}

function fakeProcess(): WorkspaceGraphWatchProcess & {
  stdout(value: string): void;
  killed: boolean;
} {
  let stdoutListener: (chunk: string) => void = () => undefined;
  let killed = false;
  return {
    onStdoutChunk: (listener) => (stdoutListener = listener),
    onStderrChunk: () => undefined,
    completed: new Promise(() => undefined),
    kill: () => {
      killed = true;
    },
    stdout: (value) => stdoutListener(value),
    get killed() {
      return killed;
    },
  };
}

describe('WorkspaceGraphStreamSupervisor', () => {
  it('owns one watcher and exposes only applied revision state', () => {
    const child = fakeProcess();
    const onEvent = vi.fn();
    const spawn = vi.fn(() => child);
    const supervisor = new WorkspaceGraphStreamSupervisor({ spawn, onEvent });

    supervisor.start('/workspace');
    child.stdout(`${JSON.stringify(snapshot())}\n`);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(supervisor.snapshot()?.revision).toBe(1);
    supervisor.stop();
    expect(child.killed).toBe(true);
  });

  it('replays retained state after a Webview reload without spawning a second watcher', () => {
    const child = fakeProcess();
    const onEvent = vi.fn();
    const spawn = vi.fn(() => child);
    const supervisor = new WorkspaceGraphStreamSupervisor({ spawn, onEvent });

    supervisor.start('/workspace');
    child.stdout(`${JSON.stringify(snapshot())}\n`);
    supervisor.start('/workspace');

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1][0]).toMatchObject({
      type: 'graph.snapshot',
      workspaceId: 'workspace:test',
      sessionId: 'session-1',
      payload: { replay: true },
    });
  });

  it('stops the watcher before publishing state that exceeds the memory ceiling', () => {
    const child = fakeProcess();
    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const onMemorySample = vi.fn();
    const supervisor = new WorkspaceGraphStreamSupervisor({
      spawn: () => child,
      onEvent,
      onStatus,
      onMemorySample,
      memoryBudgetBytes: 32,
    });

    supervisor.start('/workspace');
    child.stdout(`${JSON.stringify(snapshot())}\n`);

    expect(child.killed).toBe(true);
    expect(supervisor.snapshot()).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onMemorySample).toHaveBeenCalledWith(
      expect.objectContaining({ exceeded: true, budgetBytes: 32 })
    );
    expect(onStatus).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('memory-budget-exceeded')
    );
  });

  it('requests a clean resync when a delta has a revision gap', async () => {
    const children = [fakeProcess(), fakeProcess()];
    const statuses: string[] = [];
    const spawn = vi.fn(() => children.shift()!);
    const supervisor = new WorkspaceGraphStreamSupervisor({
      spawn,
      onStatus: (status) => statuses.push(status),
    });
    supervisor.start('/workspace');
    const first = spawn.mock.results[0].value;
    first.stdout(`${JSON.stringify(snapshot())}\n`);
    first.stdout(
      `${JSON.stringify({
        ...snapshot(3),
        type: 'graph.delta',
        generation: 2,
        baseRevision: 1,
        baseModelHash: 'model-1',
        baseGraphHash: 'graph-1',
        modelHash: 'model-2',
        graphHash: 'graph-2',
        payload: {
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
        },
      })}\n`
    );
    await Promise.resolve();
    expect(statuses).toContain('resyncing');
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
