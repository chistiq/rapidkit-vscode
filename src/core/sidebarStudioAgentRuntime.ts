import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const STUDIO_EVIDENCE_REFRESH_COMMAND_IDS = [
  'checkWorkspaceHealth',
  'workspaceSync',
  'workspaceModel',
  'workspaceIntelligenceSnapshot',
  'workspaceDiff',
  'workspaceImpact',
  'workspaceContextAgent',
  'workspaceAgentSync',
  'workspaceContractVerify',
  'workspaceVerify',
  'workspaceAnalyze',
  'workspaceReadiness',
  'workspacePipeline',
  'workspaceIntelligenceChain',
  'workspaceExplain',
  'workspaceTrace',
  'workspaceRemediationPlan',
  'workspaceWatch',
] as const;
export type StudioEvidenceRefreshCommandId = (typeof STUDIO_EVIDENCE_REFRESH_COMMAND_IDS)[number];

export const STUDIO_AGENT_ACTION_SCHEMA_VERSION = 'workspai.studio-agent-action.v1' as const;
// A turn budget is a context-compaction checkpoint, never a user-facing
// terminal state. The host asks the model for a grounded final action at the
// checkpoint and a subsequent repair generation can resume from the ledger.
export const STUDIO_AGENT_MAX_TURNS = 24;
export const STUDIO_AGENT_MAX_FILES = 16;
export const STUDIO_AGENT_MAX_FILE_BYTES = 48 * 1024;

export type StudioAgentCompletionEvidence = {
  verifyRan: boolean;
  verifySucceeded: boolean;
  blockerSignatureBefore?: string;
  blockerSignatureAfter?: string;
  cardBlocking: boolean;
};

/** Completion is evidence-derived. A model response or a successful command
 * alone can never close a Studio repair session. */
export function studioAgentRepairIsComplete(input: StudioAgentCompletionEvidence): boolean {
  if (!input.verifyRan || !input.verifySucceeded || input.cardBlocking) {
    return false;
  }
  if (input.blockerSignatureBefore && input.blockerSignatureAfter) {
    return input.blockerSignatureBefore !== input.blockerSignatureAfter;
  }
  return true;
}

export type StudioAgentActivityKind = 'inspect' | 'fix' | 'verify' | 'complete';

export function studioAgentActivityKind(phase: string): StudioAgentActivityKind {
  if (/verif|readiness|contract/i.test(phase)) {
    return 'verify';
  }
  if (/appl|patch|fix|remedi|command/i.test(phase)) {
    return 'fix';
  }
  if (/resolv|complete|done/i.test(phase)) {
    return 'complete';
  }
  return 'inspect';
}

export type StudioAgentToolDecision =
  | { allowed: true }
  | { allowed: false; reason: 'already-observed' | 'unchanged-generation' | 'safety-boundary' };

/** Session-scoped control plane for the model/tool/observation loop. It keeps
 * safety limits separate from model reasoning and makes continuation state
 * serializable for a future background or remote agent host. */
export class StudioAgentSession {
  private readonly inspected = new Set<string>();
  private readonly commandGeneration = new Map<StudioEvidenceRefreshCommandId, string>();

  constructor(
    readonly id: string,
    readonly blockerSignature: string | undefined,
    private readonly maxInspectedPaths = 32,
    private readonly maxGovernedCommands = 8
  ) {}

  authorizeInspection(paths: readonly string[]): StudioAgentToolDecision {
    const fresh = paths.filter((entry) => !this.inspected.has(entry));
    if (fresh.length === 0) {
      return { allowed: false, reason: 'already-observed' };
    }
    if (this.inspected.size + fresh.length > this.maxInspectedPaths) {
      return { allowed: false, reason: 'safety-boundary' };
    }
    fresh.forEach((entry) => this.inspected.add(entry));
    return { allowed: true };
  }

  authorizeCommand(
    commandId: StudioEvidenceRefreshCommandId,
    evidenceGeneration: string
  ): StudioAgentToolDecision {
    if (this.commandGeneration.get(commandId) === evidenceGeneration) {
      return { allowed: false, reason: 'unchanged-generation' };
    }
    if (
      !this.commandGeneration.has(commandId) &&
      this.commandGeneration.size >= this.maxGovernedCommands
    ) {
      return { allowed: false, reason: 'safety-boundary' };
    }
    this.commandGeneration.set(commandId, evidenceGeneration);
    return { allowed: true };
  }

  snapshot(): {
    id: string;
    blockerSignature?: string;
    inspectedPaths: string[];
    commands: Array<{ commandId: StudioEvidenceRefreshCommandId; evidenceGeneration: string }>;
  } {
    return {
      id: this.id,
      ...(this.blockerSignature ? { blockerSignature: this.blockerSignature } : {}),
      inspectedPaths: [...this.inspected],
      commands: [...this.commandGeneration].map(([commandId, evidenceGeneration]) => ({
        commandId,
        evidenceGeneration,
      })),
    };
  }
}

export type StudioAgentAction =
  | { type: 'inspect-files'; paths: string[]; reason: string }
  | { type: 'read-evidence'; paths: string[]; reason: string }
  | { type: 'run-command'; commandId: StudioEvidenceRefreshCommandId; reason: string }
  | { type: 'stop'; reason: string };

export type StudioAgentFileObservation = {
  path: string;
  kind: 'source' | 'evidence';
  sha256: string;
  content: string;
  truncated: boolean;
};

const DENIED_PATH =
  /(?:^|\/)(?:\.git|node_modules|dist|build|coverage|\.env(?:\.|$)|\.npmrc$|\.pypirc$|[^/]*(?:secret|credential)[^/]*)(?:\/|$)/i;

function exactJsonPayload(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const match = /^```json\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? null;
}

function validReason(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function parsePaths(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > STUDIO_AGENT_MAX_FILES) {
    return null;
  }
  const paths = value.map((entry) => (typeof entry === 'string' ? entry.trim() : ''));
  if (
    paths.some(
      (entry) =>
        !entry ||
        entry.length > 512 ||
        entry.includes('\0') ||
        path.isAbsolute(entry) ||
        entry.split(/[\\/]/).some((segment) => segment === '.' || segment === '..')
    )
  ) {
    return null;
  }
  const normalized = paths.map((entry) => entry.replace(/\\/g, '/'));
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export function parseStudioAgentAction(responseText: string): StudioAgentAction | null {
  if (Buffer.byteLength(responseText, 'utf8') > 64 * 1024) {
    return null;
  }
  const json = exactJsonPayload(responseText);
  if (!json) {
    return null;
  }
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    if (value.schemaVersion !== STUDIO_AGENT_ACTION_SCHEMA_VERSION || !validReason(value.reason)) {
      return null;
    }
    if (value.action === 'inspect-files' || value.action === 'read-evidence') {
      if (!hasOnlyKeys(value, ['schemaVersion', 'action', 'paths', 'reason'])) {
        return null;
      }
      const paths = parsePaths(value.paths);
      if (!paths) {
        return null;
      }
      return { type: value.action, paths, reason: value.reason.trim() };
    }
    if (
      value.action === 'run-command' &&
      hasOnlyKeys(value, ['schemaVersion', 'action', 'commandId', 'reason']) &&
      typeof value.commandId === 'string' &&
      (STUDIO_EVIDENCE_REFRESH_COMMAND_IDS as readonly string[]).includes(value.commandId)
    ) {
      return {
        type: 'run-command',
        commandId: value.commandId as StudioEvidenceRefreshCommandId,
        reason: value.reason.trim(),
      };
    }
    if (value.action === 'stop') {
      if (!hasOnlyKeys(value, ['schemaVersion', 'action', 'reason'])) {
        return null;
      }
      return { type: 'stop', reason: value.reason.trim() };
    }
  } catch {
    return null;
  }
  return null;
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function inspectStudioAgentFiles(input: {
  workspacePath: string;
  paths: string[];
  kind: 'source' | 'evidence';
  authorizedEvidencePaths?: readonly string[];
}): Promise<StudioAgentFileObservation[]> {
  const workspaceReal = await fs.realpath(input.workspacePath);
  const authorized = new Set(
    (input.authorizedEvidencePaths ?? []).map((entry) => entry.replace(/\\/g, '/'))
  );
  const observations: StudioAgentFileObservation[] = [];
  for (const relativePath of input.paths.slice(0, STUDIO_AGENT_MAX_FILES)) {
    const normalized = relativePath.replace(/\\/g, '/');
    if (
      DENIED_PATH.test(normalized) ||
      (input.kind === 'source' &&
        /^\.workspai\/(?:reports|cache|snapshots)(?:\/|$)/.test(normalized)) ||
      (input.kind === 'evidence' && !authorized.has(normalized))
    ) {
      throw new Error(`Studio agent path is not authorized: ${normalized}`);
    }
    const lexicalPath = path.resolve(input.workspacePath, normalized);
    if (!isInside(input.workspacePath, lexicalPath)) {
      throw new Error(`Studio agent path escapes the workspace: ${normalized}`);
    }
    const realPath = await fs.realpath(lexicalPath);
    if (!isInside(workspaceReal, realPath)) {
      throw new Error(`Studio agent path resolves outside the workspace: ${normalized}`);
    }
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      throw new Error(`Studio agent target is not a regular file: ${normalized}`);
    }
    const full = await fs.readFile(realPath);
    if (full.subarray(0, STUDIO_AGENT_MAX_FILE_BYTES).includes(0)) {
      throw new Error(`Studio agent target is not UTF-8 text: ${normalized}`);
    }
    const bounded = full.subarray(0, STUDIO_AGENT_MAX_FILE_BYTES);
    observations.push({
      path: normalized,
      kind: input.kind,
      sha256: crypto.createHash('sha256').update(full).digest('hex'),
      content: bounded.toString('utf8'),
      truncated: full.length > bounded.length,
    });
  }
  return observations;
}
