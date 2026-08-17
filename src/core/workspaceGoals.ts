import * as path from 'path';
import * as os from 'os';

import { parseTrailingJson } from './canonicalProjectLifecycle.js';
import type { EvidenceCliRunResult } from './evidenceCommandRunner.js';
import { readJsonArtifact, type JsonArtifactReadResult } from './jsonArtifactReader.js';
import { stripAnsi } from '../utils/cliOutputSanitizer.js';
import {
  parseVerifiedGoalContract,
  type VerifiedGoalContractPayload,
} from './verifiedGoalIntent.js';

export const GOAL_INDEX_SCHEMA_VERSION = 'workspai.goal-index.v1';
export const GOAL_PLAN_RESULT_SCHEMA_VERSION = 'workspai.goal-plan-result.v1';
export const GOAL_LIFECYCLE_RESULT_SCHEMA_VERSION = 'workspai.goal-lifecycle-result.v1';
export const GOAL_INDEX_RELATIVE_PATH = '.workspai/goals/index.json';

export type GoalPlanningState =
  | 'ready-to-plan'
  | 'needs-confirmation'
  | 'needs-evidence'
  | 'blocked';

export type GoalLifecycle =
  | 'planned'
  | 'active'
  | 'cancelled'
  | 'verification-ready'
  | 'verified'
  | 'failed';

export type GoalCategory =
  | 'release-readiness'
  | 'dependency-security'
  | 'test-coverage'
  | 'defect-repair'
  | 'feature-change'
  | 'refactor'
  | 'performance'
  | 'documentation'
  | 'system-understanding';

export type GoalEntry = {
  id: string;
  fingerprint: string;
  objective: string;
  category: GoalCategory;
  state: GoalPlanningState;
  lifecycle: GoalLifecycle;
  scope: {
    kind: 'workspace' | 'project';
    projects: string[];
    selectionSource: 'workspace' | 'invocation-project' | 'explicit';
  };
  createdAt: string;
  updatedAt: string;
  goalPack: string;
  agentHandoff: string;
  verifiedGoalId?: string;
  repairTransactionId?: string;
  repairTransactionIds?: string[];
};

export type GoalIndex = {
  schemaVersion: typeof GOAL_INDEX_SCHEMA_VERSION;
  generatedAt: string;
  activeGoalId: string | null;
  goals: GoalEntry[];
};

export type GoalPlanResult = {
  schemaVersion: typeof GOAL_PLAN_RESULT_SCHEMA_VERSION;
  result: 'planned' | 'needs-confirmation' | 'needs-evidence' | 'blocked';
  resolution: { source: string; invocationScope: 'workspace' | 'project' };
  goalPack: { schemaVersion: string; id: string; fingerprint: string };
  agentHandoff: { schemaVersion: string; goalId: string; goalFingerprint: string };
  writtenArtifacts: string[];
  dryRun: boolean;
  resumed: boolean;
};

export type GoalLifecycleResult = {
  schemaVersion: typeof GOAL_LIFECYCLE_RESULT_SCHEMA_VERSION;
  operation: 'status' | 'list' | 'activate' | 'cancel' | 'prepare' | 'verify';
  activeGoalId: string | null;
  goal: GoalEntry | null;
  goals: GoalEntry[];
  goalPack: {
    schemaVersion: string;
    id: string;
    fingerprint: string;
    state: GoalPlanningState;
  } | null;
  verifiedGoalId: string | null;
  verification: Record<string, unknown> | null;
};

export type GoalAgentHandoff = {
  schemaVersion: 'workspai.goal-agent-handoff.v1';
  goalId: string;
  goalFingerprint: string;
  generatedAt: string;
  consumer: 'generic' | 'claude' | 'codex';
  state: GoalPlanningState;
  objective: string;
  scope: GoalEntry['scope'];
  discovery: {
    index: typeof GOAL_INDEX_RELATIVE_PATH;
    statusCommand: string;
    requiredReads: string[];
  };
  evidence: Array<{
    role: 'model' | 'graph' | 'goal';
    artifact: string;
    binding: {
      algorithm: 'sha256';
      semantics: 'workspace-model-structural-v1' | 'canonical-json-v1';
      value: string;
    };
  }>;
  retrieval: {
    status: 'grounded' | 'partial' | 'empty';
    strategy: 'deterministic-category-v1';
    queries: string[];
    anchors: Array<{ entityId: string; kind: string; label: string; proofIds: string[] }>;
  };
  guardrails: string[];
  workflow: Array<{
    order: number;
    owner: 'workspai-cli' | 'agent' | 'human';
    instruction: string;
  }>;
  renewal: { command: string; reason: string };
};

export type GoalCommandResult =
  | { ok: true; command: EvidenceCliRunResult; value: GoalPlanResult | GoalLifecycleResult }
  | { ok: false; command?: EvidenceCliRunResult; error: string };

export function isGoalPlanResult(
  value: GoalPlanResult | GoalLifecycleResult
): value is GoalPlanResult {
  return value.schemaVersion === GOAL_PLAN_RESULT_SCHEMA_VERSION;
}

export function isGoalLifecycleResult(
  value: GoalPlanResult | GoalLifecycleResult
): value is GoalLifecycleResult {
  return value.schemaVersion === GOAL_LIFECYCLE_RESULT_SCHEMA_VERSION;
}

const GOAL_CATEGORIES = new Set<GoalCategory>([
  'release-readiness',
  'dependency-security',
  'test-coverage',
  'defect-repair',
  'feature-change',
  'refactor',
  'performance',
  'documentation',
  'system-understanding',
]);
const GOAL_STATES = new Set<GoalPlanningState>([
  'ready-to-plan',
  'needs-confirmation',
  'needs-evidence',
  'blocked',
]);
const GOAL_LIFECYCLES = new Set<GoalLifecycle>([
  'planned',
  'active',
  'cancelled',
  'verification-ready',
  'verified',
  'failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueStringArray(
  value: unknown,
  options: { min: number; max?: number }
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= options.min &&
    (options.max === undefined || value.length <= options.max) &&
    value.every((item) => typeof item === 'string' && item.trim()) &&
    new Set(value).size === value.length
  );
}

function isSafeWorkspaceArtifact(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('.workspai/') &&
    !value.includes('..') &&
    !path.isAbsolute(value)
  );
}

function isGoalEvidence(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (record) =>
        isRecord(record) &&
        ['model', 'graph', 'goal'].includes(String(record.role)) &&
        isSafeWorkspaceArtifact(record.artifact) &&
        isRecord(record.binding) &&
        record.binding.algorithm === 'sha256' &&
        ['workspace-model-structural-v1', 'canonical-json-v1'].includes(
          String(record.binding.semantics)
        ) &&
        typeof record.binding.value === 'string' &&
        /^[a-f0-9]{64}$/.test(record.binding.value)
    )
  );
}

function isRelativeGoalArtifact(
  value: unknown,
  fileName: 'goal-pack.json' | 'agent-handoff.json'
): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('.workspai/goals/') &&
    value.endsWith(`/${fileName}`) &&
    !value.includes('..') &&
    !path.isAbsolute(value)
  );
}

export function parseGoalEntry(value: unknown): GoalEntry | null {
  if (!isRecord(value) || !isRecord(value.scope)) {
    return null;
  }
  const projects = value.scope.projects;
  if (
    typeof value.id !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/.test(value.id) ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    typeof value.objective !== 'string' ||
    !value.objective.trim() ||
    !GOAL_CATEGORIES.has(value.category as GoalCategory) ||
    !GOAL_STATES.has(value.state as GoalPlanningState) ||
    !GOAL_LIFECYCLES.has(value.lifecycle as GoalLifecycle) ||
    (value.scope.kind !== 'workspace' && value.scope.kind !== 'project') ||
    !isUniqueStringArray(projects, { min: 1 }) ||
    !['workspace', 'invocation-project', 'explicit'].includes(
      String(value.scope.selectionSource)
    ) ||
    typeof value.createdAt !== 'string' ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.updatedAt)) ||
    !isRelativeGoalArtifact(value.goalPack, 'goal-pack.json') ||
    !isRelativeGoalArtifact(value.agentHandoff, 'agent-handoff.json') ||
    (value.verifiedGoalId !== undefined &&
      (typeof value.verifiedGoalId !== 'string' || !value.verifiedGoalId.trim())) ||
    (value.repairTransactionId !== undefined &&
      (typeof value.repairTransactionId !== 'string' ||
        !/^[A-Za-z0-9_-]{12,128}$/.test(value.repairTransactionId))) ||
    (value.repairTransactionIds !== undefined &&
      (!isUniqueStringArray(value.repairTransactionIds, { min: 1, max: 25 }) ||
        !value.repairTransactionIds.every((entry) => /^[A-Za-z0-9_-]{12,128}$/.test(entry)) ||
        (typeof value.repairTransactionId === 'string' &&
          value.repairTransactionIds.at(-1) !== value.repairTransactionId)))
  ) {
    return null;
  }

  return value as unknown as GoalEntry;
}

export function parseGoalIndex(value: unknown): GoalIndex | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== GOAL_INDEX_SCHEMA_VERSION ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    (value.activeGoalId !== null && typeof value.activeGoalId !== 'string') ||
    !Array.isArray(value.goals)
  ) {
    return null;
  }
  const goals = value.goals.map(parseGoalEntry);
  if (goals.some((goal) => goal === null)) {
    return null;
  }
  const parsedGoals = goals as GoalEntry[];
  if (value.activeGoalId !== null && !parsedGoals.some((goal) => goal.id === value.activeGoalId)) {
    return null;
  }
  return { ...value, goals: parsedGoals } as GoalIndex;
}

export async function readGoalIndex(
  workspacePath: string
): Promise<
  | { kind: 'valid'; artifactPath: string; value: GoalIndex }
  | Exclude<JsonArtifactReadResult, { kind: 'valid' }>
> {
  const artifactPath = path.join(workspacePath, GOAL_INDEX_RELATIVE_PATH);
  const result = await readJsonArtifact(artifactPath);
  if (result.kind !== 'valid') {
    return result;
  }
  const parsed = parseGoalIndex(result.raw);
  if (!parsed) {
    return {
      kind: 'incompatible',
      artifactPath,
      error: `Artifact schema is incompatible: expected ${GOAL_INDEX_SCHEMA_VERSION}.`,
    };
  }
  return { kind: 'valid', artifactPath, value: parsed };
}

export async function readPreparedVerifiedGoal(
  workspacePath: string,
  verifiedGoalId: string
): Promise<VerifiedGoalContractPayload | null> {
  if (!/^goal-[A-Za-z0-9._-]{3,90}$/.test(verifiedGoalId)) {
    return null;
  }
  const artifactPath = path.join(
    path.resolve(workspacePath),
    '.workspai',
    'goals',
    verifiedGoalId,
    'goal.json'
  );
  const result = await readJsonArtifact(artifactPath);
  if (result.kind !== 'valid') {
    return null;
  }
  const goal = parseVerifiedGoalContract(result.raw);
  if (!goal || path.resolve(goal.workspace.path) !== path.resolve(workspacePath)) {
    return null;
  }
  return goal;
}

export async function readGoalVerificationAttempts(
  workspacePath: string,
  goal: VerifiedGoalContractPayload
): Promise<number | null> {
  const root = path.resolve(workspacePath);
  const artifactPath = path.join(root, '.workspai', 'goals', goal.id, 'status.json');
  const relative = path.relative(root, artifactPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  const result = await readJsonArtifact(artifactPath);
  if (result.kind !== 'valid') {
    return null;
  }
  const attempt = result.raw.attempt;
  if (
    result.raw.schemaVersion !== 'workspai.verified-goal-status.v1' ||
    result.raw.goalId !== goal.id ||
    result.raw.goalFingerprint !== goal.fingerprint ||
    path.resolve(String(result.raw.workspacePath ?? '')) !== root ||
    !Number.isInteger(attempt) ||
    Number(attempt) < 0 ||
    Number(attempt) > 10_000
  ) {
    return null;
  }
  return Number(attempt);
}

export async function findGoalPackForVerifiedGoal(
  workspacePath: string,
  verifiedGoalId: string
): Promise<GoalEntry | null> {
  const index = await readGoalIndex(workspacePath);
  if (index.kind !== 'valid') {
    return null;
  }
  return index.value.goals.find((goal) => goal.verifiedGoalId === verifiedGoalId) ?? null;
}

export async function readGoalExecutionPolicy(
  workspacePath: string,
  goal: GoalEntry
): Promise<{ maxAttempts: number } | null> {
  const root = path.resolve(workspacePath);
  const artifactPath = path.resolve(root, goal.goalPack);
  const relative = path.relative(root, artifactPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  const result = await readJsonArtifact(artifactPath);
  if (result.kind !== 'valid') {
    return null;
  }
  const policy = isRecord(result.raw.policy) ? result.raw.policy : null;
  const maxAttempts = policy?.maxAttempts;
  if (
    result.raw.id !== goal.id ||
    result.raw.fingerprint !== goal.fingerprint ||
    !Number.isInteger(maxAttempts) ||
    Number(maxAttempts) < 1 ||
    Number(maxAttempts) > 25
  ) {
    return null;
  }
  return { maxAttempts: Number(maxAttempts) };
}

function parseGoalAgentHandoff(value: unknown, goal: GoalEntry): GoalAgentHandoff | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'workspai.goal-agent-handoff.v1' ||
    value.goalId !== goal.id ||
    value.goalFingerprint !== goal.fingerprint ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !['generic', 'claude', 'codex'].includes(String(value.consumer)) ||
    !GOAL_STATES.has(value.state as GoalPlanningState) ||
    typeof value.objective !== 'string' ||
    value.objective !== goal.objective ||
    !isRecord(value.scope) ||
    value.scope.kind !== goal.scope.kind ||
    !isUniqueStringArray(value.scope.projects, { min: 1 }) ||
    value.scope.projects.join('\0') !== goal.scope.projects.join('\0') ||
    value.scope.selectionSource !== goal.scope.selectionSource ||
    !isRecord(value.discovery) ||
    value.discovery.index !== GOAL_INDEX_RELATIVE_PATH ||
    typeof value.discovery.statusCommand !== 'string' ||
    !value.discovery.statusCommand.startsWith(`workspai goal --status ${goal.id}`) ||
    !isUniqueStringArray(value.discovery.requiredReads, { min: 3 }) ||
    !value.discovery.requiredReads.every(isSafeWorkspaceArtifact) ||
    !isGoalEvidence(value.evidence) ||
    !isRecord(value.retrieval) ||
    !['grounded', 'partial', 'empty'].includes(String(value.retrieval.status)) ||
    value.retrieval.strategy !== 'deterministic-category-v1' ||
    !isUniqueStringArray(value.retrieval.queries, { min: 1, max: 3 }) ||
    !Array.isArray(value.retrieval.anchors) ||
    value.retrieval.anchors.length > 20 ||
    value.retrieval.anchors.some(
      (anchor) =>
        !isRecord(anchor) ||
        typeof anchor.entityId !== 'string' ||
        typeof anchor.kind !== 'string' ||
        typeof anchor.label !== 'string' ||
        !Array.isArray(anchor.proofIds) ||
        !isUniqueStringArray(anchor.proofIds, { min: 0 })
    ) ||
    !isUniqueStringArray(value.guardrails, { min: 5 }) ||
    !Array.isArray(value.workflow) ||
    value.workflow.length < 5 ||
    value.workflow.some(
      (step) =>
        !isRecord(step) ||
        typeof step.order !== 'number' ||
        !['workspai-cli', 'agent', 'human'].includes(String(step.owner)) ||
        typeof step.instruction !== 'string' ||
        !step.instruction.trim()
    ) ||
    !isRecord(value.renewal) ||
    typeof value.renewal.command !== 'string' ||
    !value.renewal.command.startsWith('workspai goal ') ||
    typeof value.renewal.reason !== 'string' ||
    !value.renewal.reason.trim()
  ) {
    return null;
  }
  return value as unknown as GoalAgentHandoff;
}

export async function readActiveGoalHandoff(
  workspacePath: string
): Promise<GoalAgentHandoff | null> {
  const index = await readGoalIndex(workspacePath);
  if (index.kind !== 'valid' || !index.value.activeGoalId) {
    return null;
  }
  const goal = index.value.goals.find((entry) => entry.id === index.value.activeGoalId);
  if (!goal) {
    return null;
  }
  const artifactPath = path.resolve(workspacePath, goal.agentHandoff);
  const relative = path.relative(workspacePath, artifactPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  const result = await readJsonArtifact(artifactPath);
  return result.kind === 'valid' ? parseGoalAgentHandoff(result.raw, goal) : null;
}

export function buildActiveGoalPromptSection(handoff: GoalAgentHandoff | null): string {
  if (!handoff) {
    return '';
  }
  const lines = [
    'ACTIVE GOVERNED GOAL (CLI-authored agent handoff):',
    `- Objective: ${handoff.objective}`,
    `- Goal: ${handoff.goalId} · ${handoff.state} · ${handoff.scope.kind}`,
    `- Projects: ${handoff.scope.projects.join(', ')}`,
    `- Retrieval: ${handoff.retrieval.status} via ${handoff.retrieval.strategy}`,
  ];
  if (handoff.retrieval.queries.length > 0) {
    lines.push(`- Bounded queries: ${handoff.retrieval.queries.slice(0, 3).join(' | ')}`);
  }
  if (handoff.retrieval.anchors.length > 0) {
    lines.push('- Proof-backed anchors:');
    for (const anchor of handoff.retrieval.anchors.slice(0, 12)) {
      lines.push(`  • ${anchor.label} [${anchor.kind}] · ${anchor.proofIds.length} proof(s)`);
    }
  }
  lines.push('- Guardrails:');
  for (const guardrail of handoff.guardrails.slice(0, 8)) {
    lines.push(`  • ${guardrail}`);
  }
  lines.push(
    '- Treat this handoff as bounded context, not mutation authority. The CLI owns preparation, repair transactions, verification, and rollback.'
  );
  return lines.join('\n');
}

export async function gateGoalCli(workspacePath: string): Promise<boolean> {
  const [{ gateCompatibleCliVersion }, { gateTopLevelRapidkitCli }] = await Promise.all([
    import('./cliVersionGate.js'),
    import('./rapidkitCliCapabilities.js'),
  ]);
  if (!(await gateCompatibleCliVersion({ cwd: workspacePath, featureLabel: 'Governed Goals' }))) {
    return false;
  }
  return gateTopLevelRapidkitCli('Governed Goals', 'goal', { cwd: workspacePath });
}

export function parseGoalCommandOutput(
  stdout: string
): GoalPlanResult | GoalLifecycleResult | null {
  const value = parseTrailingJson<Record<string, unknown>>(stdout);
  if (!value) {
    return null;
  }
  if (value.schemaVersion === GOAL_PLAN_RESULT_SCHEMA_VERSION) {
    if (
      !['planned', 'needs-confirmation', 'needs-evidence', 'blocked'].includes(
        String(value.result)
      ) ||
      !isRecord(value.resolution) ||
      !['workspace', 'project'].includes(String(value.resolution.invocationScope)) ||
      !isRecord(value.goalPack) ||
      typeof value.goalPack.id !== 'string' ||
      !/^[a-f0-9]{64}$/.test(String(value.goalPack.fingerprint)) ||
      !isRecord(value.agentHandoff) ||
      value.agentHandoff.goalId !== value.goalPack.id ||
      value.agentHandoff.goalFingerprint !== value.goalPack.fingerprint ||
      !Array.isArray(value.writtenArtifacts) ||
      !value.writtenArtifacts.every(
        (artifact) =>
          typeof artifact === 'string' &&
          artifact.startsWith('.workspai/') &&
          !artifact.includes('..') &&
          !path.isAbsolute(artifact)
      ) ||
      typeof value.dryRun !== 'boolean' ||
      typeof value.resumed !== 'boolean'
    ) {
      return null;
    }
    return value as unknown as GoalPlanResult;
  }
  if (value.schemaVersion === GOAL_LIFECYCLE_RESULT_SCHEMA_VERSION) {
    if (
      !['status', 'list', 'activate', 'cancel', 'prepare', 'verify'].includes(
        String(value.operation)
      ) ||
      (value.activeGoalId !== null && typeof value.activeGoalId !== 'string') ||
      !Array.isArray(value.goals) ||
      value.goals.some((goal) => parseGoalEntry(goal) === null) ||
      (value.goal !== null && parseGoalEntry(value.goal) === null) ||
      (value.verifiedGoalId !== null && typeof value.verifiedGoalId !== 'string') ||
      (value.verification !== null && !isRecord(value.verification))
    ) {
      return null;
    }
    return value as unknown as GoalLifecycleResult;
  }
  return null;
}

export async function runGoalCommand(input: {
  workspacePath: string;
  args: string[];
  label: string;
}): Promise<GoalCommandResult> {
  if (!(await gateGoalCli(input.workspacePath))) {
    return { ok: false, error: 'The linked Workspai CLI does not support governed Goals.' };
  }
  const { runEvidenceCliCommand } = await import('./evidenceCommandRunner.js');
  const command = await runEvidenceCliCommand({
    workspacePath: input.workspacePath,
    cliArgs: ['goal', ...input.args, '--json'],
    label: input.label,
  });
  const value = parseGoalCommandOutput(command.stdout);
  if (command.exitCode !== 0 || !value) {
    const detail = sanitizeGoalCommandDetail(
      command.stderr.trim() || command.stdout.trim(),
      input.workspacePath
    );
    return {
      ok: false,
      command,
      error:
        detail ||
        `Workspai returned exit code ${command.exitCode} without a compatible Goal result.`,
    };
  }
  return { ok: true, command, value };
}

export function sanitizeGoalCommandDetail(value: string, workspacePath: string): string {
  let sanitized = stripAnsi(value);
  const replacements: Array<[string, string]> = [
    [path.resolve(workspacePath), '$WORKSPACE'],
    [path.resolve(os.homedir()), '$HOME'],
  ];
  for (const [localPath, token] of replacements) {
    if (!localPath || localPath === path.parse(localPath).root) {
      continue;
    }
    sanitized = sanitized.split(localPath).join(token);
    if (path.sep === '\\') {
      sanitized = sanitized.split(localPath.replace(/\\/g, '/')).join(token);
    }
  }
  return sanitized.slice(0, 4_000);
}

export function summarizeGoal(goal: GoalEntry): string {
  const scope = goal.scope.kind === 'workspace' ? 'workspace' : goal.scope.projects.join(', ');
  return `${goal.lifecycle} · ${goal.state} · ${scope}`;
}
