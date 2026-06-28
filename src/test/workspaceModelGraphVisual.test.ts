import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceModelDetailSections,
  parseWorkspaceGraphFromModel,
  WORKSPACE_GRAPH_SECTION_PREFIX,
} from '../core/workspaceModelGraphVisual';

describe('workspaceModelGraphVisual', () => {
  it('parses graph nodes and edges from workspace model report', () => {
    const graph = parseWorkspaceGraphFromModel({
      graph: {
        nodes: [
          {
            id: 'api',
            runtime: 'node',
            framework: 'nestjs',
            path: 'apps/api',
            operationalProfile: {
              weight: 'high',
              score: 50,
              verificationPriority: 'strict',
              reasons: ['Change reaches 1 dependent project(s)'],
              centrality: { fanIn: 1, fanOut: 0, reach: 1, betweenness: 0, isHotspot: false },
            },
          },
          { id: 'web', runtime: 'node', framework: 'nextjs', path: 'apps/web' },
        ],
        edges: [
          {
            from: 'web',
            to: 'api',
            kind: 'depends_on',
            source: 'package-json',
            confidence: 'high',
            evidence: ['workspace:*'],
          },
        ],
        stats: {
          nodeCount: 2,
          edgeCount: 1,
          inferredEdges: 1,
          contractEdges: 0,
          manualEdges: 0,
          authoritativeEdges: 0,
          lowConfidenceEdges: 0,
          orphanCount: 0,
          connectedNodeCount: 2,
          density: 0.5,
          edgeCoverageRatio: 1,
          evidenceCoverageRatio: 1,
          hotspotCount: 0,
          hasCycle: false,
        },
        diagnostics: [
          {
            code: 'graph.low_confidence_edges',
            severity: 'info',
            message: '1 inferred edge(s) are low confidence.',
            recommendation: 'Promote important low-confidence relationships.',
            nodeIds: ['api'],
          },
        ],
      },
    });

    expect(graph.nodes).toEqual([
      {
        id: 'api',
        label: 'api',
        runtime: 'node',
        framework: 'nestjs',
        path: 'apps/api',
        operationalProfile: {
          weight: 'high',
          score: 50,
          verificationPriority: 'strict',
          reasons: ['Change reaches 1 dependent project(s)'],
          centrality: { fanIn: 1, fanOut: 0, reach: 1, betweenness: 0, isHotspot: false },
        },
      },
      { id: 'web', label: 'web', runtime: 'node', framework: 'nextjs', path: 'apps/web' },
    ]);
    expect(graph.edges).toEqual([
      {
        from: 'web',
        to: 'api',
        kind: 'depends_on',
        source: 'package-json',
        confidence: 'high',
        evidence: ['workspace:*'],
      },
    ]);
    expect(graph.stats).toEqual({
      nodeCount: 2,
      edgeCount: 1,
      inferredEdges: 1,
      contractEdges: 0,
      manualEdges: 0,
      authoritativeEdges: 0,
      lowConfidenceEdges: 0,
      hasCycle: false,
      orphanCount: 0,
      connectedNodeCount: 2,
      density: 0.5,
      edgeCoverageRatio: 1,
      evidenceCoverageRatio: 1,
      hotspotCount: 0,
    });
    expect(graph.diagnostics).toEqual([
      {
        code: 'graph.low_confidence_edges',
        severity: 'info',
        message: '1 inferred edge(s) are low confidence.',
        recommendation: 'Promote important low-confidence relationships.',
        nodeIds: ['api'],
      },
    ]);
  });

  it('builds overview and graph detail sections instead of raw JSON', () => {
    const sections = buildWorkspaceModelDetailSections({
      workspace: { profile: 'minimal' },
      summary: { projectCount: 0, runtimes: [], frameworks: [] },
      validation: { status: 'passed', errors: 0, warnings: 1, issues: [] },
      graph: { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0 } },
    });

    expect(sections.map((section) => section.id)).toEqual([
      'workspace-model-overview',
      'workspace-graph',
    ]);
    expect(sections[0]?.body).toContain('Profile: minimal');
    expect(sections[0]?.body).toContain('Projects: 0');
    expect(sections[1]?.body.startsWith(WORKSPACE_GRAPH_SECTION_PREFIX)).toBe(true);
    expect(sections[1]?.body).toContain('"nodes":[]');
  });

  it('marks isolated projects when the model has nodes but no edges', () => {
    const graph = parseWorkspaceGraphFromModel({
      graph: {
        nodes: [
          { id: 'web', runtime: 'node' },
          { id: 'api', runtime: 'python' },
        ],
        edges: [],
        stats: { nodeCount: 2, edgeCount: 0 },
      },
    });

    expect(graph.stats?.edgeCount).toBe(0);
    expect(graph.stats?.orphanCount).toBe(2);
    expect(graph.stats?.density).toBe(0);
  });
});
