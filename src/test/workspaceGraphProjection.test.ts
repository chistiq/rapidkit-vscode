import { describe, expect, it } from 'vitest';

import { parseWorkspaceGraphProjection } from '../contracts/workspaceGraphProjection.js';
import {
  buildWorkspaceGraphProjection,
  encodeWorkspaceGraphProjection,
  sanitizeWorkspaceGraphPath,
} from '../core/workspaceGraphProjection.js';

describe('workspace graph explorer projection', () => {
  it('preserves canonical identities, proof paths, trust, and revision provenance', () => {
    const projection = buildWorkspaceGraphProjection({
      schemaVersion: 'workspace-knowledge-graph.v1',
      generatedAt: '2026-07-22T00:00:00.000Z',
      source: { hash: 'a'.repeat(64) },
      entities: [
        {
          id: 'project:api',
          kind: 'project',
          label: 'API',
          identity: { scope: 'project' },
          attributes: { path: 'apps/api', runtime: 'node' },
          proofIds: ['proof:package'],
        },
      ],
      relations: [],
      proofs: [
        {
          id: 'proof:package',
          provider: 'package-json',
          artifact: 'apps/api/package.json',
          line: 1,
          trust: 'authoritative',
          freshness: 'fresh',
        },
      ],
      providers: [{ id: 'package-json', status: 'passed', proofCount: 1 }],
      quality: { entityProofCoverageRatio: 1 },
      diagnostics: [],
    });

    expect(projection).toMatchObject({
      schemaVersion: 'workspace-graph-projection.v1',
      sourceSchemaVersion: 'workspace-knowledge-graph.v1',
      revision: 'a'.repeat(64),
      truncated: false,
      total: { entities: 1, relations: 0, proofs: 1 },
    });
    expect(projection.entities[0]).toMatchObject({
      id: 'project:api',
      scope: 'project',
      path: 'apps/api',
      proofIds: ['proof:package'],
    });
    expect(projection.proofs[0]).toMatchObject({
      artifact: 'apps/api/package.json',
      trust: 'authoritative',
      freshness: 'fresh',
    });
    expect(
      parseWorkspaceGraphProjection(
        encodeWorkspaceGraphProjection({
          schemaVersion: 'workspace-knowledge-graph.v1',
          entities: [],
          relations: [],
          proofs: [],
          providers: [],
          quality: {},
          diagnostics: [],
        })
      )
    ).not.toBeNull();
  });

  it('bounds large projections and removes relations outside the selected entity window', () => {
    const entities = Array.from({ length: 510 }, (_, index) => ({
      id: `entity:${index}`,
      kind: 'file',
      label: `File ${index}`,
      identity: { scope: 'project' },
      attributes: {},
      proofIds: [],
    }));
    const projection = buildWorkspaceGraphProjection({
      schemaVersion: 'workspace-knowledge-graph.v1',
      entities,
      relations: [
        {
          id: 'outside',
          from: 'entity:0',
          to: 'entity:509',
          kind: 'references',
          proofIds: [],
        },
      ],
      proofs: [],
      providers: [],
      quality: {},
      diagnostics: [],
    });

    expect(projection.entities).toHaveLength(500);
    expect(projection.relations).toHaveLength(0);
    expect(projection.truncated).toBe(true);
    expect(projection.total.entities).toBe(510);
  });

  it('keeps changed entities inside a bounded live projection', () => {
    const entities = Array.from({ length: 510 }, (_, index) => ({
      id: `entity:${index}`,
      kind: 'file',
      label: `File ${index}`,
      attributes: {},
      proofIds: [],
    }));
    const projection = buildWorkspaceGraphProjection(
      {
        schemaVersion: 'workspace-knowledge-graph.v1',
        entities,
        relations: [],
        proofs: [],
        providers: [],
        quality: {},
        diagnostics: [],
      },
      { focusEntityIds: ['entity:509'] }
    );

    expect(projection.entities[0].id).toBe('entity:509');
    expect(projection.entities).toHaveLength(500);
  });

  it('redacts local machine paths before the projection crosses into the Webview', () => {
    expect(
      sanitizeWorkspaceGraphPath('/home/alice/Documents/company/api/src/auth.ts', ['api'])
    ).toBe('external/api/src/auth.ts');
    expect(
      sanitizeWorkspaceGraphPath('C:\\Users\\alice\\company\\api\\src\\auth.ts', ['api'])
    ).toBe('external/api/src/auth.ts');
    expect(sanitizeWorkspaceGraphPath('/Users/alice/secrets.txt')).toBe('redacted/secrets.txt');

    const projection = buildWorkspaceGraphProjection({
      schemaVersion: 'workspace-knowledge-graph.v1',
      projectTopology: { nodes: [{ id: 'api' }] },
      entities: [
        {
          id: 'file:auth',
          kind: 'file',
          label: 'auth.ts',
          projectId: 'api',
          identity: { scope: 'project' },
          attributes: { path: '/home/alice/Documents/company/api/src/auth.ts' },
          proofIds: ['proof:auth'],
        },
      ],
      relations: [],
      proofs: [
        {
          id: 'proof:auth',
          artifact: '/home/alice/Documents/company/api/src/auth.ts',
        },
      ],
      providers: [],
      quality: {},
      diagnostics: [],
    });

    expect(projection.entities[0].path).toBe('external/api/src/auth.ts');
    expect(projection.proofs[0].artifact).toBe('external/api/src/auth.ts');
    expect(JSON.stringify(projection)).not.toContain('/home/alice');
  });

  it('uses deterministic project-and-kind sampling for large polyglot graphs', () => {
    const structuralEntities = ['typescript', 'rust', 'python', 'go'].flatMap(
      (language, projectIndex) => [
        {
          id: `project:${language}`,
          kind: 'project',
          label: language,
          projectId: language,
          attributes: {},
          proofIds: [],
        },
        {
          id: `language:${language}`,
          kind: 'language',
          label: language,
          projectId: language,
          attributes: { projectIndex },
          proofIds: [],
        },
        {
          id: `runtime:${language}`,
          kind: 'runtime-unit',
          label: `${language} runtime`,
          projectId: language,
          attributes: {},
          proofIds: [],
        },
      ]
    );
    const symbols = Array.from({ length: 800 }, (_, index) => ({
      id: `symbol:${index}`,
      kind: 'symbol',
      label: `Symbol ${index}`,
      projectId: ['typescript', 'rust', 'python', 'go'][index % 4],
      attributes: {},
      proofIds: [],
    }));
    const raw = {
      schemaVersion: 'workspace-knowledge-graph.v1',
      entities: [...symbols, ...structuralEntities],
      relations: [],
      proofs: [],
      providers: [],
      quality: {},
      diagnostics: [],
    };

    const first = buildWorkspaceGraphProjection(raw);
    const second = buildWorkspaceGraphProjection(raw);
    expect(first.entities).toHaveLength(500);
    expect(first.entities.map((entity) => entity.id)).toEqual(
      second.entities.map((entity) => entity.id)
    );
    for (const language of ['typescript', 'rust', 'python', 'go']) {
      expect(first.entities.some((entity) => entity.id === `project:${language}`)).toBe(true);
      expect(first.entities.some((entity) => entity.id === `language:${language}`)).toBe(true);
      expect(first.entities.some((entity) => entity.id === `runtime:${language}`)).toBe(true);
    }
  });
});
