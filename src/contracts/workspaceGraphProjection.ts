export const WORKSPACE_GRAPH_PROJECTION_PREFIX = '__workspace_graph_projection_v1__:';

export type WorkspaceGraphEntityProjection = {
  id: string;
  kind: string;
  label: string;
  projectId?: string;
  path?: string;
  scope?: string;
  proofIds: string[];
  attributes: Record<string, unknown>;
};

export type WorkspaceGraphRelationProjection = {
  id: string;
  from: string;
  to: string;
  kind: string;
  derivation?: string;
  trust?: string;
  confidence?: string;
  proofIds: string[];
};

export type WorkspaceGraphProofProjection = {
  id: string;
  provider?: string;
  artifact?: string;
  pointer?: string;
  line?: number;
  trust?: string;
  confidence?: string;
  freshness?: string;
};

export type WorkspaceGraphProjection = {
  schemaVersion: 'workspace-graph-projection.v1';
  sourceSchemaVersion: string;
  generatedAt?: string;
  revision: string;
  truncated: boolean;
  total: { entities: number; relations: number; proofs: number };
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  proofs: WorkspaceGraphProofProjection[];
  providers: Array<{ id: string; status?: string; proofCount?: number }>;
  quality: Record<string, number | string | boolean>;
  diagnostics: Array<{ code: string; severity: string; message: string; recommendation?: string }>;
  highlightedEntityIds?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseWorkspaceGraphProjection(body: string): WorkspaceGraphProjection | null {
  if (!body.startsWith(WORKSPACE_GRAPH_PROJECTION_PREFIX)) {
    return null;
  }
  try {
    const parsed = JSON.parse(body.slice(WORKSPACE_GRAPH_PROJECTION_PREFIX.length)) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== 'workspace-graph-projection.v1') {
      return null;
    }
    if (!Array.isArray(parsed.entities) || !Array.isArray(parsed.relations)) {
      return null;
    }
    return parsed as WorkspaceGraphProjection;
  } catch {
    return null;
  }
}

export function findWorkspaceGraphProjection(
  sections: Array<{ id: string; body: string }> | undefined
): WorkspaceGraphProjection | null {
  const section = sections?.find((entry) => entry.id === 'workspace-graph-projection');
  return section ? parseWorkspaceGraphProjection(section.body) : null;
}
