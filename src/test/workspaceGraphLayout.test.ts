import { describe, expect, it } from 'vitest';
import { layoutWorkspaceGraph } from '../../webview-ui/src/lib/workspaceGraphLayout.js';

describe('workspace graph worker layout', () => {
  it('is deterministic, finite, and preserves request identity', () => {
    const request = {
      requestId: 7,
      nodes: [
        { id: 'workspace:demo', kind: 'workspace' },
        { id: 'project:api', kind: 'project', projectId: 'api' },
        { id: 'service:api', kind: 'service', projectId: 'api' },
      ],
      edges: [
        { from: 'workspace:demo', to: 'project:api' },
        { from: 'project:api', to: 'service:api' },
      ],
    };
    const first = layoutWorkspaceGraph(request);
    const second = layoutWorkspaceGraph(request);
    expect(first).toEqual(second);
    expect(first.requestId).toBe(7);
    expect(first.points).toHaveLength(3);
    expect(
      first.points.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
      )
    ).toBe(true);
  });

  it('enforces the bounded 500-node rendering contract', () => {
    const result = layoutWorkspaceGraph({
      requestId: 1,
      nodes: Array.from({ length: 520 }, (_, index) => ({
        id: `file:${index}`,
        kind: 'file',
      })),
      edges: [],
    });
    expect(result.points).toHaveLength(500);
  });
});
