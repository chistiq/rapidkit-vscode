import fs from 'fs-extra';
import path from 'node:path';

import type { StreamingRunResult } from './streamingRapidkitRunner.js';
import { WORKSPACE_INTELLIGENCE_BENCHMARK_REPORT_PATH } from './workspaceIntelligencePaths.js';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import {
  loadProofCarryingChangeProjection,
  type ProofCarryingChangeProjection,
} from './proofCarryingChangeProjection.js';

export { WORKSPACE_INTELLIGENCE_BENCHMARK_REPORT_PATH };

export type WorkspaceActivityBoardStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'rolled-back'
  | 'skipped'
  | 'unknown';

type WorkspaceActivityEvidenceBindingBase = {
  ref: string;
  role: 'input' | 'output' | 'verification' | 'subject';
  provenance: 'authoritative' | 'observed';
};

export type WorkspaceActivityEvidenceBinding =
  | (WorkspaceActivityEvidenceBindingBase & {
      kind: 'artifact' | 'project';
      graphSourceHash?: string;
    })
  | (WorkspaceActivityEvidenceBindingBase & {
      kind: 'graph-entity' | 'graph-relation' | 'proof';
      graphSourceHash: string;
    });

export type WorkspaceActivityBoardNode = {
  id: string;
  label: string;
  status: WorkspaceActivityBoardStatus;
  order: number;
  progress?: { current: number; total?: number; unit?: string };
  durationMs?: number;
  layoutHint?: 'source' | 'process' | 'gate' | 'sink';
  group?: string;
  updatedAt: string;
  root: boolean;
  evidenceBindings?: WorkspaceActivityEvidenceBinding[];
};

export type WorkspaceActivityBoardRun = {
  run: {
    runId: string;
    status: WorkspaceActivityBoardStatus;
    startedAt: string;
    updatedAt: string;
    durationMs?: number;
    evidenceBindings?: WorkspaceActivityEvidenceBinding[];
  } & Record<string, unknown>;
  commandLabel: string;
  active: boolean;
  nodes: WorkspaceActivityBoardNode[];
  edges: Array<{
    id: string;
    fromBlockId: string;
    toBlockId: string;
    kind: 'sequence' | 'parallel' | 'gate' | 'handoff';
    status: WorkspaceActivityBoardStatus;
    order: number;
    updatedAt: string;
    inferred: boolean;
  }>;
  activeBlockCount: number;
  warningCount: number;
  scope: { kind: string; label: string };
  locationLabel: string;
};

export type WorkspaceActivityBoard = {
  schemaVersion: 'workspace-activity-board.v1';
  scopeLabel: string;
  generatedAt: string;
  activeRunCount: number;
  healthyRunCount: number;
  warningRunCount: number;
  failedRunCount: number;
  selectedRunId?: string;
  runs: WorkspaceActivityBoardRun[];
  diagnostics: string[];
  global: boolean;
  scopeCount: number;
};

export type WorkspaceIntelligenceBenchmarkSummary = {
  schemaVersion: 'workspace-intelligence-benchmark.v1';
  generatedAt: string;
  suite: { id: 'agent-core.v1'; title: string };
  graph: {
    sourceHash: string;
    entityCount: number;
    relationCount: number;
    proofCount: number;
  };
  retrievalSummary: {
    provenance: 'estimated';
    scenarioCount: number;
    matchedScenarioCount: number;
    medianRetrievalEstimatedTokens: number;
    p95RetrievalEstimatedTokens: number;
    medianEstimatedReductionPercent: number;
    status: 'passed' | 'partial' | 'unavailable';
  };
  evaluation: {
    availability: 'available' | 'unavailable';
    provenance: 'measured' | 'mixed' | 'estimated' | 'unavailable';
    trustedMeasuredReductionPercent: number | null;
    claimBoundary: string;
  };
};

export type WorkspaceOperationsProjection = {
  board: WorkspaceActivityBoard | null;
  benchmark: WorkspaceIntelligenceBenchmarkSummary | null;
  changes: ProofCarryingChangeProjection;
  studio: WorkspaceStudioActivityProjection;
  diagnostics: string[];
};

export type WorkspaceStudioActivityStage = {
  id: string;
  label: string;
  status: WorkspaceActivityBoardStatus;
  order: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  detail?: string;
  evidenceBindings?: WorkspaceActivityEvidenceBinding[];
};

export type WorkspaceStudioActivitySession = {
  sessionId: string;
  cardId: string;
  assistantMode: 'agent' | 'ask' | 'plan' | 'goal';
  projectPath?: string;
  status: WorkspaceActivityBoardStatus;
  active: boolean;
  startedAt: string;
  updatedAt: string;
  toolCallCount: number;
  failedToolCallCount: number;
  modelCheckpointCount: number;
  stages: WorkspaceStudioActivityStage[];
};

export type WorkspaceStudioActivityProjection = {
  generatedAt: string;
  activeSessionCount: number;
  sessionCount: number;
  toolCallCount: number;
  failedToolCallCount: number;
  sessions: WorkspaceStudioActivitySession[];
};

type Runner = <T = unknown>(options: {
  command: string[];
  cwd: string;
  featureLabel?: string;
  timeoutMs?: number;
}) => Promise<StreamingRunResult<T>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isWorkspaceActivityEvidenceBinding(
  value: unknown
): value is WorkspaceActivityEvidenceBinding {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ['artifact', 'graph-entity', 'graph-relation', 'proof', 'project'].includes(
      String(value.kind)
    ) &&
    typeof value.ref === 'string' &&
    value.ref.length > 0 &&
    ['input', 'output', 'verification', 'subject'].includes(String(value.role)) &&
    ['authoritative', 'observed'].includes(String(value.provenance)) &&
    (!['graph-entity', 'graph-relation', 'proof'].includes(String(value.kind)) ||
      (typeof value.graphSourceHash === 'string' && value.graphSourceHash.length > 0)) &&
    (value.graphSourceHash === undefined ||
      (typeof value.graphSourceHash === 'string' && value.graphSourceHash.length > 0))
  );
}

function hasValidOptionalEvidenceBindings(value: Record<string, unknown>): boolean {
  return (
    value.evidenceBindings === undefined ||
    (Array.isArray(value.evidenceBindings) &&
      value.evidenceBindings.every(isWorkspaceActivityEvidenceBinding))
  );
}

function studioStatus(status: StudioAgentPersistedSession['status']): WorkspaceActivityBoardStatus {
  if (status === 'completed') {
    return 'succeeded';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  if (['running', 'verifying', 'waiting-input', 'waiting-permission'].includes(status)) {
    return status === 'waiting-input' || status === 'waiting-permission' ? 'blocked' : 'running';
  }
  return 'pending';
}

function eventData(event: StudioAgentPersistedSession['events'][number]): Record<string, unknown> {
  return isRecord(event.data) ? event.data : {};
}

function studioCommandLabel(data: Record<string, unknown>): string | undefined {
  if (typeof data.displayCommand === 'string' && data.displayCommand.trim()) {
    return data.displayCommand.trim().slice(0, 500);
  }
  if (data.toolName !== 'run-workspace-command' || !isRecord(data.input)) {
    return undefined;
  }
  const executable = typeof data.input.executable === 'string' ? data.input.executable.trim() : '';
  const args = Array.isArray(data.input.args)
    ? data.input.args.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const command = [executable, ...args].filter(Boolean).join(' ');
  return command ? command.slice(0, 500) : undefined;
}

function graphSearchEvidenceBindings(
  data: Record<string, unknown>
): WorkspaceActivityEvidenceBinding[] {
  if (data.toolName !== 'query-workspace-graph') {
    return [];
  }
  const output = isRecord(data.output) ? data.output : undefined;
  const result = output && isRecord(output.result) ? output.result : undefined;
  if (
    !result ||
    result.schemaVersion !== 'workspace-knowledge-search.v1' ||
    typeof result.graphSourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.graphSourceHash)
  ) {
    return [];
  }
  const graphSourceHash = result.graphSourceHash;
  const bindings: WorkspaceActivityEvidenceBinding[] = [];
  const append = (
    kind: 'graph-entity' | 'graph-relation' | 'proof',
    values: unknown,
    limit: number
  ) => {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values.slice(0, limit)) {
      if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) {
        continue;
      }
      bindings.push({
        kind,
        ref: value.id.trim(),
        role: 'input',
        provenance: 'authoritative',
        graphSourceHash,
      });
    }
  };
  append('graph-entity', result.entities, 12);
  append('graph-relation', result.relations, 12);
  append('proof', result.proofs, 8);
  return bindings;
}

function mergeStudioEvidenceBindings(
  current: readonly WorkspaceActivityEvidenceBinding[] | undefined,
  next: readonly WorkspaceActivityEvidenceBinding[]
): WorkspaceActivityEvidenceBinding[] | undefined {
  const bindings = new Map<string, WorkspaceActivityEvidenceBinding>();
  for (const binding of [...(current ?? []), ...next]) {
    bindings.set(
      `${binding.kind}\u0000${binding.ref}\u0000${binding.graphSourceHash ?? ''}`,
      binding
    );
  }
  return bindings.size > 0 ? [...bindings.values()].slice(0, 32) : undefined;
}

export function projectStudioActivity(
  sessions: readonly StudioAgentPersistedSession[],
  workspacePath: string,
  now = new Date()
): WorkspaceStudioActivityProjection {
  const projectedSessions = sessions
    .filter((session) => session.workspacePath === workspacePath)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 6)
    .map((session): WorkspaceStudioActivitySession => {
      const stages = new Map<string, WorkspaceStudioActivityStage>();
      for (const event of session.events) {
        if (
          !event.toolCallId ||
          ![
            'tool.requested',
            'tool.approval.requested',
            'tool.approval.approved',
            'tool.approval.rejected',
            'tool.started',
            'tool.progress',
            'tool.completed',
            'tool.failed',
          ].includes(event.type)
        ) {
          continue;
        }
        const data = eventData(event);
        const prior = stages.get(event.toolCallId);
        const process = isRecord(data.process) ? data.process : undefined;
        const processPhase = typeof process?.phase === 'string' ? process.phase : undefined;
        const output = isRecord(data.output) ? data.output : undefined;
        const rollback = isRecord(output?.rollback) ? output.rollback : undefined;
        const effects = isRecord(output?.effects) ? output.effects : undefined;
        const evidenceBindings = mergeStudioEvidenceBindings(
          prior?.evidenceBindings,
          graphSearchEvidenceBindings(data)
        );
        const commandLabel = studioCommandLabel(data);
        const label =
          commandLabel ??
          prior?.label ??
          (typeof data.toolName === 'string' && data.toolName.trim()
            ? data.toolName.trim().replaceAll('-', ' ')
            : 'Studio tool');
        const startedAt =
          event.type === 'tool.started' ||
          event.type === 'tool.approval.requested' ||
          processPhase === 'started'
            ? (prior?.startedAt ?? event.timestamp)
            : prior?.startedAt;
        const completedAt =
          event.type === 'tool.completed' ||
          event.type === 'tool.failed' ||
          event.type === 'tool.approval.rejected' ||
          processPhase === 'completed'
            ? event.timestamp
            : prior?.completedAt;
        const status: WorkspaceActivityBoardStatus = rollback
          ? 'rolled-back'
          : event.type === 'tool.approval.rejected' && data.optional === true
            ? 'succeeded'
            : event.type === 'tool.failed' || event.type === 'tool.approval.rejected'
              ? 'failed'
              : event.type === 'tool.completed'
                ? 'succeeded'
                : event.type === 'tool.started' || event.type === 'tool.progress'
                  ? 'running'
                  : event.type === 'tool.approval.requested'
                    ? 'blocked'
                    : event.type === 'tool.approval.approved'
                      ? 'pending'
                      : (prior?.status ?? 'pending');
        const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
        const endMs = completedAt ? Date.parse(completedAt) : Number.NaN;
        stages.set(event.toolCallId, {
          id: event.toolCallId,
          label,
          status,
          order: prior?.order ?? event.sequence,
          ...(startedAt ? { startedAt } : {}),
          ...(completedAt ? { completedAt } : {}),
          ...(Number.isFinite(startMs) && Number.isFinite(endMs)
            ? { durationMs: Math.max(0, endMs - startMs) }
            : {}),
          ...(rollback
            ? {
                detail: `Automatic rollback restored ${Array.isArray(rollback.changedPaths) ? rollback.changedPaths.length : 0} source path(s)${effects?.repositoryMetadata === true || effects?.externalSystem === true ? '; non-source effects require separate verification' : ''}`,
              }
            : process
              ? {
                  detail:
                    processPhase === 'started'
                      ? `Process ${String(process.processId ?? 'starting')} · ${String(process.cwd ?? '')}`
                      : processPhase === 'completed'
                        ? `Process ${String(process.processId ?? '')} · ${String(process.exitCode ?? 'no exit')} · ${String(process.durationMs ?? 0)} ms`
                        : `Process ${String(process.processId ?? '')} · ${String(process.elapsedMs ?? 0)} ms · ${String(process.stdoutBytes ?? 0)}B stdout · ${String(process.stderrBytes ?? 0)}B stderr`,
                }
              : (event.type === 'tool.failed' || event.type === 'tool.approval.rejected') &&
                  typeof data.error === 'string'
                ? { detail: data.error }
                : event.type === 'tool.approval.requested'
                  ? {
                      detail: commandLabel
                        ? `${commandLabel} · exact scoped approval required`
                        : 'Exact scoped approval required',
                    }
                  : commandLabel
                    ? { detail: commandLabel }
                    : prior?.detail
                      ? { detail: prior.detail }
                      : {}),
          ...(evidenceBindings ? { evidenceBindings } : {}),
        });
      }
      const orderedStages = [...stages.values()]
        .sort((left, right) => left.order - right.order)
        .slice(-24);
      return {
        sessionId: session.id,
        cardId: session.cardId,
        assistantMode: session.assistantMode,
        ...(session.projectPath ? { projectPath: session.projectPath } : {}),
        status: studioStatus(session.status),
        active: ['running', 'verifying', 'waiting-input', 'waiting-permission'].includes(
          session.status
        ),
        startedAt: session.createdAt,
        updatedAt: session.updatedAt,
        toolCallCount: orderedStages.length,
        failedToolCallCount: orderedStages.filter((stage) => stage.status === 'failed').length,
        modelCheckpointCount: session.events.filter((event) => event.type === 'model.checkpoint')
          .length,
        stages: orderedStages,
      };
    });
  return {
    generatedAt: now.toISOString(),
    activeSessionCount: projectedSessions.filter((session) => session.active).length,
    sessionCount: projectedSessions.length,
    toolCallCount: projectedSessions.reduce((total, session) => total + session.toolCallCount, 0),
    failedToolCallCount: projectedSessions.reduce(
      (total, session) => total + session.failedToolCallCount,
      0
    ),
    sessions: projectedSessions,
  };
}

export function isWorkspaceActivityBoard(value: unknown): value is WorkspaceActivityBoard {
  if (!isRecord(value) || value.schemaVersion !== 'workspace-activity-board.v1') {
    return false;
  }
  return (
    typeof value.scopeLabel === 'string' &&
    isIsoDate(value.generatedAt) &&
    isFiniteNumber(value.activeRunCount) &&
    isFiniteNumber(value.healthyRunCount) &&
    isFiniteNumber(value.warningRunCount) &&
    isFiniteNumber(value.failedRunCount) &&
    Array.isArray(value.runs) &&
    value.runs.every(
      (run) =>
        isRecord(run) &&
        isRecord(run.run) &&
        hasValidOptionalEvidenceBindings(run.run) &&
        typeof run.run.runId === 'string' &&
        typeof run.commandLabel === 'string' &&
        typeof run.active === 'boolean' &&
        Array.isArray(run.nodes) &&
        run.nodes.every((node) => isRecord(node) && hasValidOptionalEvidenceBindings(node)) &&
        Array.isArray(run.edges)
    ) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every((entry) => typeof entry === 'string') &&
    typeof value.global === 'boolean' &&
    isFiniteNumber(value.scopeCount)
  );
}

export function isWorkspaceIntelligenceBenchmarkSummary(
  value: unknown
): value is WorkspaceIntelligenceBenchmarkSummary {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'workspace-intelligence-benchmark.v1' ||
    !isRecord(value.suite) ||
    value.suite.id !== 'agent-core.v1' ||
    !isRecord(value.graph) ||
    !isRecord(value.retrievalSummary) ||
    !isRecord(value.evaluation)
  ) {
    return false;
  }
  return (
    isIsoDate(value.generatedAt) &&
    typeof value.suite.title === 'string' &&
    typeof value.graph.sourceHash === 'string' &&
    isFiniteNumber(value.graph.entityCount) &&
    isFiniteNumber(value.graph.relationCount) &&
    isFiniteNumber(value.graph.proofCount) &&
    value.retrievalSummary.provenance === 'estimated' &&
    isFiniteNumber(value.retrievalSummary.scenarioCount) &&
    isFiniteNumber(value.retrievalSummary.matchedScenarioCount) &&
    isFiniteNumber(value.retrievalSummary.medianRetrievalEstimatedTokens) &&
    isFiniteNumber(value.retrievalSummary.p95RetrievalEstimatedTokens) &&
    isFiniteNumber(value.retrievalSummary.medianEstimatedReductionPercent) &&
    ['passed', 'partial', 'unavailable'].includes(String(value.retrievalSummary.status)) &&
    ['available', 'unavailable'].includes(String(value.evaluation.availability)) &&
    ['measured', 'mixed', 'estimated', 'unavailable'].includes(
      String(value.evaluation.provenance)
    ) &&
    (value.evaluation.trustedMeasuredReductionPercent === null ||
      isFiniteNumber(value.evaluation.trustedMeasuredReductionPercent)) &&
    typeof value.evaluation.claimBoundary === 'string'
  );
}

async function readBenchmark(workspacePath: string): Promise<{
  benchmark: WorkspaceIntelligenceBenchmarkSummary | null;
  diagnostic?: string;
}> {
  const reportPath = path.join(workspacePath, WORKSPACE_INTELLIGENCE_BENCHMARK_REPORT_PATH);
  try {
    const parsed = JSON.parse(await fs.readFile(reportPath, 'utf8')) as unknown;
    return isWorkspaceIntelligenceBenchmarkSummary(parsed)
      ? { benchmark: parsed }
      : {
          benchmark: null,
          diagnostic: 'Benchmark artifact does not match the published v1 contract.',
        };
  } catch (error) {
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
    return code === 'ENOENT'
      ? { benchmark: null }
      : { benchmark: null, diagnostic: 'Benchmark artifact could not be read safely.' };
  }
}

export async function loadWorkspaceOperationsProjection(input: {
  workspacePath: string;
  run?: Runner;
  studioSessions?: readonly StudioAgentPersistedSession[];
}): Promise<WorkspaceOperationsProjection> {
  const run: Runner =
    input.run ??
    (async (options) => {
      const { runRapidkitStreaming } = await import('./streamingRapidkitRunner.js');
      return runRapidkitStreaming(options);
    });
  const [live, benchmarkResult, changes] = await Promise.all([
    run<unknown>({
      command: ['live', '--once', '--projection', 'board', '--json'],
      cwd: input.workspacePath,
      featureLabel: 'Live Workspace Activity Board',
      timeoutMs: 20_000,
    }),
    readBenchmark(input.workspacePath),
    loadProofCarryingChangeProjection({
      workspacePath: input.workspacePath,
      run,
    }),
  ]);

  const diagnostics: string[] = [];
  let board: WorkspaceActivityBoard | null = null;
  if (!live.failed && isWorkspaceActivityBoard(live.result)) {
    board = live.result;
  } else if (live.failed) {
    diagnostics.push(
      live.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1) ??
        'Live activity projection is currently unavailable.'
    );
  } else {
    diagnostics.push('Live activity output does not match the published Board v1 contract.');
  }
  if (benchmarkResult.diagnostic) {
    diagnostics.push(benchmarkResult.diagnostic);
  }
  diagnostics.push(...changes.diagnostics);

  return {
    board,
    benchmark: benchmarkResult.benchmark,
    changes,
    studio: projectStudioActivity(input.studioSessions ?? [], input.workspacePath),
    diagnostics,
  };
}
