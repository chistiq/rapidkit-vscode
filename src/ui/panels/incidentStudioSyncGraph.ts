import { indexProjectSystemGraph } from '../../core/systemGraphIndexer';
import type { IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared';

export type SyncSystemGraphSnapshot = {
  requestId?: string;
  workspacePath: string;
  projectPath?: string;
  graphVersion: string;
  nodes: Array<{
    id: string;
    type:
      | 'route'
      | 'controller'
      | 'service'
      | 'model'
      | 'datastore'
      | 'test'
      | 'infra-service'
      | 'db-schema';
    label: string;
    filePath?: string;
    symbolName?: string;
    startLine?: number;
    confidence: number;
  }>;
  edges: Array<{
    sourceId: string;
    targetId: string;
    relation: string;
  }>;
  summary: {
    nodeCount: number;
    edgeCount: number;
    supportedTopology: string;
  };
};

/**
 * Build a lightweight system graph snapshot for workspace sync (architecture lens bootstrap).
 */
export async function buildSyncSystemGraphSnapshot(input: {
  requestId?: string;
  workspacePath: string;
  projectPath?: string;
  graphSnapshot: IncidentWorkspaceGraphSnapshot;
}): Promise<SyncSystemGraphSnapshot> {
  const { workspacePath, projectPath, graphSnapshot } = input;
  const selectedProjectPath = projectPath || graphSnapshot.project.selectedProject?.path;
  const moduleSeeds =
    graphSnapshot.topology.topModules.length > 0
      ? graphSnapshot.topology.topModules.slice(0, 4)
      : ['core'];

  const indexedGraph = await indexProjectSystemGraph({
    workspacePath,
    projectPath: selectedProjectPath || undefined,
    framework: graphSnapshot.project.framework,
    kit: graphSnapshot.project.kit,
  });

  const nodes: SyncSystemGraphSnapshot['nodes'] =
    indexedGraph.nodes.length > 0
      ? indexedGraph.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label,
          filePath: node.filePath,
          confidence: node.confidence,
          symbolName: node.symbolName,
          startLine: node.startLine,
        }))
      : moduleSeeds.map((moduleName) => ({
          id: `service:${moduleName}`,
          type: 'service' as const,
          label: `${moduleName} service`,
          filePath: `src/${moduleName}`,
          confidence: 70,
        }));

  const edges =
    indexedGraph.edges.length > 0
      ? indexedGraph.edges.map((edge) => ({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          relation: edge.relation,
        }))
      : [];

  if (
    selectedProjectPath &&
    nodes.length > 0 &&
    !nodes.some((node) => node.type === 'route' || node.type === 'controller')
  ) {
    nodes.unshift({
      id: 'route:entry',
      type: 'route',
      label: 'project entry route',
      filePath: selectedProjectPath,
      confidence: 65,
    });
    if (nodes.length > 1) {
      edges.push({
        sourceId: 'route:entry',
        targetId: nodes[1].id,
        relation: 'calls',
      });
    }
  }

  if (edges.length === 0) {
    for (let index = 0; index < moduleSeeds.length - 1; index += 1) {
      edges.push({
        sourceId: `service:${moduleSeeds[index]}`,
        targetId: `service:${moduleSeeds[index + 1]}`,
        relation: 'depends-on',
      });
    }
  }

  const supportedTopology =
    indexedGraph.supportedTopology ||
    graphSnapshot.project.kit ||
    graphSnapshot.project.framework ||
    'unknown';

  return {
    requestId: input.requestId,
    workspacePath,
    projectPath: selectedProjectPath,
    graphVersion: graphSnapshot.snapshotVersion || 'v1',
    nodes,
    edges,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      supportedTopology,
    },
  };
}
