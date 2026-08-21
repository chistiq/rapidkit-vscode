import { access } from 'node:fs/promises';
import * as path from 'node:path';

import {
  runRapidkitStreaming,
  type StreamingRunOptions,
  type StreamingRunResult,
} from './streamingRapidkitRunner.js';

export type ProjectAgentBootstrapStatus = 'not-applicable' | 'ready' | 'degraded' | 'blocked';

export type AgentBootstrapReceipt = {
  schemaVersion: 'workspai.agent-bootstrap-receipt.v1';
  generatedAt: string;
  receiptId: string;
  status: 'ready' | 'degraded' | 'blocked';
  requestedAgent: string;
  resolvedHost: string;
  project: { name: string; relativePath: string; runtime?: string; framework?: string };
  workspace: {
    name: string;
    relationship: 'managed' | 'adopted' | 'imported' | 'linked' | 'restored';
    resolved: true;
    identityIsFilesystemPath: false;
    resolverCommand: 'workspai project workspace status --json';
    portableUriScheme: 'workspace:';
    resolvedPathPolicy: 'runtime-private-never-persist';
  };
  entry: {
    artifact: '.workspai/agent-entry.v1.json';
    schemaVersion: 'workspai.agent-entry.v1';
    hostStatus: 'ready' | 'degraded' | 'blocked';
    entryFiles: string[];
  };
  canonicalEvidence: {
    projectContext: '.workspai/reports/project-context-agent.json';
    workspaceIndex: 'workspace:.workspai/reports/INDEX.json';
    workspaceContext: 'workspace:.workspai/reports/workspace-context-agent.json';
    workspaceModel?: 'workspace:.workspai/reports/workspace-model.json';
    knowledgeGraph?: 'workspace:.workspai/reports/workspace-knowledge-graph.json';
    workspaceSkillsIndex?: 'workspace:.workspai/reports/workspace-skills-index.json';
    boundedGraphSearch?: 'command:workspai workspace graph search <task-query> --scope project:<project> --limit 12 --json';
    modelFreshness: 'fresh' | 'stale' | 'unknown' | 'missing';
    graphFreshness: 'fresh' | 'stale' | 'unknown' | 'missing';
    graphMatchesModel: boolean;
    liveInputsValidated: boolean;
    blockerCount: number;
  };
  activeGoal: {
    present: boolean;
    appliesToProject: boolean;
    status: 'none' | 'ready' | 'stale' | 'invalid';
    id?: string;
    objective?: string;
    lifecycle?: string;
    goalPack?: string;
    agentHandoff?: string;
  };
  requiredReadOrder: string[];
  claims: {
    architecture: 'allowed-with-citations' | 'prohibited';
    sourceInspection: 'bounded-and-targeted';
    sourceMutation: 'governed-cli-transaction-only';
    verification: 'cli-evidence-only';
  };
  checks: Array<{ id: string; status: 'passed' | 'warning' | 'failed'; message: string }>;
  nextActions: string[];
  integrity: {
    algorithm: 'sha256';
    manifestHash: string;
    projectContextHash: string;
    portable: true;
    absolutePathsEmitted: false;
    payloadHash: string;
  };
};

export type ProjectAgentBootstrapResult = {
  status: ProjectAgentBootstrapStatus;
  adopted: boolean;
  receipt?: AgentBootstrapReceipt;
  reason?: string;
};

type BootstrapRunner = (options: StreamingRunOptions) => Promise<StreamingRunResult<unknown>>;

const ADOPTION_MARKERS = [
  '.workspai/agent-entry.v1.json',
  '.workspai/project.json',
  '.workspai/workspace-link.local.json',
  '.workspai/PROJECT-GROUNDING.md',
] as const;
const WORKSPACE_MARKERS = [
  '.workspai/workspace.contract.json',
  '.workspai/workspace-registry.v1.json',
  '.workspai/workspace.json',
] as const;
const CACHE_TTL_MS = 15_000;
const AGENT_IDS = new Set([
  'generic',
  'codex',
  'claude',
  'gemini',
  'qwen',
  'kimi',
  'grok',
  'copilot',
  'cursor',
  'windsurf',
  'amazon-q',
  'all',
]);
const BOOTSTRAP_STATUSES = new Set(['ready', 'degraded', 'blocked']);
const FRESHNESS_STATUSES = new Set(['fresh', 'stale', 'unknown', 'missing']);
const cache = new Map<
  string,
  { expiresAt: number; promise: Promise<ProjectAgentBootstrapResult> }
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPortableValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return !/(?:^|[\s"'`(=])(?:\/(?![/.])|~[\\/]|\$HOME[\\/]|%USERPROFILE%[\\/]|[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|file:\/\/)/i.test(
      value
    );
  }
  if (Array.isArray(value)) {
    return value.every(isPortableValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isPortableValue);
  }
  return true;
}

function parseReceipt(value: unknown): AgentBootstrapReceipt | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const workspace = value.workspace;
  const entry = value.entry;
  const evidence = value.canonicalEvidence;
  const activeGoal = value.activeGoal;
  const claims = value.claims;
  const integrity = value.integrity;
  const legacyEvidenceRoute =
    isRecord(evidence) &&
    evidence.workspaceModel === 'workspace:.workspai/reports/workspace-model.json' &&
    evidence.knowledgeGraph === 'workspace:.workspai/reports/workspace-knowledge-graph.json';
  const boundedEvidenceRoute =
    isRecord(evidence) &&
    evidence.workspaceSkillsIndex === 'workspace:.workspai/reports/workspace-skills-index.json' &&
    evidence.boundedGraphSearch ===
      'command:workspai workspace graph search <task-query> --scope project:<project> --limit 12 --json';
  if (
    value.schemaVersion !== 'workspai.agent-bootstrap-receipt.v1' ||
    typeof value.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !BOOTSTRAP_STATUSES.has(String(value.status)) ||
    typeof value.receiptId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.receiptId) ||
    !AGENT_IDS.has(String(value.requestedAgent)) ||
    !AGENT_IDS.has(String(value.resolvedHost)) ||
    !isRecord(value.project) ||
    typeof value.project.name !== 'string' ||
    typeof value.project.relativePath !== 'string' ||
    !isRecord(workspace) ||
    typeof workspace.name !== 'string' ||
    !['managed', 'adopted', 'imported', 'linked', 'restored'].includes(
      String(workspace.relationship)
    ) ||
    workspace.resolved !== true ||
    workspace.identityIsFilesystemPath !== false ||
    workspace.resolverCommand !== 'workspai project workspace status --json' ||
    workspace.portableUriScheme !== 'workspace:' ||
    workspace.resolvedPathPolicy !== 'runtime-private-never-persist' ||
    !isRecord(entry) ||
    entry.artifact !== '.workspai/agent-entry.v1.json' ||
    entry.schemaVersion !== 'workspai.agent-entry.v1' ||
    !BOOTSTRAP_STATUSES.has(String(entry.hostStatus)) ||
    !Array.isArray(entry.entryFiles) ||
    entry.entryFiles.length === 0 ||
    !entry.entryFiles.every((item) => typeof item === 'string' && item.length > 0) ||
    !isRecord(evidence) ||
    evidence.projectContext !== '.workspai/reports/project-context-agent.json' ||
    evidence.workspaceIndex !== 'workspace:.workspai/reports/INDEX.json' ||
    evidence.workspaceContext !== 'workspace:.workspai/reports/workspace-context-agent.json' ||
    (!legacyEvidenceRoute && !boundedEvidenceRoute) ||
    !FRESHNESS_STATUSES.has(String(evidence.modelFreshness)) ||
    !FRESHNESS_STATUSES.has(String(evidence.graphFreshness)) ||
    typeof evidence.graphMatchesModel !== 'boolean' ||
    typeof evidence.liveInputsValidated !== 'boolean' ||
    !Number.isInteger(evidence.blockerCount) ||
    Number(evidence.blockerCount) < 0 ||
    !isRecord(activeGoal) ||
    typeof activeGoal.present !== 'boolean' ||
    typeof activeGoal.appliesToProject !== 'boolean' ||
    !['none', 'ready', 'stale', 'invalid'].includes(String(activeGoal.status)) ||
    (activeGoal.status === 'none' && activeGoal.present !== false) ||
    (activeGoal.status !== 'none' && activeGoal.present !== true) ||
    !isRecord(claims) ||
    !['allowed-with-citations', 'prohibited'].includes(String(claims.architecture)) ||
    claims.sourceInspection !== 'bounded-and-targeted' ||
    claims.sourceMutation !== 'governed-cli-transaction-only' ||
    claims.verification !== 'cli-evidence-only' ||
    !Array.isArray(value.requiredReadOrder) ||
    value.requiredReadOrder.length < 6 ||
    value.requiredReadOrder.length > 16 ||
    !value.requiredReadOrder.every((item) => typeof item === 'string' && item.length > 0) ||
    new Set(value.requiredReadOrder).size !== value.requiredReadOrder.length ||
    !Array.isArray(value.checks) ||
    value.checks.length < 6 ||
    !value.checks.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        ['passed', 'warning', 'failed'].includes(String(item.status)) &&
        typeof item.message === 'string'
    ) ||
    !Array.isArray(value.nextActions) ||
    value.nextActions.length === 0 ||
    value.nextActions.length > 8 ||
    !value.nextActions.every((item) => typeof item === 'string' && item.length > 0) ||
    !isRecord(integrity) ||
    integrity.algorithm !== 'sha256' ||
    typeof integrity.manifestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.manifestHash) ||
    typeof integrity.projectContextHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.projectContextHash) ||
    integrity.portable !== true ||
    integrity.absolutePathsEmitted !== false ||
    typeof integrity.payloadHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.payloadHash) ||
    !isPortableValue(value)
  ) {
    return undefined;
  }
  return value as AgentBootstrapReceipt;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function executeBootstrap(input: {
  projectPath: string;
  workspacePath?: string;
  consumer: 'generic' | 'copilot';
  run: BootstrapRunner;
}): Promise<ProjectAgentBootstrapResult> {
  const markerStates = await Promise.all(
    ADOPTION_MARKERS.map((marker) => exists(path.join(input.projectPath, marker)))
  );
  const adopted = markerStates.some(Boolean);
  if (!adopted) {
    const workspacePath = input.workspacePath?.trim();
    const canonicalWorkspace = workspacePath
      ? (
          await Promise.all(
            WORKSPACE_MARKERS.map((marker) => exists(path.join(workspacePath, marker)))
          )
        ).some(Boolean)
      : false;
    if (canonicalWorkspace) {
      return {
        status: 'blocked',
        adopted: false,
        reason:
          'The selected project is linked to a Workspai workspace but has no portable agent entry contract. Refresh adoption and Workspace Intelligence before agent-driven analysis or mutation.',
      };
    }
    return { status: 'not-applicable', adopted: false };
  }
  if (!markerStates[0]) {
    return {
      status: 'blocked',
      adopted: true,
      reason:
        'This project has Workspai adoption metadata but no portable agent entry contract. Run Workspai adoption or Workspace Intelligence again before using agent-driven analysis or mutation.',
    };
  }

  const execution = await input.run({
    command: ['agent', 'bootstrap', '--for-agent', input.consumer, '--json'],
    cwd: input.projectPath,
    featureLabel: 'Project agent bootstrap',
    timeoutMs: 2 * 60_000,
  });
  const receipt = parseReceipt(execution.result);
  if (!receipt) {
    return {
      status: 'blocked',
      adopted: true,
      reason:
        execution.stderr.trim() ||
        'Workspai CLI did not return a valid portable agent bootstrap receipt.',
    };
  }
  if (execution.failed && receipt.status !== 'blocked') {
    return {
      status: 'blocked',
      adopted: true,
      receipt,
      reason: 'The agent bootstrap command failed without a matching blocked receipt.',
    };
  }
  return {
    status: receipt.status,
    adopted: true,
    receipt,
    ...(receipt.status === 'ready'
      ? {}
      : {
          reason:
            receipt.nextActions[0] ??
            'Canonical project evidence is not ready for a fully grounded agent session.',
        }),
  };
}

export async function bootstrapProjectAgent(input: {
  projectPath?: string;
  workspacePath?: string;
  consumer?: 'generic' | 'copilot';
  run?: BootstrapRunner;
  bypassCache?: boolean;
}): Promise<ProjectAgentBootstrapResult> {
  const projectPath = input.projectPath?.trim();
  if (!projectPath) {
    return { status: 'not-applicable', adopted: false };
  }
  const key = `${path.resolve(projectPath)}\0${input.consumer ?? 'generic'}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (!input.bypassCache && cached && cached.expiresAt > now) {
    return cached.promise;
  }
  const promise = executeBootstrap({
    projectPath: path.resolve(projectPath),
    workspacePath: input.workspacePath,
    consumer: input.consumer ?? 'generic',
    run: input.run ?? runRapidkitStreaming,
  });
  if (!input.run) {
    cache.set(key, { expiresAt: now + CACHE_TTL_MS, promise });
    void promise.then((result) => {
      if (result.status === 'blocked') {
        cache.delete(key);
      }
    });
  }
  return promise;
}

export function buildProjectAgentBootstrapPromptSection(
  result: ProjectAgentBootstrapResult
): string {
  if (result.status === 'not-applicable') {
    return '';
  }
  if (!result.receipt) {
    return [
      'PROJECT AGENT ENTRY:',
      '- Status: blocked',
      `- Reason: ${result.reason ?? 'Canonical project entry evidence is unavailable.'}`,
      '- Do not claim complete architecture or begin source mutation.',
    ].join('\n');
  }
  const receipt = result.receipt;
  return [
    'PROJECT AGENT BOOTSTRAP RECEIPT:',
    `- Status: ${receipt.status}`,
    `- Project: ${receipt.project.name}`,
    `- Canonical workspace identity: ${receipt.workspace.name} (resolved privately at runtime)`,
    `- Model freshness: ${receipt.canonicalEvidence.modelFreshness}`,
    `- Graph freshness: ${receipt.canonicalEvidence.graphFreshness}`,
    receipt.canonicalEvidence.boundedGraphSearch
      ? `- Bounded graph retrieval: ${receipt.canonicalEvidence.boundedGraphSearch}`
      : '- Evidence route: legacy canonical Model and Graph (load only when the task requires it)',
    `- Live inputs validated: ${receipt.canonicalEvidence.liveInputsValidated}`,
    `- Canonical blockers: ${receipt.canonicalEvidence.blockerCount}`,
    `- Architecture claims: ${receipt.claims.architecture}`,
    `- Source policy: ${receipt.claims.sourceInspection}; mutations ${receipt.claims.sourceMutation}`,
    `- Required read order: ${receipt.requiredReadOrder.join(' -> ')}`,
    receipt.activeGoal.present
      ? `- Active Goal: ${receipt.activeGoal.objective ?? receipt.activeGoal.id ?? 'present'} (${receipt.activeGoal.status})`
      : '- Active Goal: none',
    ...(result.reason ? [`- Next action: ${result.reason}`] : []),
  ].join('\n');
}

export function requireReadyProjectAgentBootstrap(result: ProjectAgentBootstrapResult): void {
  if (result.status === 'not-applicable' || result.status === 'ready') {
    return;
  }
  throw new Error(
    result.reason ??
      'The adopted project is not ready for governed source mutation. Refresh canonical Workspai evidence and retry.'
  );
}

export function requireUsableProjectAgentBootstrap(result: ProjectAgentBootstrapResult): void {
  if (result.status !== 'blocked') {
    return;
  }
  throw new Error(
    result.reason ??
      'The adopted project has no usable canonical entry receipt. Refresh Workspai adoption and Workspace Intelligence before starting an agent session.'
  );
}

export function resetProjectAgentBootstrapCache(): void {
  cache.clear();
}
