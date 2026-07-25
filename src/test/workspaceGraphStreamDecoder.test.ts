import { describe, expect, it } from 'vitest';
import { WorkspaceGraphNdjsonDecoder } from '../core/workspaceGraphStreamDecoder.js';

const snapshot = {
  schemaVersion: 'workspace-graph-stream.v1',
  type: 'graph.snapshot',
  workspaceId: 'workspace:test',
  sessionId: 'session-1',
  generation: 1,
  revision: 1,
  modelHash: 'model-1',
  graphHash: 'graph-1',
  generatedAt: '2026-07-22T00:00:00.000Z',
  causationId: 'cause-1',
  correlationId: 'correlation-1',
  payload: { graph: {} },
};

describe('WorkspaceGraphNdjsonDecoder', () => {
  it('decodes fragmented and batched contract events', () => {
    const decoder = new WorkspaceGraphNdjsonDecoder();
    const encoded = JSON.stringify(snapshot);
    expect(decoder.push(encoded.slice(0, 20))).toEqual([]);
    expect(decoder.push(`${encoded.slice(20)}\n${encoded}\n`)).toHaveLength(2);
  });

  it('fails closed for malformed and unsupported lines', () => {
    const decoder = new WorkspaceGraphNdjsonDecoder();
    expect(decoder.push('{bad}\n{"schemaVersion":"other"}\n')).toEqual([]);
  });
});
