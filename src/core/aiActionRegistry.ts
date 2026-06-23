import * as fs from 'fs/promises';
import * as path from 'path';

import { AIActionContract, AIActionOperation, AIActionValidationResult } from './aiActionContract';
import {
  AIActionPreflightSnapshot,
  captureAIActionPreflightSnapshot,
  computeAIActionFingerprint,
} from './aiActionSafety';

export type AIActionLifecycleStatus =
  | 'proposed'
  | 'verified'
  | 'applied'
  | 'applied-failed-verify'
  | 'rolled-back'
  | 'blocked'
  | 'stale';

export interface AIActionRegistryExecution {
  operation: AIActionOperation;
  ok: boolean;
  summary: string;
  evidencePath?: string | null;
  evidenceSha256?: string | null;
  evidenceSizeBytes?: number | null;
  commandCount?: number;
  failedCommandCount?: number;
  failedCommands?: string[];
  proof?: AIActionExecutionProofSummary;
  preflight?: {
    stale: boolean;
    issues: string[];
  };
  completedAt: string;
}

export interface AIActionExecutionProofSummary {
  schemaVersion: 'workspai.ai-action-proof-summary.v1';
  evidenceRequired: boolean;
  evidencePresent: boolean;
  evidenceSha256Present: boolean;
  transcriptRequired: boolean;
  transcriptCommandCount: number;
  failedCommandCount: number;
  rollbackProofRequired: boolean;
  rollbackPlanPresent: boolean;
  complete: boolean;
  issues: string[];
}

export interface AIActionRegistryEntry {
  id: string;
  createdAt: string;
  provider?: string;
  rawJson?: string | null;
  fingerprint: string;
  preflight: AIActionPreflightSnapshot;
  lifecycleStatus: AIActionLifecycleStatus;
  contract: AIActionContract;
  validation: AIActionValidationResult;
  executions: AIActionRegistryExecution[];
}

export interface AIActionRegistry {
  schemaVersion: 'workspai.ai-action-registry.v1';
  updatedAt: string;
  entries: AIActionRegistryEntry[];
}

const MAX_REGISTRY_ENTRIES = 25;

export function buildAIActionExecutionProofSummary(input: {
  operation: AIActionOperation;
  ok: boolean;
  evidencePath?: string | null;
  evidenceSha256?: string | null;
  commandCount?: number;
  failedCommandCount?: number;
  rollbackPlan?: string[];
}): AIActionExecutionProofSummary {
  const commandCount = Math.max(0, input.commandCount ?? 0);
  const failedCommandCount = Math.max(0, input.failedCommandCount ?? 0);
  const rollbackPlanPresent = (input.rollbackPlan || []).some((command) => command.trim());
  const rollbackProofRequired = input.operation === 'apply' || input.operation === 'rollback';
  const issues: string[] = [];

  if (!input.evidencePath) {
    issues.push('Evidence artifact is missing.');
  }
  if (!input.evidenceSha256) {
    issues.push('Evidence SHA256 is missing.');
  }
  if (input.ok && commandCount === 0) {
    issues.push('Successful execution has no command transcript.');
  }
  if (failedCommandCount > 0) {
    issues.push(`${failedCommandCount} command transcript step(s) failed.`);
  }
  if (rollbackProofRequired && !rollbackPlanPresent) {
    issues.push('Rollback proof plan is missing for a mutating operation.');
  }

  return {
    schemaVersion: 'workspai.ai-action-proof-summary.v1',
    evidenceRequired: true,
    evidencePresent: Boolean(input.evidencePath),
    evidenceSha256Present: Boolean(input.evidenceSha256),
    transcriptRequired: true,
    transcriptCommandCount: commandCount,
    failedCommandCount,
    rollbackProofRequired,
    rollbackPlanPresent,
    complete: issues.length === 0,
    issues,
  };
}

export function getAIActionRegistryPath(workspacePath: string): string {
  return path.join(workspacePath, '.workspai', 'evidence', 'ai-actions', 'registry.json');
}

function createEmptyRegistry(): AIActionRegistry {
  return {
    schemaVersion: 'workspai.ai-action-registry.v1',
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

function createActionId(createdAt: string, summary: string): string {
  const slug =
    summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'ai-action';
  return `${createdAt.replace(/[:.]/g, '-')}-${slug}`;
}

function normalizeRegistry(value: unknown): AIActionRegistry {
  if (!value || typeof value !== 'object') {
    return createEmptyRegistry();
  }
  const raw = value as Partial<AIActionRegistry>;
  return {
    schemaVersion: 'workspai.ai-action-registry.v1',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    entries: Array.isArray(raw.entries)
      ? raw.entries.slice(0, MAX_REGISTRY_ENTRIES).map((entry) => {
          const item = entry as Partial<AIActionRegistryEntry>;
          return {
            ...item,
            fingerprint:
              typeof item.fingerprint === 'string' && item.fingerprint
                ? item.fingerprint
                : item.contract
                  ? computeAIActionFingerprint(item.contract)
                  : '',
            preflight: item.preflight || {
              capturedAt: item.createdAt || new Date().toISOString(),
              fingerprint: item.contract ? computeAIActionFingerprint(item.contract) : '',
              gitStatusShort: '',
              gitDiffStat: '',
              files: [],
            },
            lifecycleStatus: item.lifecycleStatus || deriveLifecycleStatus(item),
            executions: Array.isArray(item.executions) ? item.executions : [],
          } as AIActionRegistryEntry;
        })
      : [],
  };
}

function deriveLifecycleStatus(entry: Partial<AIActionRegistryEntry>): AIActionLifecycleStatus {
  if (entry.validation?.status === 'blocked') {
    return 'blocked';
  }
  const executions = Array.isArray(entry.executions) ? entry.executions : [];
  if (executions.some((execution) => execution.preflight?.stale)) {
    return 'stale';
  }
  const latestRollback = executions.find((execution) => execution.operation === 'rollback');
  if (latestRollback?.ok) {
    return 'rolled-back';
  }
  const latestApply = executions.find((execution) => execution.operation === 'apply');
  if (latestApply) {
    return latestApply.ok ? 'applied' : 'applied-failed-verify';
  }
  const latestVerify = executions.find((execution) => execution.operation === 'verify');
  if (latestVerify?.ok) {
    return 'verified';
  }
  return 'proposed';
}

async function writeRegistry(workspacePath: string, registry: AIActionRegistry): Promise<void> {
  const registryPath = getAIActionRegistryPath(workspacePath);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  const tmpPath = `${registryPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(registry, null, 2), 'utf8');
  await fs.rename(tmpPath, registryPath);
}

export async function readAIActionRegistry(workspacePath: string): Promise<AIActionRegistry> {
  if (!workspacePath.trim()) {
    return createEmptyRegistry();
  }

  try {
    const registryPath = getAIActionRegistryPath(workspacePath);
    const raw = await fs.readFile(registryPath, 'utf8');
    return normalizeRegistry(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return createEmptyRegistry();
    }
    return createEmptyRegistry();
  }
}

export async function recordAIActionContract(
  workspacePath: string,
  input: {
    contract: AIActionContract;
    validation: AIActionValidationResult;
    provider?: string;
    rawJson?: string | null;
  }
): Promise<AIActionRegistryEntry> {
  const registry = await readAIActionRegistry(workspacePath);
  const createdAt = new Date().toISOString();
  const fingerprint = computeAIActionFingerprint(input.contract);
  const preflight = await captureAIActionPreflightSnapshot(workspacePath, input.contract);
  const entry: AIActionRegistryEntry = {
    id: createActionId(createdAt, input.contract.summary),
    createdAt,
    provider: input.provider,
    rawJson: input.rawJson,
    fingerprint,
    preflight,
    lifecycleStatus: input.validation.status === 'blocked' ? 'blocked' : 'proposed',
    contract: input.contract,
    validation: input.validation,
    executions: [],
  };

  const nextRegistry: AIActionRegistry = {
    schemaVersion: 'workspai.ai-action-registry.v1',
    updatedAt: createdAt,
    entries: [entry, ...registry.entries].slice(0, MAX_REGISTRY_ENTRIES),
  };
  await writeRegistry(workspacePath, nextRegistry);
  return entry;
}

export async function recordAIActionExecution(
  workspacePath: string,
  actionId: string,
  execution: Omit<AIActionRegistryExecution, 'completedAt'>
): Promise<AIActionRegistry> {
  const registry = await readAIActionRegistry(workspacePath);
  const completedAt = new Date().toISOString();
  const nextRegistry: AIActionRegistry = {
    schemaVersion: 'workspai.ai-action-registry.v1',
    updatedAt: completedAt,
    entries: registry.entries.map((entry) =>
      entry.id === actionId
        ? (() => {
            const nextEntry = {
              ...entry,
              executions: [
                {
                  ...execution,
                  proof:
                    execution.proof ||
                    buildAIActionExecutionProofSummary({
                      operation: execution.operation,
                      ok: execution.ok,
                      evidencePath: execution.evidencePath,
                      evidenceSha256: execution.evidenceSha256,
                      commandCount: execution.commandCount,
                      failedCommandCount: execution.failedCommandCount,
                      rollbackPlan: entry.contract.rollbackPlan,
                    }),
                  completedAt,
                },
                ...entry.executions,
              ],
            };
            return {
              ...nextEntry,
              lifecycleStatus: deriveLifecycleStatus(nextEntry),
            };
          })()
        : entry
    ),
  };
  await writeRegistry(workspacePath, nextRegistry);
  return nextRegistry;
}

export function getLatestRunnableAIAction(
  registry: AIActionRegistry
): AIActionRegistryEntry | null {
  return (
    registry.entries.find(
      (entry) => entry.lifecycleStatus !== 'blocked' && entry.lifecycleStatus !== 'stale'
    ) || null
  );
}
