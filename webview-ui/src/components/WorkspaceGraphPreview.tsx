import type { WorkspaceGraphPreviewPayload } from '@/lib/workspaceModelGraphVisual';

type LayoutNode = {
  id: string;
  label: string;
  runtime?: string;
  framework?: string;
  operationalProfile?: WorkspaceGraphPreviewPayload['nodes'][number]['operationalProfile'];
  x: number;
  y: number;
};

function graphDensityLabel(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown density';
  }
  if (value === 0) {
    return '0% density';
  }
  return `${Math.max(1, Math.round(value * 100))}% density`;
}

function edgeKindLabel(kind?: string): string {
  return (kind ?? 'dependency').replace(/[_-]+/g, ' ');
}

function nodeMeta(node: LayoutNode): string {
  return [node.framework, node.runtime].filter(Boolean).join(' / ') || 'project';
}

function percentLabel(value?: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.round(value * 100)}%`;
}

function graphDiagnosticSeverityLabel(severity?: string): string {
  if (severity === 'error') {
    return 'Error';
  }
  if (severity === 'warning') {
    return 'Warning';
  }
  return 'Info';
}

function topOperationalNodes(nodes: LayoutNode[]): LayoutNode[] {
  const weightRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return [...nodes]
    .filter((node) => node.operationalProfile)
    .sort((a, b) => {
      const aProfile = a.operationalProfile;
      const bProfile = b.operationalProfile;
      return (
        (weightRank[bProfile?.weight ?? ''] ?? 0) - (weightRank[aProfile?.weight ?? ''] ?? 0) ||
        (bProfile?.score ?? 0) - (aProfile?.score ?? 0) ||
        a.label.localeCompare(b.label)
      );
    });
}

function layoutGraphNodes(payload: WorkspaceGraphPreviewPayload): LayoutNode[] {
  const count = payload.nodes.length;
  if (count === 0) {
    return [];
  }

  const centerX = 160;
  const centerY = 88;
  const radius = count === 1 ? 0 : Math.min(72, 28 + count * 8);

  return payload.nodes.map((node, index) => {
    if (count === 1) {
      return { ...node, x: centerX, y: centerY };
    }
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

export function WorkspaceGraphPreview({
  payload,
  compact = false,
}: {
  payload: WorkspaceGraphPreviewPayload;
  compact?: boolean;
}) {
  const nodes = layoutGraphNodes(payload);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const width = compact ? 280 : 320;
  const height = compact ? 140 : 176;
  const edgeCount = payload.stats?.edgeCount ?? payload.edges.length;
  const nodeCount = payload.stats?.nodeCount ?? nodes.length;
  const orphanCount =
    payload.stats?.orphanCount ??
    nodes.filter(
      (node) => !payload.edges.some((edge) => edge.from === node.id || edge.to === node.id)
    ).length;
  const edgeCoverage = percentLabel(payload.stats?.edgeCoverageRatio);
  const evidenceCoverage = percentLabel(payload.stats?.evidenceCoverageRatio);
  const diagnostics = payload.diagnostics ?? [];
  const topNodes = topOperationalNodes(nodes);

  if (nodes.length === 0) {
    return (
      <div className="workspace-graph-preview workspace-graph-preview--empty">
        <div className="workspace-graph-preview__empty-shell" aria-hidden="true">
          <span className="workspace-graph-preview__empty-node" />
          <span className="workspace-graph-preview__empty-line" />
          <span className="workspace-graph-preview__empty-node workspace-graph-preview__empty-node--ghost" />
        </div>
        <p>No projects in the graph yet — import or scaffold a service to populate the model.</p>
      </div>
    );
  }

  if (edgeCount === 0) {
    return (
      <div className="workspace-graph-preview workspace-graph-preview--edge-empty">
        <div className="workspace-graph-preview__meta">
          <span>{nodeCount} project(s)</span>
          <span>0 dependency edge(s)</span>
          <span>{orphanCount} isolated node(s)</span>
          {edgeCoverage ? <span>{edgeCoverage} coverage</span> : null}
        </div>
        <div className="workspace-graph-preview__diagnostic">
          <strong>{diagnostics[0]?.message ?? 'No dependency edges discovered'}</strong>
          <p>
            {diagnostics[0]?.recommendation ??
              'Projects were detected, but the model has no cross-project evidence yet. The map cannot answer blast-radius, ownership, or verify-order questions until dependency evidence is added.'}
          </p>
          <ul>
            <li>Run graph explain to inspect why no edges were inferred.</li>
            <li>Generate the workspace contract graph when services communicate by API/events.</li>
            <li>Add graph overrides for known operational dependencies that code imports miss.</li>
          </ul>
        </div>
        <div
          className="workspace-graph-preview__node-list"
          aria-label="Detected projects without dependency edges"
        >
          {nodes.slice(0, compact ? 4 : 8).map((node) => (
            <span key={node.id} className="workspace-graph-preview__node-chip">
              <strong>{node.label}</strong>
              <small>
                {nodeMeta(node)}
                {node.operationalProfile?.weight ? ` · ${node.operationalProfile.weight}` : ''}
              </small>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-graph-preview workspace-graph-preview--connected">
      <div className="workspace-graph-preview__meta">
        <span>{nodeCount} project(s)</span>
        <span>{edgeCount} edge(s)</span>
        <span>{graphDensityLabel(payload.stats?.density)}</span>
        {edgeCoverage ? <span>{edgeCoverage} coverage</span> : null}
        {evidenceCoverage ? <span>{evidenceCoverage} evidence</span> : null}
        {payload.stats?.authoritativeEdges ? (
          <span>{payload.stats.authoritativeEdges} authoritative</span>
        ) : null}
        {payload.stats?.lowConfidenceEdges ? (
          <span>{payload.stats.lowConfidenceEdges} low confidence</span>
        ) : null}
        {payload.stats?.hotspotCount ? <span>{payload.stats.hotspotCount} hotspot(s)</span> : null}
        {orphanCount > 0 ? <span>{orphanCount} isolated</span> : null}
        {payload.stats?.hasCycle ? (
          <span className="workspace-graph-preview__warn">cycle</span>
        ) : null}
      </div>
      {diagnostics.length > 0 ? (
        <div className="workspace-graph-preview__diagnostic-list">
          {diagnostics.slice(0, compact ? 1 : 3).map((diagnostic) => (
            <span
              key={`${diagnostic.code}-${diagnostic.severity}`}
              className={`workspace-graph-preview__diagnostic-pill workspace-graph-preview__diagnostic-pill--${diagnostic.severity}`}
            >
              <strong>{graphDiagnosticSeverityLabel(diagnostic.severity)}</strong>
              {diagnostic.message}
            </span>
          ))}
        </div>
      ) : null}
      <svg
        className="workspace-graph-preview__canvas"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Workspace dependency graph with ${nodes.length} nodes`}
      >
        {payload.edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) {
            return null;
          }
          return (
            <g key={`${edge.from}-${edge.to}-${edge.kind ?? 'edge'}`}>
              <line
                className="workspace-graph-preview__edge"
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              />
              <text
                className="workspace-graph-preview__edge-label"
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 4}
                textAnchor="middle"
              >
                {edgeKindLabel(edge.kind)}
              </text>
            </g>
          );
        })}
        {nodes.map((node) => (
          <g key={node.id} className="workspace-graph-preview__node">
            <circle className="workspace-graph-preview__node-dot" cx={node.x} cy={node.y} r={18} />
            <text
              className="workspace-graph-preview__node-label"
              x={node.x}
              y={node.y - 24}
              textAnchor="middle"
            >
              {node.label}
            </text>
            {node.runtime || node.framework ? (
              <text
                className="workspace-graph-preview__node-meta"
                x={node.x}
                y={node.y + 30}
                textAnchor="middle"
              >
                {nodeMeta(node)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="workspace-graph-preview__insights">
        {payload.edges.slice(0, compact ? 2 : 4).map((edge) => (
          <span key={`${edge.from}-${edge.to}-${edge.kind ?? 'edge'}-${edge.source ?? 'source'}`}>
            <strong>{edge.from}</strong>
            {' -> '}
            <strong>{edge.to}</strong>
            <small>
              {edgeKindLabel(edge.kind)}
              {edge.confidence ? ` · ${edge.confidence}` : ''}
              {edge.source ? ` · ${edge.source}` : ''}
            </small>
          </span>
        ))}
      </div>
      {topNodes.length > 0 ? (
        <div className="workspace-graph-preview__operational">
          {topNodes.slice(0, compact ? 2 : 4).map((node) => (
            <span key={`${node.id}-${node.operationalProfile?.weight ?? 'weight'}`}>
              <strong>{node.label}</strong>
              <small>
                {node.operationalProfile?.weight}
                {typeof node.operationalProfile?.score === 'number'
                  ? ` · score ${node.operationalProfile.score}`
                  : ''}
                {node.operationalProfile?.verificationPriority
                  ? ` · ${node.operationalProfile.verificationPriority}`
                  : ''}
              </small>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
