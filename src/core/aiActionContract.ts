import * as path from 'path';
import { isDangerousAIActionCommand, validateAIActionCommandPolicy } from './aiActionCommandPolicy';

export type AIActionType = 'fix' | 'impact' | 'verify';
export type AIActionRiskLevel = 'low' | 'medium' | 'high';
export type AIActionValidationStatus = 'valid' | 'blocked' | 'needs-review';
export type AIActionOperation = 'apply' | 'verify' | 'rollback';

export interface AIActionPatch {
  relativePath: string;
  summary?: string;
  diff?: string;
}

export interface AIActionContract {
  schemaVersion: 'workspai.ai-action.v1';
  actionType: AIActionType;
  summary: string;
  riskLevel: AIActionRiskLevel;
  affectedFiles: string[];
  proposedCommands: string[];
  proposedPatches: AIActionPatch[];
  verificationCommands: string[];
  rollbackPlan: string[];
  confidence: number;
  requiresApproval: true;
}

export interface AIActionValidationIssue {
  code:
    | 'invalid-schema'
    | 'unsafe-command'
    | 'path-outside-workspace'
    | 'missing-verification'
    | 'missing-rollback'
    | 'low-confidence'
    | 'approval-required'
    | 'command-policy-violation';
  severity: 'error' | 'warning';
  detail: string;
}

export interface AIActionValidationResult {
  status: AIActionValidationStatus;
  issues: AIActionValidationIssue[];
  canApply: boolean;
  canVerify: boolean;
  canRollback: boolean;
}

export interface ParsedAIActionContract {
  contract: AIActionContract | null;
  rawJson: string | null;
  parseError?: string;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRiskLevel(value: unknown): AIActionRiskLevel {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function normalizeActionType(value: unknown): AIActionType {
  return value === 'impact' || value === 'verify' || value === 'fix' ? value : 'impact';
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizePatch(value: unknown): AIActionPatch | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const relativePath = typeof raw.relativePath === 'string' ? raw.relativePath.trim() : '';
  if (!relativePath) {
    return null;
  }
  return {
    relativePath,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : undefined,
    diff: typeof raw.diff === 'string' ? raw.diff : undefined,
  };
}

export function normalizeAIActionContract(value: unknown): AIActionContract | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const proposedPatches = Array.isArray(raw.proposedPatches)
    ? raw.proposedPatches.map(normalizePatch).filter((item): item is AIActionPatch => Boolean(item))
    : [];

  return {
    schemaVersion: 'workspai.ai-action.v1',
    actionType: normalizeActionType(raw.actionType),
    summary:
      typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'AI action',
    riskLevel: normalizeRiskLevel(raw.riskLevel),
    affectedFiles: asStringArray(raw.affectedFiles),
    proposedCommands: asStringArray(raw.proposedCommands),
    proposedPatches,
    verificationCommands: asStringArray(raw.verificationCommands),
    rollbackPlan: asStringArray(raw.rollbackPlan),
    confidence: normalizeConfidence(raw.confidence),
    requiresApproval: true,
  };
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const schemaIndex = text.indexOf('"schemaVersion"');
  if (schemaIndex === -1) {
    return null;
  }

  const start = text.lastIndexOf('{', schemaIndex);
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1).trim();
}

export function parseAIActionContractFromText(text: string): ParsedAIActionContract {
  const rawJson = extractJsonCandidate(text);
  if (!rawJson) {
    return { contract: null, rawJson: null };
  }

  try {
    return {
      contract: normalizeAIActionContract(JSON.parse(rawJson)),
      rawJson,
    };
  } catch (error) {
    return {
      contract: null,
      rawJson,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export { isDangerousAIActionCommand };

function isPathInsideWorkspace(workspacePath: string, relativePath: string): boolean {
  const workspaceRoot = path.resolve(workspacePath);
  const resolved = path.resolve(workspaceRoot, relativePath);
  return resolved === workspaceRoot || resolved.startsWith(`${workspaceRoot}${path.sep}`);
}

export function validateAIActionContract(
  contract: AIActionContract | null,
  input: {
    workspacePath: string;
    strict?: boolean;
    minConfidence?: number;
  }
): AIActionValidationResult {
  const issues: AIActionValidationIssue[] = [];

  if (!contract) {
    return {
      status: 'blocked',
      issues: [
        {
          code: 'invalid-schema',
          severity: 'error',
          detail: 'AI action contract is missing or invalid.',
        },
      ],
      canApply: false,
      canVerify: false,
      canRollback: false,
    };
  }

  const touchedPaths = [
    ...contract.affectedFiles,
    ...contract.proposedPatches.map((patch) => patch.relativePath),
  ];
  for (const candidate of touchedPaths) {
    if (!isPathInsideWorkspace(input.workspacePath, candidate)) {
      issues.push({
        code: 'path-outside-workspace',
        severity: 'error',
        detail: `Path escapes workspace: ${candidate}`,
      });
    }
  }

  for (const command of [
    ...contract.proposedCommands,
    ...contract.verificationCommands,
    ...contract.rollbackPlan,
  ]) {
    if (isDangerousAIActionCommand(command)) {
      issues.push({
        code: 'unsafe-command',
        severity: 'error',
        detail: `Unsafe command blocked: ${command}`,
      });
    }
  }

  for (const command of contract.proposedCommands) {
    const policy = validateAIActionCommandPolicy(command, 'apply');
    if (!policy.allowed) {
      issues.push({
        code: 'command-policy-violation',
        severity: 'error',
        detail: `${policy.reason || 'Command policy blocked execution'}: ${command}`,
      });
    }
  }

  for (const command of contract.verificationCommands) {
    const policy = validateAIActionCommandPolicy(command, 'verify');
    if (!policy.allowed) {
      issues.push({
        code: 'command-policy-violation',
        severity: 'error',
        detail: `${policy.reason || 'Command policy blocked execution'}: ${command}`,
      });
    }
  }

  for (const command of contract.rollbackPlan) {
    const policy = validateAIActionCommandPolicy(command, 'rollback');
    if (!policy.allowed) {
      issues.push({
        code: 'command-policy-violation',
        severity: 'error',
        detail: `${policy.reason || 'Command policy blocked execution'}: ${command}`,
      });
    }
  }

  if (contract.actionType === 'fix' && contract.verificationCommands.length === 0) {
    issues.push({
      code: 'missing-verification',
      severity: 'error',
      detail: 'Fix actions require at least one deterministic verification command.',
    });
  }

  if (contract.actionType === 'fix' && contract.rollbackPlan.length === 0) {
    issues.push({
      code: 'missing-rollback',
      severity: input.strict ? 'error' : 'warning',
      detail: 'Fix actions require a rollback plan before enterprise apply.',
    });
  }

  const minConfidence = input.minConfidence ?? (input.strict ? 0.75 : 0.55);
  if (contract.confidence < minConfidence) {
    issues.push({
      code: 'low-confidence',
      severity: input.strict ? 'error' : 'warning',
      detail: `Confidence ${contract.confidence.toFixed(2)} is below required ${minConfidence.toFixed(2)}.`,
    });
  }

  if (contract.requiresApproval !== true) {
    issues.push({
      code: 'approval-required',
      severity: 'error',
      detail: 'AI actions must require explicit user approval.',
    });
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const hasWarnings = issues.some((issue) => issue.severity === 'warning');
  const canVerify = contract.verificationCommands.length > 0 && !hasErrors;
  const canRollback = contract.rollbackPlan.length > 0 && !hasErrors;

  return {
    status: hasErrors ? 'blocked' : hasWarnings ? 'needs-review' : 'valid',
    issues,
    canApply: contract.actionType === 'fix' && !hasErrors && canVerify && canRollback,
    canVerify,
    canRollback,
  };
}
