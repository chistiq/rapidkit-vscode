import surfaceContract from './ai-action-operation-surface.v1.json';

export type AIActionOperation = 'apply' | 'verify' | 'rollback';

export type AIActionOperationMeta = {
  id: AIActionOperation;
  label: string;
  mutatesWorkspace: boolean;
  requiresApproval: boolean;
  statusActionPrefix: string;
};

export type AIActionCommandPayload = {
  operation: AIActionOperation;
  workspacePath: string;
  workspaceName: string;
  actionId?: string;
  summary?: string;
  riskLevel?: string;
  confidence?: number;
};

export const AI_ACTION_OPERATION_SURFACE_SCHEMA_VERSION = surfaceContract.schemaVersion;
export const AI_ACTION_OPERATION_SURFACE_VERSION = surfaceContract.version;

export const AI_ACTION_OPERATION_SURFACE = surfaceContract.operations as Record<
  AIActionOperation,
  AIActionOperationMeta
>;

export const AI_ACTION_OPERATIONS = Object.keys(AI_ACTION_OPERATION_SURFACE) as AIActionOperation[];

export function isAIActionOperation(value: string): value is AIActionOperation {
  return Object.prototype.hasOwnProperty.call(AI_ACTION_OPERATION_SURFACE, value);
}

export function resolveAIActionOperationMeta(operation: string): AIActionOperationMeta | undefined {
  return (AI_ACTION_OPERATION_SURFACE as Record<string, AIActionOperationMeta | undefined>)[
    operation
  ];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown): string | undefined {
  const next = readString(value);
  return next || undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeAIActionCommandPayload(value: unknown): AIActionCommandPayload | null {
  const record = readRecord(value);
  const operation = readString(record.operation);
  const workspacePath = readString(record.workspacePath);

  if (!isAIActionOperation(operation) || !workspacePath) {
    return null;
  }

  return {
    operation,
    workspacePath,
    workspaceName: readString(record.workspaceName) || 'Current Workspace',
    actionId: readOptionalString(record.actionId),
    summary: readOptionalString(record.summary),
    riskLevel: readOptionalString(record.riskLevel),
    confidence: readOptionalNumber(record.confidence),
  };
}
