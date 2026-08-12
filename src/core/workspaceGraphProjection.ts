import {
  WORKSPACE_GRAPH_PROJECTION_PREFIX,
  type WorkspaceGraphEntityProjection,
  type WorkspaceGraphBindingCoverageProjection,
  type WorkspaceGraphProjection,
  type WorkspaceGraphProofProjection,
  type WorkspaceGraphRelationProjection,
} from '../contracts/workspaceGraphProjection.js';

const MAX_ENTITIES = 500;
const MAX_RELATIONS = 1_000;
const MAX_PROOFS = 1_000;
const ARCHITECTURE_ENTITY_BUDGET = 350;
const BUCKET_SAMPLE_LIMIT = 32;

const ARCHITECTURE_KINDS = new Set([
  'workspace',
  'project',
  'service',
  'api',
  'endpoint',
  'schema',
  'protocol',
  'language',
  'package',
  'runtime-unit',
  'lifecycle-stage',
  'database',
  'queue',
  'container',
  'deployment',
  'pipeline',
  'environment',
  'decision',
  'test-suite',
  'owner',
]);

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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function graphProjectIds(raw: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const value of Array.isArray(raw.entities) ? raw.entities : []) {
    if (isRecord(value) && stringValue(value.projectId)) {
      ids.add(stringValue(value.projectId) as string);
    }
  }
  const topology = isRecord(raw.projectTopology) ? raw.projectTopology : {};
  for (const value of Array.isArray(topology.nodes) ? topology.nodes : []) {
    if (isRecord(value) && stringValue(value.id)) {
      ids.add(stringValue(value.id) as string);
    }
  }
  return [...ids].sort((left, right) => right.length - left.length || left.localeCompare(right));
}

/**
 * Converts legacy absolute or traversal-based graph paths to the portable artifact convention.
 * The original machine path must never cross the extension-host/Webview trust boundary.
 */
export function sanitizeWorkspaceGraphPath(
  value: string,
  projectIds: readonly string[] = []
): string {
  const normalized = value
    .trim()
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/');
  const isAbsolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized);
  const hasTraversal = normalized.split('/').includes('..');
  if (!isAbsolute && !hasTraversal) {
    return normalized.replace(/^\.\//, '');
  }

  const segments = normalized.split('/').filter((segment) => segment && segment !== '.');
  for (const projectId of projectIds) {
    const projectIndex = segments.findIndex(
      (segment) => segment.toLocaleLowerCase() === projectId.toLocaleLowerCase()
    );
    if (projectIndex >= 0) {
      const suffix = segments.slice(projectIndex + 1).filter((segment) => segment !== '..');
      return ['external', projectId, ...suffix].join('/');
    }
  }
  const workspaiIndex = segments.lastIndexOf('.workspai');
  if (workspaiIndex >= 0) {
    return segments
      .slice(workspaiIndex)
      .filter((segment) => segment !== '..')
      .join('/');
  }
  const basename = segments.filter((segment) => segment !== '..').at(-1) ?? 'artifact';
  return `redacted/${basename}`;
}

function sanitizeGraphValue(value: unknown, projectIds: readonly string[]): unknown {
  if (typeof value === 'string') {
    return sanitizeWorkspaceGraphPath(value, projectIds);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeGraphValue(entry, projectIds));
  }
  return value;
}

function sanitizeAttributes(
  attributes: Record<string, unknown>,
  projectIds: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => {
      const pathBearingKey = /(?:path|file|artifact|root|directory|location)/i.test(key);
      return [key, pathBearingKey ? sanitizeGraphValue(value, projectIds) : value];
    })
  );
}

function entityProjection(
  value: unknown,
  projectIds: readonly string[]
): WorkspaceGraphEntityProjection | null {
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
  const attributes = sanitizeAttributes(
    isRecord(value.attributes) ? value.attributes : {},
    projectIds
  );
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

function proofProjection(
  value: unknown,
  projectIds: readonly string[]
): WorkspaceGraphProofProjection | null {
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
    ...(stringValue(value.artifact)
      ? { artifact: sanitizeWorkspaceGraphPath(stringValue(value.artifact) as string, projectIds) }
      : {}),
    ...(stringValue(value.pointer) ? { pointer: stringValue(value.pointer) } : {}),
    ...(numberValue(value.line) ? { line: numberValue(value.line) } : {}),
    ...(numberValue(value.column) ? { column: numberValue(value.column) } : {}),
    ...(stringValue(value.observedAt) ? { observedAt: stringValue(value.observedAt) } : {}),
    ...(stringValue(value.derivation) ? { derivation: stringValue(value.derivation) } : {}),
    ...(stringValue(value.trust) ? { trust: stringValue(value.trust) } : {}),
    ...(stringValue(value.confidence) ? { confidence: stringValue(value.confidence) } : {}),
    ...(stringValue(value.freshness) ? { freshness: stringValue(value.freshness) } : {}),
    ...(stringValue(value.detail) ? { detail: stringValue(value.detail) } : {}),
  };
}

function takeRoundRobin(
  buckets: Map<string, WorkspaceGraphEntityProjection[]>,
  selected: WorkspaceGraphEntityProjection[],
  selectedIds: Set<string>,
  limit: number
): void {
  const orderedBuckets = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, values]) => values);
  for (let offset = 0; selected.length < limit; offset += 1) {
    let progressed = false;
    for (const bucket of orderedBuckets) {
      const entity = bucket[offset];
      if (!entity || selectedIds.has(entity.id)) {
        continue;
      }
      selected.push(entity);
      selectedIds.add(entity.id);
      progressed = true;
      if (selected.length >= limit) {
        return;
      }
    }
    if (!progressed) {
      return;
    }
  }
}

export function buildWorkspaceGraphProjection(
  raw: Record<string, unknown>,
  options: { focusEntityIds?: readonly string[] } = {}
): WorkspaceGraphProjection {
  const projectIds = graphProjectIds(raw);
  const focusEntityIds = new Set(options.focusEntityIds ?? []);
  const focusedEntities: WorkspaceGraphEntityProjection[] = [];
  const architectureBuckets = new Map<string, WorkspaceGraphEntityProjection[]>();
  const allBuckets = new Map<string, WorkspaceGraphEntityProjection[]>();
  const fallbackEntities: WorkspaceGraphEntityProjection[] = [];
  let totalEntities = 0;
  for (const value of Array.isArray(raw.entities) ? raw.entities : []) {
    const entity = entityProjection(value, projectIds);
    if (!entity) {
      continue;
    }
    totalEntities += 1;
    if (focusEntityIds.has(entity.id)) {
      if (focusedEntities.length < MAX_ENTITIES) {
        focusedEntities.push(entity);
      }
      continue;
    }
    if (fallbackEntities.length < MAX_ENTITIES) {
      fallbackEntities.push(entity);
    }
    const bucketKey = `${entity.projectId ?? '@workspace'}:${entity.kind}`;
    const allBucket = allBuckets.get(bucketKey) ?? [];
    if (allBucket.length < BUCKET_SAMPLE_LIMIT) {
      allBucket.push(entity);
      allBuckets.set(bucketKey, allBucket);
    }
    if (ARCHITECTURE_KINDS.has(entity.kind)) {
      const architectureBucket = architectureBuckets.get(bucketKey) ?? [];
      if (architectureBucket.length < BUCKET_SAMPLE_LIMIT) {
        architectureBucket.push(entity);
        architectureBuckets.set(bucketKey, architectureBucket);
      }
    }
  }
  const selectedEntities = [...focusedEntities];
  const selectedEntityIds = new Set(selectedEntities.map((entry) => entry.id));
  takeRoundRobin(
    architectureBuckets,
    selectedEntities,
    selectedEntityIds,
    Math.max(selectedEntities.length, ARCHITECTURE_ENTITY_BUDGET)
  );
  takeRoundRobin(allBuckets, selectedEntities, selectedEntityIds, MAX_ENTITIES);
  for (const entity of fallbackEntities) {
    if (selectedEntities.length >= MAX_ENTITIES) {
      break;
    }
    if (!selectedEntityIds.has(entity.id)) {
      selectedEntities.push(entity);
      selectedEntityIds.add(entity.id);
    }
  }
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
    const proof = proofProjection(value, projectIds);
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
        ...(stringValue(value.version) ? { version: stringValue(value.version) } : {}),
        ...(stringValue(value.status) ? { status: stringValue(value.status) } : {}),
        ...(stringValue(value.permission) ? { permission: stringValue(value.permission) } : {}),
        ...(numberValue(value.discoveredEntities) !== undefined
          ? { discoveredEntities: numberValue(value.discoveredEntities) }
          : {}),
        ...(numberValue(value.discoveredRelations) !== undefined
          ? { discoveredRelations: numberValue(value.discoveredRelations) }
          : {}),
        ...(numberValue(value.proofCount) !== undefined
          ? { proofCount: numberValue(value.proofCount) }
          : {}),
        diagnostics: stringArray(value.diagnostics),
      },
    ];
  });
  const qualityRecord = isRecord(raw.quality) ? raw.quality : {};
  const quality = Object.fromEntries(
    Object.entries(qualityRecord).filter((entry): entry is [string, number | string | boolean] =>
      ['number', 'string', 'boolean'].includes(typeof entry[1])
    )
  );
  const bindingCoverage = isRecord(qualityRecord.bindingCoverage)
    ? Object.fromEntries(
        Object.entries(qualityRecord.bindingCoverage).flatMap(([key, value]) => {
          if (!isRecord(value)) {
            return [];
          }
          const eligibleCount = numberValue(value.eligibleCount);
          const boundCount = numberValue(value.boundCount);
          const unknownCount = numberValue(value.unknownCount);
          const coverageRatio =
            value.coverageRatio === null ? null : numberValue(value.coverageRatio);
          if (
            eligibleCount === undefined ||
            boundCount === undefined ||
            unknownCount === undefined ||
            coverageRatio === undefined
          ) {
            return [];
          }
          return [
            [key, { eligibleCount, boundCount, unknownCount, coverageRatio }] as [
              string,
              WorkspaceGraphBindingCoverageProjection,
            ],
          ];
        })
      )
    : {};
  if (Object.keys(bindingCoverage).length > 0) {
    Object.assign(quality, { bindingCoverage });
  }
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
        ...(stringArray(value.entityIds).length > 0
          ? { entityIds: stringArray(value.entityIds) }
          : {}),
        ...(stringArray(value.relationIds).length > 0
          ? { relationIds: stringArray(value.relationIds) }
          : {}),
      },
    ];
  });
  const source = isRecord(raw.source) ? raw.source : {};
  const inputs = isRecord(source.inputs) ? source.inputs : {};
  const workspace = isRecord(raw.workspace) ? raw.workspace : {};
  const scopes = (Array.isArray(inputs.scopes) ? inputs.scopes : []).flatMap((value) => {
    if (!isRecord(value) || !stringValue(value.kind) || !stringValue(value.id)) {
      return [];
    }
    return [
      {
        kind: stringValue(value.kind) as string,
        id: stringValue(value.id) as string,
        ...(stringValue(value.strategy) ? { strategy: stringValue(value.strategy) } : {}),
        ...(numberValue(value.fileCount) !== undefined
          ? { fileCount: numberValue(value.fileCount) }
          : {}),
        ...(numberValue(value.fileLimit) !== undefined
          ? { fileLimit: numberValue(value.fileLimit) }
          : {}),
        ...(booleanValue(value.truncated) !== undefined
          ? { truncated: booleanValue(value.truncated) }
          : {}),
      },
    ];
  });
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
    ...(stringValue(workspace.name) || stringValue(workspace.profile)
      ? {
          workspace: {
            ...(stringValue(workspace.name) ? { name: stringValue(workspace.name) } : {}),
            ...(stringValue(workspace.profile) ? { profile: stringValue(workspace.profile) } : {}),
          },
        }
      : {}),
    ...(stringValue(source.artifact) || stringValue(inputs.strategy) || scopes.length > 0
      ? {
          source: {
            ...(stringValue(source.artifact)
              ? {
                  artifact: sanitizeWorkspaceGraphPath(
                    stringValue(source.artifact) as string,
                    projectIds
                  ),
                }
              : {}),
            ...(stringValue(inputs.strategy) ? { strategy: stringValue(inputs.strategy) } : {}),
            ...(stringValue(inputs.hash) ? { inputHash: stringValue(inputs.hash) } : {}),
            scopes,
          },
        }
      : {}),
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
