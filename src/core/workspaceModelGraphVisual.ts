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

function asFiniteNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function parseOperationalProfile(value: unknown): WorkspaceGraphNodeOperationalProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const weight = typeof record.weight === 'string' ? record.weight : '';
  if (!weight) {
    return undefined;
  }
  const centrality =
    record.centrality && typeof record.centrality === 'object' && !Array.isArray(record.centrality)
      ? (record.centrality as Record<string, unknown>)
      : undefined;
  return {
    weight,
    ...(typeof record.score === 'number' ? { score: record.score } : {}),
    ...(typeof record.verificationPriority === 'string'
      ? { verificationPriority: record.verificationPriority }
      : {}),
    ...(Array.isArray(record.reasons)
      ? { reasons: record.reasons.filter((entry): entry is string => typeof entry === 'string') }
      : {}),
    ...(centrality
      ? {
          centrality: {
            ...(typeof centrality.fanIn === 'number' ? { fanIn: centrality.fanIn } : {}),
            ...(typeof centrality.fanOut === 'number' ? { fanOut: centrality.fanOut } : {}),
            ...(typeof centrality.reach === 'number' ? { reach: centrality.reach } : {}),
            ...(typeof centrality.betweenness === 'number'
              ? { betweenness: centrality.betweenness }
              : {}),
            ...(typeof centrality.isHotspot === 'boolean'
              ? { isHotspot: centrality.isHotspot }
              : {}),
          },
        }
      : {}),
  };
}

function parseGraphDiagnostics(value: unknown): WorkspaceGraphPreviewDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const code = typeof record.code === 'string' ? record.code.trim() : '';
      const message = typeof record.message === 'string' ? record.message.trim() : '';
      const severity = typeof record.severity === 'string' ? record.severity : 'info';
      if (!code || !message) {
        return null;
      }
      return {
        code,
        severity,
        message,
        ...(typeof record.recommendation === 'string'
          ? { recommendation: record.recommendation }
          : {}),
        ...(Array.isArray(record.nodeIds)
          ? { nodeIds: record.nodeIds.filter((item): item is string => typeof item === 'string') }
          : {}),
      };
    })
    .filter((entry): entry is WorkspaceGraphPreviewDiagnostic => Boolean(entry))
    .slice(0, 8);
}

export function parseWorkspaceGraphFromModel(
  modelRaw: Record<string, unknown>
): WorkspaceGraphPreviewPayload {
  const graph =
    modelRaw.graph && typeof modelRaw.graph === 'object'
      ? (modelRaw.graph as Record<string, unknown>)
      : {};
  const stats =
    graph.stats && typeof graph.stats === 'object' ? (graph.stats as Record<string, unknown>) : {};
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

  const nodes: WorkspaceGraphPreviewNode[] = rawNodes
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      if (!id) {
        return null;
      }
      const operationalProfile = parseOperationalProfile(record.operationalProfile);
      return {
        id,
        label: id,
        ...(typeof record.runtime === 'string' ? { runtime: record.runtime } : {}),
        ...(typeof record.framework === 'string' ? { framework: record.framework } : {}),
        ...(typeof record.path === 'string' ? { path: record.path } : {}),
        ...(operationalProfile ? { operationalProfile } : {}),
      };
    })
    .filter((node): node is WorkspaceGraphPreviewNode => Boolean(node))
    .slice(0, 24);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: WorkspaceGraphPreviewEdge[] = rawEdges
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const from =
        typeof record.from === 'string'
          ? record.from
          : typeof record.source === 'string'
            ? record.source
            : '';
      const to =
        typeof record.to === 'string'
          ? record.to
          : typeof record.target === 'string'
            ? record.target
            : '';
      if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) {
        return null;
      }
      return {
        from,
        to,
        ...(typeof record.kind === 'string' ? { kind: record.kind } : {}),
        ...(typeof record.source === 'string' ? { source: record.source } : {}),
        ...(typeof record.confidence === 'string' ? { confidence: record.confidence } : {}),
        ...(typeof record.evidence === 'string' || Array.isArray(record.evidence)
          ? { evidence: record.evidence as string | string[] }
          : {}),
      };
    })
    .filter((edge): edge is WorkspaceGraphPreviewEdge => Boolean(edge))
    .slice(0, 32);

  const orphanCount =
    asFiniteNumber(stats.orphanCount) ??
    nodes.filter((node) => !edges.some((edge) => edge.from === node.id || edge.to === node.id))
      .length;
  const density =
    asFiniteNumber(stats.density) ??
    (nodes.length > 1 ? edges.length / Math.max(1, nodes.length * (nodes.length - 1)) : 0);

  return {
    nodes,
    edges,
    stats: {
      nodeCount: asFiniteNumber(stats.nodeCount) ?? nodes.length,
      edgeCount: asFiniteNumber(stats.edgeCount) ?? edges.length,
      ...(asFiniteNumber(stats.inferredEdges) !== undefined
        ? { inferredEdges: asFiniteNumber(stats.inferredEdges) }
        : {}),
      ...(asFiniteNumber(stats.contractEdges) !== undefined
        ? { contractEdges: asFiniteNumber(stats.contractEdges) }
        : {}),
      ...(asFiniteNumber(stats.manualEdges) !== undefined
        ? { manualEdges: asFiniteNumber(stats.manualEdges) }
        : {}),
      ...(asFiniteNumber(stats.authoritativeEdges) !== undefined
        ? { authoritativeEdges: asFiniteNumber(stats.authoritativeEdges) }
        : {}),
      ...(asFiniteNumber(stats.lowConfidenceEdges) !== undefined
        ? { lowConfidenceEdges: asFiniteNumber(stats.lowConfidenceEdges) }
        : {}),
      hasCycle: stats.hasCycle === true,
      orphanCount,
      ...(asFiniteNumber(stats.connectedNodeCount) !== undefined
        ? { connectedNodeCount: asFiniteNumber(stats.connectedNodeCount) }
        : {}),
      density,
      ...(asFiniteNumber(stats.edgeCoverageRatio) !== undefined
        ? { edgeCoverageRatio: asFiniteNumber(stats.edgeCoverageRatio) }
        : {}),
      ...(asFiniteNumber(stats.evidenceCoverageRatio) !== undefined
        ? { evidenceCoverageRatio: asFiniteNumber(stats.evidenceCoverageRatio) }
        : {}),
      ...(asFiniteNumber(stats.hotspotCount) !== undefined
        ? { hotspotCount: asFiniteNumber(stats.hotspotCount) }
        : {}),
    },
    diagnostics: parseGraphDiagnostics(graph.diagnostics),
  };
}

export function buildWorkspaceModelDetailSections(modelRaw: Record<string, unknown>): Array<{
  id: string;
  title: string;
  body: string;
}> {
  const summary =
    modelRaw.summary && typeof modelRaw.summary === 'object'
      ? (modelRaw.summary as Record<string, unknown>)
      : {};
  const workspace =
    modelRaw.workspace && typeof modelRaw.workspace === 'object'
      ? (modelRaw.workspace as Record<string, unknown>)
      : {};
  const validation =
    modelRaw.validation && typeof modelRaw.validation === 'object'
      ? (modelRaw.validation as Record<string, unknown>)
      : {};
  const graphPreview = parseWorkspaceGraphFromModel(modelRaw);

  const projectCount = Number(summary.projectCount ?? graphPreview.stats?.nodeCount ?? 0);
  const profile = typeof workspace.profile === 'string' ? workspace.profile : 'unknown';
  const runtimes = Array.isArray(summary.runtimes)
    ? summary.runtimes.filter((entry): entry is string => typeof entry === 'string').join(', ')
    : '';
  const frameworks = Array.isArray(summary.frameworks)
    ? summary.frameworks.filter((entry): entry is string => typeof entry === 'string').join(', ')
    : '';

  const overviewLines = [
    `Profile: ${profile}`,
    `Projects: ${projectCount}`,
    runtimes ? `Runtimes: ${runtimes}` : 'Runtimes: none detected',
    frameworks ? `Frameworks: ${frameworks}` : 'Frameworks: none detected',
    `Graph: ${graphPreview.stats?.nodeCount ?? 0} node(s) · ${graphPreview.stats?.edgeCount ?? 0} edge(s)`,
    graphPreview.stats?.hasCycle ? 'Cycle: detected in dependency graph' : 'Cycle: none',
    `Validation: ${String(validation.status ?? 'unknown')} (${Number(validation.errors ?? 0)} errors · ${Number(validation.warnings ?? 0)} warnings)`,
  ];

  const sections: Array<{ id: string; title: string; body: string }> = [
    {
      id: 'workspace-model-overview',
      title: 'Model overview',
      body: overviewLines.join('\n'),
    },
    {
      id: 'workspace-graph',
      title: 'Dependency graph',
      body: `${WORKSPACE_GRAPH_SECTION_PREFIX}${JSON.stringify(graphPreview)}`,
    },
  ];

  const issues = Array.isArray(validation.issues) ? validation.issues : [];
  if (issues.length > 0) {
    const issueLines = issues
      .slice(0, 6)
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const code = typeof record.code === 'string' ? record.code : 'issue';
        const message = typeof record.message === 'string' ? record.message : '';
        return `${code}: ${message}`;
      })
      .filter((line): line is string => Boolean(line));
    if (issueLines.length > 0) {
      sections.push({
        id: 'workspace-model-validation',
        title: 'Validation notes',
        body: issueLines.join('\n'),
      });
    }
  }

  return sections;
}
