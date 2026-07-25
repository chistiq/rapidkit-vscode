import { performance } from 'node:perf_hooks';
import { afterAll, describe, expect, it } from 'vitest';

import { buildWorkspaceGraphProjection } from '../core/workspaceGraphProjection.js';

const FIXTURE_SIZES = [1_000, 10_000, 50_000, 100_000] as const;
const benchmarkCases: Array<{
  entities: number;
  elapsedMs: number;
  retainedBytes: number;
  visibleEntities: number;
}> = [];

describe('Workspace Graph large-workspace acceptance matrix', () => {
  afterAll(() => {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 'workspace-graph-benchmark.v1',
        generatedAt: new Date().toISOString(),
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        cases: benchmarkCases,
      })}\n`
    );
  });

  it.each(FIXTURE_SIZES)(
    'keeps the %i-entity projection bounded and preserves late focus identity',
    (size) => {
      const entities = Array.from({ length: size }, (_, index) => ({
        id: `entity:${index}`,
        kind: index % 10 === 0 ? 'service' : 'file',
        label: `Entity ${index}`,
        projectId: `project:${index % 50}`,
        attributes: { path: `projects/${index % 50}/src/${index}.ts` },
        proofIds: [`proof:${index}`],
      }));
      const relations = Array.from({ length: size }, (_, index) => ({
        id: `relation:${index}`,
        from: `entity:${index}`,
        to: `entity:${(index + 1) % size}`,
        kind: 'depends_on',
        proofIds: [`proof:${index}`],
      }));
      const proofs = Array.from({ length: size }, (_, index) => ({
        id: `proof:${index}`,
        provider: 'benchmark',
        artifact: `projects/${index % 50}/src/${index}.ts`,
      }));

      const startedAt = performance.now();
      const projection = buildWorkspaceGraphProjection(
        {
          schemaVersion: 'workspace-knowledge-graph.v1',
          source: { hash: `benchmark-${size}` },
          entities,
          relations,
          proofs,
          providers: [],
          quality: {},
          diagnostics: [],
        },
        { focusEntityIds: [`entity:${size - 1}`] }
      );
      const elapsedMs = performance.now() - startedAt;
      const retainedBytes = Buffer.byteLength(JSON.stringify(projection), 'utf8');
      benchmarkCases.push({
        entities: size,
        elapsedMs: Number(elapsedMs.toFixed(3)),
        retainedBytes,
        visibleEntities: projection.entities.length,
      });

      expect(projection.total).toEqual({
        entities: size,
        relations: size,
        proofs: size,
      });
      expect(projection.entities).toHaveLength(500);
      expect(projection.entities[0]?.id).toBe(`entity:${size - 1}`);
      expect(projection.highlightedEntityIds).toEqual([`entity:${size - 1}`]);
      expect(projection.truncated).toBe(true);
      expect(retainedBytes).toBeLessThan(2_000_000);
      if (size === 10_000) {
        expect(elapsedMs).toBeLessThan(1_500);
      }
    },
    20_000
  );
});
