export type WorkspaceGraphPreviewNode = {
  id: string;
  label: string;
  runtime?: string;
  framework?: string;
  path?: string;
  operationalProfile?: WorkspaceGraphNodeOperationalProfile;
};

export type WorkspaceGraphNodeOperationalProfile = {
  weight: 'low' | 'medium' | 'high' | 'critical' | string;
  score?: number;
  verificationPriority?: 'normal' | 'elevated' | 'strict' | string;
  reasons?: string[];
  centrality?: {
    fanIn?: number;
    fanOut?: number;
    reach?: number;
    betweenness?: number;
    isHotspot?: boolean;
  };
};

export type WorkspaceGraphPreviewEdge = {
  from: string;
  to: string;
  kind?: string;
  source?: string;
  confidence?: string;
  evidence?: string | string[];
};

export type WorkspaceGraphPreviewPayload = {
  nodes: WorkspaceGraphPreviewNode[];
  edges: WorkspaceGraphPreviewEdge[];
  stats?: {
    nodeCount?: number;
    edgeCount?: number;
    inferredEdges?: number;
    contractEdges?: number;
    manualEdges?: number;
    authoritativeEdges?: number;
    lowConfidenceEdges?: number;
    hasCycle?: boolean;
    orphanCount?: number;
    connectedNodeCount?: number;
    density?: number;
    edgeCoverageRatio?: number;
    evidenceCoverageRatio?: number;
    hotspotCount?: number;
  };
  diagnostics?: WorkspaceGraphPreviewDiagnostic[];
};

export type WorkspaceGraphPreviewDiagnostic = {
  code: string;
  severity: 'info' | 'warning' | 'error' | string;
  message: string;
  recommendation?: string;
  nodeIds?: string[];
};

export const WORKSPACE_GRAPH_SECTION_PREFIX = '__graph__:';

export function parseGraphSectionBody(body: string): WorkspaceGraphPreviewPayload | null {
  if (!body.startsWith(WORKSPACE_GRAPH_SECTION_PREFIX)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      body.slice(WORKSPACE_GRAPH_SECTION_PREFIX.length)
    ) as WorkspaceGraphPreviewPayload;
    if (!parsed || !Array.isArray(parsed.nodes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function findWorkspaceGraphSection(
  sections: Array<{ id: string; body: string }> | undefined
): WorkspaceGraphPreviewPayload | null {
  if (!sections?.length) {
    return null;
  }
  const graphSection =
    sections.find((section) => section.id === 'workspace-graph') ??
    sections.find((section) => section.body.startsWith(WORKSPACE_GRAPH_SECTION_PREFIX));
  if (!graphSection) {
    return null;
  }
  return parseGraphSectionBody(graphSection.body);
}
