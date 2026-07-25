import {
  WORKSPACE_GRAPH_PROJECTION_PREFIX,
  type WorkspaceGraphEntityProjection,
  type WorkspaceGraphProjection,
  type WorkspaceGraphProofProjection,
  type WorkspaceGraphRelationProjection,
} from '../contracts/workspaceGraphProjection.js';

const MAX_ENTITIES = 500;
const MAX_RELATIONS = 1_000;
const MAX_PROOFS = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function entityProjection(value: unknown): WorkspaceGraphEntityProjection | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  const kind = stringValue(value.kind);
  const label = stringValue(value.label);
  if (!id || !kind || !label) {
    return null;
  }
  const identity = isRecord(value.identity) ? value.identity : {};
  const attributes = isRecord(value.attributes) ? value.attributes : {};
  return {
    id,
    kind,
    label,
    ...(stringValue(value.projectId) ? { projectId: stringValue(value.projectId) } : {}),
    ...(stringValue(attributes.path) ? { path: stringValue(attributes.path) } : {}),
    ...(stringValue(identity.scope) ? { scope: stringValue(identity.scope) } : {}),
    proofIds: stringArray(value.proofIds),
    attributes,
  };
}

function relationProjection(value: unknown): WorkspaceGraphRelationProjection | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  const from = stringValue(value.from);
  const to = stringValue(value.to);
  const kind = stringValue(value.kind);
  if (!id || !from || !to || !kind) {
    return null;
  }
  return {
    id,
    from,
    to,
    kind,
    ...(stringValue(value.derivation) ? { derivation: stringValue(value.derivation) } : {}),
    ...(stringValue(value.trust) ? { trust: stringValue(value.trust) } : {}),
    ...(stringValue(value.confidence) ? { confidence: stringValue(value.confidence) } : {}),
    proofIds: stringArray(value.proofIds),
  };
}

function proofProjection(value: unknown): WorkspaceGraphProofProjection | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  if (!id) {
    return null;
  }
  return {
    id,
    ...(stringValue(value.provider) ? { provider: stringValue(value.provider) } : {}),
    ...(stringValue(value.artifact) ? { artifact: stringValue(value.artifact) } : {}),
    ...(stringValue(value.pointer) ? { pointer: stringValue(value.pointer) } : {}),
    ...(numberValue(value.line) ? { line: numberValue(value.line) } : {}),
    ...(stringValue(value.trust) ? { trust: stringValue(value.trust) } : {}),
    ...(stringValue(value.confidence) ? { confidence: stringValue(value.confidence) } : {}),
    ...(stringValue(value.freshness) ? { freshness: stringValue(value.freshness) } : {}),
  };
}

export function buildWorkspaceGraphProjection(
  raw: Record<string, unknown>,
  options: { focusEntityIds?: readonly string[] } = {}
): WorkspaceGraphProjection {
  const focusEntityIds = new Set(options.focusEntityIds ?? []);
  const focusedEntities: WorkspaceGraphEntityProjection[] = [];
  const ordinaryEntities: WorkspaceGraphEntityProjection[] = [];
  let totalEntities = 0;
  for (const value of Array.isArray(raw.entities) ? raw.entities : []) {
    const entity = entityProjection(value);
    if (!entity) {
      continue;
    }
    totalEntities += 1;
    if (focusEntityIds.has(entity.id)) {
      if (focusedEntities.length < MAX_ENTITIES) {
        focusedEntities.push(entity);
      }
    } else if (ordinaryEntities.length < MAX_ENTITIES) {
      ordinaryEntities.push(entity);
    }
  }
  const selectedEntities = [...focusedEntities, ...ordinaryEntities].slice(0, MAX_ENTITIES);
  const selectedEntityIds = new Set(selectedEntities.map((entry) => entry.id));
  const selectedRelations: WorkspaceGraphRelationProjection[] = [];
  let totalRelations = 0;
  for (const value of Array.isArray(raw.relations) ? raw.relations : []) {
    const relation = relationProjection(value);
    if (!relation) {
      continue;
    }
    totalRelations += 1;
    if (
      selectedRelations.length < MAX_RELATIONS &&
      selectedEntityIds.has(relation.from) &&
      selectedEntityIds.has(relation.to)
    ) {
      selectedRelations.push(relation);
    }
  }
  const referencedProofIds = new Set([
    ...selectedEntities.flatMap((entry) => entry.proofIds),
    ...selectedRelations.flatMap((entry) => entry.proofIds),
  ]);
  const selectedProofs: WorkspaceGraphProofProjection[] = [];
  let totalProofs = 0;
  for (const value of Array.isArray(raw.proofs) ? raw.proofs : []) {
    const proof = proofProjection(value);
    if (!proof) {
      continue;
    }
    totalProofs += 1;
    if (selectedProofs.length < MAX_PROOFS && referencedProofIds.has(proof.id)) {
      selectedProofs.push(proof);
    }
  }
  const providers = (Array.isArray(raw.providers) ? raw.providers : []).flatMap((value) => {
    if (!isRecord(value) || !stringValue(value.id)) {
      return [];
    }
    return [
      {
        id: stringValue(value.id) as string,
        ...(stringValue(value.status) ? { status: stringValue(value.status) } : {}),
        ...(numberValue(value.proofCount) !== undefined
          ? { proofCount: numberValue(value.proofCount) }
          : {}),
      },
    ];
  });
  const qualityRecord = isRecord(raw.quality) ? raw.quality : {};
  const quality = Object.fromEntries(
    Object.entries(qualityRecord).filter((entry): entry is [string, number | string | boolean] =>
      ['number', 'string', 'boolean'].includes(typeof entry[1])
    )
  );
  const diagnostics = (Array.isArray(raw.diagnostics) ? raw.diagnostics : []).flatMap((value) => {
    if (typeof value === 'string') {
      return [{ code: 'graph-diagnostic', severity: 'warning', message: value }];
    }
    if (!isRecord(value) || !stringValue(value.message)) {
      return [];
    }
    return [
      {
        code: stringValue(value.code) ?? 'graph-diagnostic',
        severity: stringValue(value.severity) ?? 'info',
        message: stringValue(value.message) as string,
        ...(stringValue(value.recommendation)
          ? { recommendation: stringValue(value.recommendation) }
          : {}),
      },
    ];
  });
  const source = isRecord(raw.source) ? raw.source : {};
  return {
    schemaVersion: 'workspace-graph-projection.v1',
    sourceSchemaVersion: stringValue(raw.schemaVersion) ?? 'unknown',
    ...(stringValue(raw.generatedAt) ? { generatedAt: stringValue(raw.generatedAt) } : {}),
    revision: stringValue(source.hash) ?? stringValue(raw.generatedAt) ?? 'unknown',
    truncated:
      selectedEntities.length < totalEntities ||
      selectedRelations.length < totalRelations ||
      selectedProofs.length < referencedProofIds.size,
    total: {
      entities: totalEntities,
      relations: totalRelations,
      proofs: totalProofs,
    },
    entities: selectedEntities,
    relations: selectedRelations,
    proofs: selectedProofs,
    providers,
    quality,
    diagnostics,
    ...(focusEntityIds.size > 0
      ? {
          highlightedEntityIds: selectedEntities
            .filter((entry) => focusEntityIds.has(entry.id))
            .map((entry) => entry.id),
        }
      : {}),
  };
}

export function encodeWorkspaceGraphProjection(raw: Record<string, unknown>): string {
  return `${WORKSPACE_GRAPH_PROJECTION_PREFIX}${JSON.stringify(buildWorkspaceGraphProjection(raw))}`;
}
