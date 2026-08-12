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
  column?: number;
  observedAt?: string;
  derivation?: string;
  trust?: string;
  confidence?: string;
  freshness?: string;
  detail?: string;
};

export type WorkspaceGraphProviderProjection = {
  id: string;
  version?: string;
  status?: string;
  permission?: string;
  discoveredEntities?: number;
  discoveredRelations?: number;
  proofCount?: number;
  diagnostics: string[];
};

export type WorkspaceGraphInputScopeProjection = {
  kind: string;
  id: string;
  strategy?: string;
  fileCount?: number;
  fileLimit?: number;
  truncated?: boolean;
};

export type WorkspaceGraphBindingCoverageProjection = {
  eligibleCount: number;
  boundCount: number;
  unknownCount: number;
  coverageRatio: number | null;
};

export type WorkspaceGraphQualityProjection = {
  [key: string]:
    | number
    | string
    | boolean
    | Record<string, WorkspaceGraphBindingCoverageProjection>
    | undefined;
  entityCount?: number;
  relationCount?: number;
  proofCount?: number;
  entityProofCoverageRatio?: number;
  relationProofCoverageRatio?: number;
  providerSuccessRatio?: number;
  conflictCount?: number;
  unknownCount?: number;
  portable?: boolean;
  secretValuesEmitted?: boolean;
  bindingCoverage?: Record<string, WorkspaceGraphBindingCoverageProjection>;
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
  workspace?: { name?: string; profile?: string };
  source?: {
    artifact?: string;
    strategy?: string;
    inputHash?: string;
    scopes: WorkspaceGraphInputScopeProjection[];
  };
  providers: WorkspaceGraphProviderProjection[];
  quality: WorkspaceGraphQualityProjection;
  diagnostics: Array<{
    code: string;
    severity: string;
    message: string;
    recommendation?: string;
    entityIds?: string[];
    relationIds?: string[];
  }>;
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
