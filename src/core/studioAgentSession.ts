import crypto from 'node:crypto';

import {
  createStudioAgentEvent,
  type StudioAgentEvent,
  type StudioAgentPersistedSession,
  type StudioAgentSessionStatus,
} from './studioAgentEvents.js';
import {
  resolveStudioAgentToolPermission,
  type StudioAgentPermissionLevel,
  type StudioAgentToolContext,
  type StudioAgentToolRegistry,
  type StudioAgentToolResult,
} from './studioAgentToolRegistry.js';
import type { WorkspaiAssistantMode } from './assistantModeContract.js';

export type StudioAgentModelAction =
  | { type: 'tool'; callId?: string; toolName: string; input: unknown; reason: string }
  | { type: 'message'; text: string }
  | { type: 'complete'; summary: string };

export type StudioAgentModelContext = {
  session: StudioAgentPersistedSession;
  tools: Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    activity: string;
    risk: string;
  }>;
  latestObservation?: StudioAgentToolResult;
  /**
   * Bounded in-memory observations for the active causal epoch.
   *
   * Durable events intentionally omit source bodies. Keeping a short
   * non-persisted window lets the model retain inspected source while it runs
   * diagnostics or audits, without writing source content to VS Code storage.
   */
  recentObservations?: StudioAgentRecentObservation[];
  sourceRepairDirective?: Record<string, unknown>;
  sourceActionRequired?: boolean;
  steering: string[];
};

export type StudioAgentRecentObservation = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  result: StudioAgentToolResult;
};

export interface StudioAgentModelAdapter {
  next(context: StudioAgentModelContext): Promise<StudioAgentModelAction>;
  compact?(context: StudioAgentModelContext): Promise<string>;
}

export interface StudioAgentSessionStore {
  save(session: StudioAgentPersistedSession): Promise<void>;
  load?(sessionId: string): Promise<StudioAgentPersistedSession | undefined>;
}

const DURABLE_EVENT_STRING_LIMIT = 2_000;
const DURABLE_EVENT_ARRAY_LIMIT = 50;
const GENERAL_SOURCE_REPAIR_TOOL_NAMES = new Set([
  'discover-workspace-files',
  'inspect-source',
  'search-workspace',
  'inspect-workspace-diagnostics',
  'run-workspace-command',
  'apply-workspace-patch',
  'delete-workspace-files',
  'inspect-workspace-changes',
  'complete-dependency-transaction',
]);

const DEPENDENCY_SOURCE_FILE_PATTERN =
  /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb?|deno\.jsonc?|jsr\.json|pyproject\.toml|poetry\.lock|uv\.lock|pdm\.lock|pipfile(?:\.lock)?|requirements(?:[-_.][^/]+)?\.txt|setup\.py|setup\.cfg|go\.mod|go\.sum|cargo\.toml|cargo\.lock|composer\.json|composer\.lock|gemfile|gemfile\.lock|pubspec\.ya?ml|pubspec\.lock|packages\.lock\.json|directory\.packages\.props|[^/]+\.(?:csproj|fsproj|vbproj)|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.lockfile)$/i;

class StudioAgentReviewRequiredError extends Error {
  readonly terminalReason: string;
  readonly requiresUserDecision = true;
  readonly transactionId?: string;
  readonly decisionOptions: string[];

  constructor(
    message: string,
    terminalReason = 'review-required',
    input?: { transactionId?: string; decisionOptions?: string[] }
  ) {
    super(message);
    this.name = 'StudioAgentReviewRequiredError';
    this.terminalReason = terminalReason;
    this.transactionId = input?.transactionId;
    this.decisionOptions = input?.decisionOptions ?? [];
  }
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function dependencyMutationScope(input: {
  action: Extract<StudioAgentModelAction, { type: 'tool' }>;
  result: StudioAgentToolResult;
  workspacePath: string;
}): { projectNames?: string[]; changedPaths?: string[] } | undefined {
  if (input.result.changed !== true) {
    return undefined;
  }
  const output = toolOutputRecord(input.result);
  const target =
    output?.target && typeof output.target === 'object' && !Array.isArray(output.target)
      ? (output.target as Record<string, unknown>)
      : undefined;
  const projectNames = new Set<string>();
  if (typeof target?.projectName === 'string' && target.projectName.trim()) {
    projectNames.add(target.projectName.trim());
  }
  for (const projectName of stringValues(output?.projectNames)) {
    projectNames.add(projectName.trim());
  }
  const changedPaths = new Set<string>([
    ...stringValues(output?.changedPaths),
    ...stringValues(output?.changedFiles),
  ]);
  const actionInput =
    input.action.input &&
    typeof input.action.input === 'object' &&
    !Array.isArray(input.action.input)
      ? (input.action.input as Record<string, unknown>)
      : undefined;
  if (input.action.toolName === 'apply-workspace-patch' && Array.isArray(actionInput?.patches)) {
    for (const patch of actionInput.patches) {
      if (
        patch &&
        typeof patch === 'object' &&
        !Array.isArray(patch) &&
        typeof (patch as Record<string, unknown>).relativePath === 'string'
      ) {
        changedPaths.add(String((patch as Record<string, unknown>).relativePath));
      }
    }
  }
  const dependencyPaths = [...changedPaths]
    .map((value) => value.replace(/\\/g, '/'))
    .filter((value) => DEPENDENCY_SOURCE_FILE_PATTERN.test(value));
  const dependencyTool = [
    'repair-dependency-security',
    'upgrade-dependency-security',
    'complete-dependency-transaction',
  ].includes(input.action.toolName);
  if (!dependencyTool && dependencyPaths.length === 0) {
    return undefined;
  }
  return {
    ...(projectNames.size > 0 ? { projectNames: [...projectNames] } : {}),
    ...(dependencyPaths.length > 0 ? { changedPaths: dependencyPaths } : {}),
  };
}

function toolOutputRecord(result: StudioAgentToolResult): Record<string, unknown> | undefined {
  return result.output && typeof result.output === 'object' && !Array.isArray(result.output)
    ? (result.output as Record<string, unknown>)
    : undefined;
}

function requestsGeneralSourceRepair(result: StudioAgentToolResult): boolean {
  const output = toolOutputRecord(result);
  return (
    output?.nextAction === 'general-source-repair' ||
    output?.fallbackCapability === 'general-source-repair' ||
    output?.recoveryPath === 'general-source-repair'
  );
}

function requestsReviewDecision(result: StudioAgentToolResult): boolean {
  const output = toolOutputRecord(result);
  return output?.nextAction === 'review-required' && output?.requiresUserDecision === true;
}

function reviewDecisionMetadata(result: StudioAgentToolResult): {
  transactionId?: string;
  decisionOptions: string[];
} {
  const output = toolOutputRecord(result);
  const transaction =
    output?.transaction &&
    typeof output.transaction === 'object' &&
    !Array.isArray(output.transaction)
      ? (output.transaction as Record<string, unknown>)
      : undefined;
  const decision =
    transaction?.decision &&
    typeof transaction.decision === 'object' &&
    !Array.isArray(transaction.decision)
      ? (transaction.decision as Record<string, unknown>)
      : undefined;
  return {
    ...(typeof transaction?.transactionId === 'string'
      ? { transactionId: transaction.transactionId }
      : {}),
    decisionOptions: stringValues(decision?.options),
  };
}

function generalSourceRepairCommandViolation(
  action: Extract<StudioAgentModelAction, { type: 'tool' }>
): string | undefined {
  if (action.toolName !== 'run-workspace-command') {
    return undefined;
  }
  const input =
    action.input && typeof action.input === 'object' && !Array.isArray(action.input)
      ? (action.input as Record<string, unknown>)
      : undefined;
  const executable =
    String(input?.executable ?? '')
      .split(/[\\/]/)
      .pop()
      ?.toLowerCase() ?? '';
  const args = Array.isArray(input?.args)
    ? input.args.filter((entry): entry is string => typeof entry === 'string')
    : [];
  let command = executable === 'workspai' || executable === 'wspai' ? args : [];
  if (['npx', 'pnpx', 'bunx', 'npm', 'pnpm', 'yarn'].includes(executable)) {
    let binaryIndex = -1;
    for (let index = args.length - 1; index >= 0; index -= 1) {
      if (args[index] === 'workspai' || args[index] === 'wspai') {
        binaryIndex = index;
        break;
      }
    }
    if (binaryIndex >= 0) {
      command = args.slice(binaryIndex + 1);
    }
  }
  const first = command[0]?.toLowerCase();
  const second = command[1]?.toLowerCase();
  if (
    first === 'doctor' ||
    (first === 'workspace' &&
      ['verify', 'remediation-plan', 'intelligence', 'readiness'].includes(second ?? ''))
  ) {
    return (
      `The ${command.slice(0, 2).join(' ')} evidence producer is locked during general source repair. ` +
      'Make a real source change or return a review-required result; the controller owns evidence refresh and verification.'
    );
  }
  return undefined;
}

function verifiedNonBlockingResult(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  const result = data as StudioAgentToolResult;
  return result.ok === true && result.cardBlocking === false;
}

function sourceRepairInspectionCandidates(result: StudioAgentToolResult): string[] {
  const candidates = toolOutputRecord(result)?.sourceCandidates;
  if (!Array.isArray(candidates)) {
    return [];
  }
  const unique = new Set(
    candidates.filter(
      (entry): entry is string =>
        typeof entry === 'string' &&
        entry.trim().length > 0 &&
        !/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb?)$/i.test(
          entry
        )
    )
  );
  return [...unique].slice(0, 12);
}

function durableEventValue(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[depth-limited]';
  }
  if (typeof value === 'string') {
    return value.length > DURABLE_EVENT_STRING_LIMIT
      ? `${value.slice(0, DURABLE_EVENT_STRING_LIMIT)}…`
      : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, DURABLE_EVENT_ARRAY_LIMIT)
      .map((entry) => durableEventValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 80)
      .map(([key, entry]) => [
        key,
        /^(?:content|originalContent|patchedContent)$/i.test(key)
          ? '[omitted from durable session]'
          : durableEventValue(entry, depth + 1),
      ])
  );
}

function durableToolResult(result: StudioAgentToolResult): StudioAgentToolResult {
  return durableEventValue(result) as StudioAgentToolResult;
}

type LiveFileChange = {
  relativePath: string;
  status: string;
  isNewFile?: boolean;
  failReason?: string;
  diffLines: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string }>;
};

function unifiedDiffFileChanges(diff: string): LiveFileChange[] {
  const files: LiveFileChange[] = [];
  let current: LiveFileChange | undefined;
  let insideHunk = false;
  for (const line of diff.split(/\r?\n/)) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      current = {
        relativePath: header[2],
        status: 'modified',
        diffLines: [],
      };
      files.push(current);
      insideHunk = false;
      if (files.length >= 40) {
        break;
      }
      continue;
    }
    if (!current) {
      continue;
    }
    if (line === '--- /dev/null') {
      current.isNewFile = true;
      current.status = 'created';
      continue;
    }
    if (line.startsWith('@@')) {
      insideHunk = true;
      continue;
    }
    if (!insideHunk || current.diffLines.length >= 400) {
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.diffLines.push({ type: 'added', content: line.slice(1) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.diffLines.push({ type: 'removed', content: line.slice(1) });
    } else if (line.startsWith(' ')) {
      current.diffLines.push({ type: 'unchanged', content: line.slice(1) });
    }
  }
  return files.filter((file) => file.diffLines.length > 0);
}

function liveFileChanges(result: StudioAgentToolResult): LiveFileChange[] {
  const output = toolOutputRecord(result);
  const patchResult =
    output?.patchResult &&
    typeof output.patchResult === 'object' &&
    !Array.isArray(output.patchResult)
      ? (output.patchResult as Record<string, unknown>)
      : undefined;
  const candidates = Array.isArray(output?.patches)
    ? output.patches
    : Array.isArray(patchResult?.patches)
      ? patchResult.patches
      : [];
  const patchChanges = candidates
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).relativePath === 'string'
    )
    .map((patch) => {
      const hunks = Array.isArray(patch.hunks)
        ? patch.hunks.filter(
            (entry): entry is Record<string, unknown> =>
              Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
          )
        : [];
      const diffLines = hunks
        .flatMap((hunk) => [
          ...stringValues(hunk.removedLines).map((content) => ({
            type: 'removed' as const,
            content,
          })),
          ...stringValues(hunk.addedLines).map((content) => ({
            type: 'added' as const,
            content,
          })),
        ])
        .slice(0, 400);
      return {
        relativePath: String(patch.relativePath),
        status: typeof patch.status === 'string' ? patch.status : 'applied',
        ...(patch.isNewFile === true ? { isNewFile: true } : {}),
        ...(typeof patch.failReason === 'string' ? { failReason: patch.failReason } : {}),
        diffLines,
      };
    });
  if (patchChanges.length > 0) {
    return patchChanges;
  }
  return typeof output?.diff === 'string' ? unifiedDiffFileChanges(output.diff) : [];
}

function liveToolResult(result: StudioAgentToolResult): StudioAgentToolResult {
  const fileChanges = liveFileChanges(result);
  const output = toolOutputRecord(result);
  if (fileChanges.length === 0 || !output) {
    return result;
  }
  return { ...result, output: { ...output, fileChanges } };
}

function semanticProgressFingerprint(
  action: Extract<StudioAgentModelAction, { type: 'tool' }>,
  result: StudioAgentToolResult
): string | undefined {
  const output = toolOutputRecord(result);
  const inspectedSource =
    Array.isArray(result.output) &&
    result.output.some(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).path === 'string'
    );
  const materialObservation =
    result.changed === true ||
    Boolean(result.evidenceGeneration) ||
    Boolean(result.blockerSignature) ||
    result.cardBlocking !== undefined ||
    Array.isArray(output?.sourceCandidates) ||
    Array.isArray(output?.upgradeCandidates) ||
    Array.isArray(output?.files) ||
    Array.isArray(output?.diagnostics) ||
    typeof output?.stdout === 'string' ||
    typeof output?.stderr === 'string' ||
    typeof output?.exitCode === 'number' ||
    typeof output?.nextAction === 'string' ||
    typeof output?.activeHandoff === 'object' ||
    inspectedSource;
  if (!materialObservation) {
    return undefined;
  }
  return canonicalJson({
    toolName: action.toolName,
    input: action.input,
    ok: result.ok,
    changed: result.changed,
    evidenceGeneration: result.evidenceGeneration,
    blockerSignature: result.blockerSignature,
    cardBlocking: result.cardBlocking,
    nextAction: output?.nextAction,
    sourceCandidates: output?.sourceCandidates,
    upgradeCandidates: output?.upgradeCandidates,
  });
}

export type StudioAgentSessionOptions = {
  id?: string;
  workspacePath: string;
  projectPath?: string;
  cardId: string;
  assistantMode: WorkspaiAssistantMode;
  selectedModelId?: string;
  blockerSignature?: string;
  goal?: NonNullable<StudioAgentPersistedSession['goal']>;
  permissionLevel: StudioAgentPermissionLevel;
  workspaceTrusted: boolean;
  requiresVerifiedCompletion?: boolean;
  checkpointEvery?: number;
  maxTurns?: number;
  maxModelDecisionsWithoutSourceProgress?: number;
  restoredSession?: StudioAgentPersistedSession;
};

export class StudioAgentSession {
  private static readonly MAX_IN_MEMORY_EVENTS = 500;
  private static readonly MAX_RECENT_OBSERVATIONS = 8;
  private readonly listeners = new Set<(event: StudioAgentEvent) => void>();
  private readonly steering: string[] = [];
  private readonly recentObservations: StudioAgentRecentObservation[] = [];
  private readonly abortController = new AbortController();
  private readonly toolAttemptsByEpoch = new Map<string, number>();
  private readonly exhaustedTools = new Set<string>();
  private causalEpoch = 0;
  private generalSourceRepairActive = false;
  private sourceRepairDirective: Record<string, unknown> | undefined;
  private latestActiveCardId: string;
  private latestEvidenceGeneration: string | undefined;
  private latestBlockerSignature: string | undefined;
  private running: Promise<StudioAgentPersistedSession> | undefined;
  private state: StudioAgentPersistedSession;

  constructor(
    private readonly options: StudioAgentSessionOptions,
    private readonly model: StudioAgentModelAdapter,
    private readonly registry: StudioAgentToolRegistry,
    private readonly store: StudioAgentSessionStore,
    private readonly now: () => Date = () => new Date()
  ) {
    const createdAt = this.now().toISOString();
    this.state = options.restoredSession
      ? structuredClone(options.restoredSession)
      : {
          schemaVersion: 'workspai.studio-agent-session.v1',
          id: options.id ?? crypto.randomUUID(),
          workspacePath: options.workspacePath,
          ...(options.projectPath ? { projectPath: options.projectPath } : {}),
          cardId: options.cardId,
          assistantMode: options.assistantMode,
          ...(options.selectedModelId ? { selectedModelId: options.selectedModelId } : {}),
          ...(options.blockerSignature ? { blockerSignature: options.blockerSignature } : {}),
          ...(options.goal ? { goal: structuredClone(options.goal) } : {}),
          status: 'idle',
          createdAt,
          updatedAt: createdAt,
          sequence: 0,
          events: [],
        };
    if (options.restoredSession && options.blockerSignature) {
      this.state.blockerSignature = options.blockerSignature;
    }
    if (options.goal) {
      this.state.goal = structuredClone(options.goal);
    }
    if (options.restoredSession && options.selectedModelId) {
      this.state.selectedModelId = options.selectedModelId;
    }
    this.latestBlockerSignature =
      options.blockerSignature ?? options.restoredSession?.blockerSignature;
    this.latestActiveCardId = options.cardId;
    for (const event of this.state.events) {
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : undefined;
      if (data?.changed === true) {
        this.exhaustedTools.clear();
      }
      this.rememberExhaustedTools(data?.output);
      const result = data as StudioAgentToolResult | undefined;
      if (result && requestsGeneralSourceRepair(result)) {
        this.generalSourceRepairActive = true;
        this.sourceRepairDirective = toolOutputRecord(result);
      }
      if (event.type === 'verify.completed' && verifiedNonBlockingResult(data)) {
        this.generalSourceRepairActive = false;
        this.sourceRepairDirective = undefined;
      }
    }
  }

  get id(): string {
    return this.state.id;
  }

  snapshot(): StudioAgentPersistedSession {
    return structuredClone(this.state);
  }

  onEvent(listener: (event: StudioAgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  steer(message: string): void {
    const normalized = message.trim();
    if (!normalized) {
      return;
    }
    this.steering.push(normalized);
    void this.emit('request.steered', { message: normalized });
  }

  cancel(): void {
    this.abortController.abort();
  }

  run(request: string): Promise<StudioAgentPersistedSession> {
    if (this.running) {
      this.steer(request);
      return this.running;
    }
    this.running = this.execute(request).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async execute(request: string): Promise<StudioAgentPersistedSession> {
    const requestId = crypto.randomUUID();
    await this.setStatus('running');
    await this.emit(
      'request.started',
      {
        request,
        assistantMode: this.state.assistantMode,
        selectedModelId: this.state.selectedModelId,
        ...(this.state.goal ? { goal: this.state.goal } : {}),
      },
      requestId
    );
    let latestObservation: StudioAgentToolResult | undefined;
    let turnsSinceCheckpoint = 0;
    let totalTurns = 0;
    let consecutiveProtocolMisses = 0;
    let consecutiveCausalRejections = 0;
    let causalRecoveryAttempts = 0;
    let consecutiveModelDecisionsWithoutSemanticProgress = 0;
    const semanticProgress = new Set<string>();
    const resumedFailedAgentSession =
      this.state.assistantMode === 'agent' && this.options.restoredSession?.status === 'failed';
    let deterministicRecoveryPending =
      this.state.assistantMode === 'agent' &&
      Boolean(this.registry.get('recover-active-blocker')) &&
      (resumedFailedAgentSession ||
        !this.state.events.some((event) => {
          if (event.type !== 'tool.completed' && event.type !== 'tool.failed') {
            return false;
          }
          const data =
            event.data && typeof event.data === 'object' && !Array.isArray(event.data)
              ? (event.data as Record<string, unknown>)
              : undefined;
          return data?.toolName === 'recover-active-blocker';
        }));
    try {
      while (!this.abortController.signal.aborted) {
        totalTurns += 1;
        // maxTurns is an explicit test/host safety boundary. Production Agent
        // sessions are durable and checkpointed; an arbitrary per-request turn
        // count must never hand an unresolved blocker back to the operator.
        if (this.options.maxTurns !== undefined && totalTurns > this.options.maxTurns) {
          throw new Error(
            'Assistant turn budget exhausted. The durable session can resume safely.'
          );
        }
        const modelDecisionLimit = this.options.maxModelDecisionsWithoutSourceProgress ?? 12;
        if (
          this.state.assistantMode === 'agent' &&
          consecutiveModelDecisionsWithoutSemanticProgress >= modelDecisionLimit
        ) {
          const verificationToolName = this.verificationToolName();
          if (verificationToolName) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Provider-call circuit breaker reached. Studio is verifying once without spending another model call.',
                recovery: 'provider-call-circuit-breaker',
                modelDecisions: consecutiveModelDecisionsWithoutSemanticProgress,
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: verificationToolName,
                input: {},
                reason:
                  'Protect provider credits and verify the current blocker deterministically.',
              },
              requestId
            );
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              await this.emit(
                'session.completed',
                { summary: 'Deterministic verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
          throw new Error(
            `Studio stopped provider calls after ${modelDecisionLimit} consecutive model decisions without semantic progress. ` +
              'The blocker remains verified as unresolved; no additional model credit was spent.'
          );
        }
        const action: StudioAgentModelAction = deterministicRecoveryPending
          ? {
              type: 'tool',
              toolName: 'recover-active-blocker',
              input: {},
              reason:
                'Run the contract-first blocker recovery prelude before spending a model decision.',
            }
          : await this.model.next(
              this.modelContext(
                latestObservation,
                this.generalSourceRepairActive &&
                  consecutiveModelDecisionsWithoutSemanticProgress >=
                    Math.min(4, Math.max(1, modelDecisionLimit - 1))
              )
            );
        if (deterministicRecoveryPending) {
          deterministicRecoveryPending = false;
          await this.emit(
            'model.checkpoint',
            {
              summary:
                'Studio is resolving the fresh blocker contract before asking the model to explore source.',
              recovery: 'active-blocker-prelude',
            },
            requestId
          );
        } else {
          consecutiveModelDecisionsWithoutSemanticProgress += 1;
        }
        turnsSinceCheckpoint += 1;
        if (action.type === 'message') {
          consecutiveProtocolMisses += 1;
          await this.emit('model.message', { text: action.text }, requestId);
          if (consecutiveProtocolMisses >= 3) {
            throw new Error(
              'Selected model did not produce a valid native Studio tool call after 3 attempts.'
            );
          }
          latestObservation = {
            ok: false,
            error:
              'The repair is still active. Choose a tool or complete only after verified evidence.',
          };
        } else if (action.type === 'complete') {
          consecutiveProtocolMisses = 0;
          if (
            this.options.requiresVerifiedCompletion === false ||
            this.hasVerifiedCompletion(requestId)
          ) {
            await this.emit('session.completed', { summary: action.summary }, requestId);
            await this.setStatus('completed');
            return this.snapshot();
          }
          const verificationToolName = this.verificationToolName();
          if (!verificationToolName) {
            latestObservation = {
              ok: false,
              error:
                'Completion rejected: no canonical verification tool is registered for this session.',
            };
          } else {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The model requested completion. Studio is running the exact card verification contract before accepting it.',
                recovery: 'completion-stop-gate',
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: verificationToolName,
                input: {},
                reason: 'Prove the requested completion with fresh canonical card evidence.',
              },
              requestId
            );
            if (
              latestObservation.ok === true &&
              latestObservation.cardBlocking === false &&
              this.hasCanonicalChainClosure(requestId)
            ) {
              await this.emit('session.completed', { summary: action.summary }, requestId);
              await this.setStatus('completed');
              return this.snapshot();
            }
            latestObservation = {
              ...latestObservation,
              ok: false,
              error:
                latestObservation.error ??
                'Completion rejected: exact card verification still reports a blocker.',
            };
          }
        } else {
          consecutiveProtocolMisses = 0;
          const causalEpochBeforeTool = this.causalEpoch;
          const blockerSignatureBeforeAction = this.latestBlockerSignature;
          const activeCardBeforeAction = this.latestActiveCardId;
          let effectiveAction = action;
          latestObservation = await this.executeTool(effectiveAction, requestId);
          const initialProgressFingerprint = semanticProgressFingerprint(
            effectiveAction,
            latestObservation
          );
          if (initialProgressFingerprint && !semanticProgress.has(initialProgressFingerprint)) {
            semanticProgress.add(initialProgressFingerprint);
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
          }
          if (requestsReviewDecision(latestObservation)) {
            const terminalReason = String(
              toolOutputRecord(latestObservation)?.terminalReason ?? 'review-required'
            );
            const decisionMetadata = reviewDecisionMetadata(latestObservation);
            throw new StudioAgentReviewRequiredError(
              latestObservation.error ??
                'No compatible non-breaking remediation is currently available. Studio requires an explicit engineering decision before continuing.',
              terminalReason,
              decisionMetadata
            );
          }
          const dependencyPlan = (observation: StudioAgentToolResult) => {
            const output =
              observation.output &&
              typeof observation.output === 'object' &&
              !Array.isArray(observation.output)
                ? (observation.output as Record<string, unknown>)
                : undefined;
            const candidates = Array.isArray(output?.upgradeCandidates)
              ? output.upgradeCandidates.filter(
                  (entry): entry is Record<string, unknown> =>
                    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
                )
              : [];
            return { output, candidates };
          };
          let { output: observationOutput, candidates: upgradeCandidates } =
            dependencyPlan(latestObservation);
          const inspectedProjectName =
            typeof observationOutput?.target === 'object' &&
            observationOutput.target !== null &&
            !Array.isArray(observationOutput.target) &&
            typeof (observationOutput.target as Record<string, unknown>).projectName === 'string'
              ? String((observationOutput.target as Record<string, unknown>).projectName)
              : undefined;
          if (
            this.state.assistantMode === 'agent' &&
            effectiveAction.toolName === 'inspect-dependency-security' &&
            latestObservation.ok === true &&
            inspectedProjectName &&
            observationOutput?.nextAction !== 'general-source-repair' &&
            observationOutput?.nextAction !== 'review-required' &&
            this.registry.get('repair-dependency-security')
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Fresh audit evidence identified a vulnerable project. Studio is attempting its bounded package-manager repair before considering direct upgrades.',
                recovery: 'dependency-bounded-repair',
              },
              requestId
            );
            effectiveAction = {
              type: 'tool',
              toolName: 'repair-dependency-security',
              input: { projectName: inspectedProjectName },
              reason: 'Attempt the bounded package-manager repair once.',
            };
            latestObservation = await this.executeTool(effectiveAction, requestId);
            ({ output: observationOutput, candidates: upgradeCandidates } =
              dependencyPlan(latestObservation));
          }
          const deterministicUpgrade = upgradeCandidates.length === 1 ? upgradeCandidates[0] : null;
          if (
            this.state.assistantMode === 'agent' &&
            effectiveAction.toolName === 'repair-dependency-security' &&
            latestObservation.ok === false &&
            observationOutput?.nextAction === 'upgrade-dependency-security' &&
            deterministicUpgrade &&
            typeof deterministicUpgrade.packageName === 'string' &&
            this.registry.get('upgrade-dependency-security')
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The bounded repair exposed one audit-authorized direct upgrade. Studio is executing that governed transaction without another model call.',
                recovery: 'dependency-upgrade-transaction',
              },
              requestId
            );
            effectiveAction = {
              type: 'tool',
              toolName: 'upgrade-dependency-security',
              input: {
                ...(typeof observationOutput.target === 'object' &&
                observationOutput.target !== null &&
                !Array.isArray(observationOutput.target) &&
                typeof (observationOutput.target as Record<string, unknown>).projectName ===
                  'string'
                  ? {
                      projectName: (observationOutput.target as Record<string, unknown>)
                        .projectName,
                    }
                  : {}),
                packageName: deterministicUpgrade.packageName,
              },
              reason: 'Execute the single fresh audit-authorized dependency upgrade candidate.',
            };
            latestObservation = await this.executeTool(effectiveAction, requestId);
          }
          if (
            latestObservation.changed === true &&
            effectiveAction.toolName !== 'run-governed-command' &&
            effectiveAction.toolName !== 'verify-blocker' &&
            effectiveAction.toolName !== 'verify-goal'
          ) {
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
          }
          if (
            this.state.assistantMode === 'agent' &&
            effectiveAction.toolName === 'recover-active-blocker' &&
            latestObservation.ok === true &&
            latestObservation.changed !== true &&
            observationOutput?.nextAction === 'verify-blocker' &&
            this.verificationToolName()
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Fresh recovery evidence no longer contains the dependency blocker. Studio is verifying the card without another model call.',
                recovery: 'recovery-verify',
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: this.verificationToolName()!,
                input: {},
                reason: 'Verify that refreshed blocker evidence is non-blocking.',
              },
              requestId
            );
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              await this.emit(
                'session.completed',
                { summary: 'Deterministic verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
          const sourceCandidates = sourceRepairInspectionCandidates(latestObservation);
          if (
            this.state.assistantMode === 'agent' &&
            effectiveAction.toolName === 'recover-active-blocker' &&
            requestsGeneralSourceRepair(latestObservation) &&
            sourceCandidates.length > 0 &&
            this.registry.get('inspect-source')
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Blocker accelerators delegated to source repair. Studio is loading the exact causal manifests before spending a model decision.',
                recovery: 'general-source-inspection',
                sourceCandidates,
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'inspect-source',
                input: { paths: sourceCandidates },
                reason:
                  'Authorize and inspect the exact source candidates returned by blocker recovery.',
              },
              requestId
            );
          }
          if (this.causalEpoch > causalEpochBeforeTool) {
            causalRecoveryAttempts = 0;
          }
          const sourceMutationObserved = latestObservation.changed === true;
          const dependencyScope = dependencyMutationScope({
            action: effectiveAction,
            result: latestObservation,
            workspacePath: this.options.workspacePath,
          });
          let dependencyClosureReady = true;
          if (
            this.state.assistantMode === 'agent' &&
            dependencyScope &&
            effectiveAction.toolName !== 'complete-dependency-transaction' &&
            this.registry.get('complete-dependency-transaction')
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Dependency source changed. Studio is reconciling the manifest and lockfile, then running focused audit, test, and build validation before the Workspace Intelligence chain.',
                recovery: 'dependency-transaction',
                ...dependencyScope,
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'complete-dependency-transaction',
                input: dependencyScope,
                reason: 'Close the dependency transaction before canonical evidence regeneration.',
              },
              requestId
            );
            dependencyClosureReady =
              toolOutputRecord(latestObservation)?.closureReady === true &&
              latestObservation.ok === true;
          } else if (effectiveAction.toolName === 'complete-dependency-transaction') {
            dependencyClosureReady =
              toolOutputRecord(latestObservation)?.closureReady === true &&
              latestObservation.ok === true;
          }
          const dependencyTransactionClosed =
            effectiveAction.toolName === 'complete-dependency-transaction' &&
            dependencyClosureReady;
          const shouldRunPostMutationClosure =
            this.state.assistantMode === 'agent' &&
            (sourceMutationObserved || dependencyTransactionClosed) &&
            dependencyClosureReady &&
            effectiveAction.toolName !== 'run-governed-command' &&
            effectiveAction.toolName !== 'verify-blocker' &&
            effectiveAction.toolName !== 'verify-goal' &&
            Boolean(this.registry.get('run-governed-command')) &&
            Boolean(this.verificationToolName());
          if (shouldRunPostMutationClosure) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Source changed. Studio is closing the governed intelligence loop before asking the model for another decision.',
                recovery: 'post-mutation-chain',
              },
              requestId
            );
            const chainObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'run-governed-command',
                input: { commandId: 'workspaceIntelligenceChain' },
                reason: 'Refresh the canonical intelligence chain after a source mutation.',
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: this.verificationToolName()!,
                input: {},
                reason: 'Verify the card immediately after post-mutation evidence refresh.',
              },
              requestId
            );
            consecutiveCausalRejections = 0;
            causalRecoveryAttempts = 0;
            if (
              chainObservation.ok === true &&
              latestObservation.ok === true &&
              latestObservation.cardBlocking === false &&
              this.hasCanonicalChainClosure(requestId)
            ) {
              await this.emit(
                'session.completed',
                { summary: 'Post-mutation verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
          const activeBlockerAdvanced =
            latestObservation.cardBlocking === true &&
            ((Boolean(latestObservation.blockerSignature) &&
              latestObservation.blockerSignature !== blockerSignatureBeforeAction) ||
              this.latestActiveCardId !== activeCardBeforeAction);
          if (
            activeBlockerAdvanced &&
            this.state.assistantMode === 'agent' &&
            this.registry.get('recover-active-blocker')
          ) {
            this.generalSourceRepairActive = false;
            this.sourceRepairDirective = undefined;
            this.exhaustedTools.clear();
            deterministicRecoveryPending = true;
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            consecutiveCausalRejections = 0;
            causalRecoveryAttempts = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Verification advanced to a dependent blocker. Studio is transferring ownership to the next fresh blocker contract without another model decision.',
                recovery: 'dependent-blocker-handoff',
                previousCardId: activeCardBeforeAction,
                activeCardId: this.latestActiveCardId,
                previousBlockerSignature: blockerSignatureBeforeAction,
                blockerSignature: latestObservation.blockerSignature,
              },
              requestId
            );
            continue;
          }
          const causalRejection =
            latestObservation.ok === false &&
            /already produced|already ran|same semantic|unchanged generation/i.test(
              latestObservation.error ?? ''
            );
          consecutiveCausalRejections = causalRejection ? consecutiveCausalRejections + 1 : 0;
          if (consecutiveCausalRejections >= 2) {
            if (causalRecoveryAttempts >= 1) {
              throw new Error(
                'Studio Agent stopped a causal retry loop after deterministic verification produced no new evidence.'
              );
            }
            causalRecoveryAttempts += 1;
            consecutiveCausalRejections = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Repeated causal actions were rejected. Studio is verifying the current evidence before choosing a new path.',
                recovery: 'verify-blocker',
              },
              requestId
            );
            const causalEpochBeforeRecovery = this.causalEpoch;
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: this.verificationToolName()!,
                input: {},
                reason: 'Recover from a causal retry loop with fresh card verification.',
              },
              requestId
            );
            if (this.causalEpoch > causalEpochBeforeRecovery) {
              causalRecoveryAttempts = 0;
            }
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              await this.emit(
                'session.completed',
                { summary: 'Deterministic verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
        }

        if (turnsSinceCheckpoint >= (this.options.checkpointEvery ?? 12)) {
          await this.emit(
            'model.checkpoint',
            {
              summary: `Local checkpoint persisted after ${totalTurns} turn(s).`,
              evidenceGeneration: this.latestEvidenceGeneration,
              blockerSignature: this.latestBlockerSignature,
            },
            requestId
          );
          turnsSinceCheckpoint = 0;
        }
      }
      await this.emit('session.cancelled', { reason: 'cancelled' }, requestId);
      await this.setStatus('cancelled');
      return this.snapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.emit(
        'session.failed',
        {
          error: message,
          ...(error instanceof StudioAgentReviewRequiredError
            ? {
                terminalReason: error.terminalReason,
                requiresUserDecision: error.requiresUserDecision,
                ...(error.transactionId ? { transactionId: error.transactionId } : {}),
                ...(error.decisionOptions.length > 0
                  ? { decisionOptions: error.decisionOptions }
                  : {}),
              }
            : {}),
        },
        requestId
      );
      await this.setStatus('failed');
      return this.snapshot();
    }
  }

  private async executeTool(
    action: Extract<StudioAgentModelAction, { type: 'tool' }>,
    requestId: string
  ): Promise<StudioAgentToolResult> {
    const tool = this.registry.get(action.toolName);
    const toolCallId = action.callId?.trim() || crypto.randomUUID();
    const durableInput = durableEventValue(action.input);
    await this.emit(
      'tool.requested',
      { toolName: action.toolName, reason: action.reason, input: durableInput },
      requestId,
      toolCallId
    );
    if (!tool) {
      const result = { ok: false, error: `Unknown Studio Agent tool: ${action.toolName}` };
      await this.emit('tool.failed', result, requestId, toolCallId);
      return result;
    }
    const phaseViolation = this.generalSourceRepairActive
      ? generalSourceRepairCommandViolation(action)
      : undefined;
    if (phaseViolation) {
      const result = { ok: false, error: phaseViolation };
      await this.emit(
        'tool.failed',
        { toolName: tool.name, input: durableInput, policyRejected: true, ...result },
        requestId,
        toolCallId
      );
      return result;
    }
    if (this.exhaustedTools.has(tool.name)) {
      const result = {
        ok: false,
        evidenceGeneration: this.latestEvidenceGeneration,
        blockerSignature: this.latestBlockerSignature,
        error:
          `${tool.name} is exhausted for the current causal source generation. ` +
          'Use the general workspace capability plane until source or blocker evidence materially changes.',
      };
      await this.emit(
        'tool.failed',
        { toolName: tool.name, input: durableInput, acceleratorExhausted: true, ...result },
        requestId,
        toolCallId
      );
      return result;
    }
    const toolAttemptKey = `${this.causalEpoch}:${tool.name}:${canonicalJson(action.input)}`;
    const attemptsInEpoch = this.toolAttemptsByEpoch.get(toolAttemptKey) ?? 0;
    const maxAttemptsWithoutProgress = 1;
    if (attemptsInEpoch >= maxAttemptsWithoutProgress) {
      const result = {
        ok: false,
        evidenceGeneration: this.latestEvidenceGeneration,
        blockerSignature: this.latestBlockerSignature,
        error:
          `${tool.name} already produced an observation in the current causal evidence generation. ` +
          'Do not repeat it. Use the prior result, choose a different causal tool, or change source evidence before retrying.',
      };
      await this.emit(
        'tool.failed',
        { toolName: tool.name, input: durableInput, duplicate: true, ...result },
        requestId,
        toolCallId
      );
      if (tool.activity === 'verify') {
        await this.emit('verify.completed', result, requestId, toolCallId);
      }
      return result;
    }
    this.toolAttemptsByEpoch.set(toolAttemptKey, attemptsInEpoch + 1);
    const permission = resolveStudioAgentToolPermission({
      level: this.options.permissionLevel,
      risk: tool.risk,
      workspaceTrusted: this.options.workspaceTrusted,
    });
    await this.emit(
      'tool.permission',
      { toolName: tool.name, ...permission },
      requestId,
      toolCallId
    );
    if (!permission.allowed) {
      const result = { ok: false, error: permission.reason };
      await this.emit('tool.failed', { toolName: tool.name, ...result }, requestId, toolCallId);
      return result;
    }
    await this.emit(
      'tool.started',
      {
        toolName: tool.name,
        activity: tool.activity,
        input: durableInput,
        reason: action.reason,
      },
      requestId,
      toolCallId
    );
    const context: StudioAgentToolContext = {
      sessionId: this.id,
      requestId,
      toolCallId,
      workspacePath: this.options.workspacePath,
      ...(this.options.projectPath ? { projectPath: this.options.projectPath } : {}),
      signal: this.abortController.signal,
      reportProgress: async (data) => {
        const durableProgress = durableEventValue(data) as Record<string, unknown>;
        await this.emit(
          'tool.progress',
          { toolName: tool.name, ...durableProgress },
          requestId,
          toolCallId
        );
      },
    };
    let result: StudioAgentToolResult;
    try {
      result = await tool.execute(action.input, context);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const evidenceAdvanced =
      Boolean(result.changed) ||
      (tool.activity !== 'change' &&
        this.latestEvidenceGeneration !== undefined &&
        Boolean(result.evidenceGeneration) &&
        result.evidenceGeneration !== this.latestEvidenceGeneration) ||
      (this.latestBlockerSignature !== undefined &&
        Boolean(result.blockerSignature) &&
        result.blockerSignature !== this.latestBlockerSignature);
    if (result.evidenceGeneration) {
      this.latestEvidenceGeneration = result.evidenceGeneration;
    }
    if (result.blockerSignature) {
      this.latestBlockerSignature = result.blockerSignature;
      this.state.blockerSignature = result.blockerSignature;
    }
    const output = toolOutputRecord(result);
    const activeHandoff =
      output?.activeHandoff &&
      typeof output.activeHandoff === 'object' &&
      !Array.isArray(output.activeHandoff)
        ? (output.activeHandoff as Record<string, unknown>)
        : undefined;
    if (typeof activeHandoff?.cardId === 'string' && activeHandoff.cardId.trim()) {
      this.latestActiveCardId = activeHandoff.cardId.trim();
    }
    if (result.changed === true) {
      this.exhaustedTools.clear();
    }
    this.rememberExhaustedTools(result.output);
    if (requestsGeneralSourceRepair(result)) {
      this.generalSourceRepairActive = true;
      this.sourceRepairDirective = toolOutputRecord(result);
    }
    if (tool.activity === 'verify' && result.ok === true && result.cardBlocking === false) {
      this.generalSourceRepairActive = false;
      this.sourceRepairDirective = undefined;
    }
    if (evidenceAdvanced) {
      this.causalEpoch += 1;
    }
    this.recentObservations.push({
      toolCallId,
      toolName: tool.name,
      input: structuredClone(action.input),
      result,
    });
    if (this.recentObservations.length > StudioAgentSession.MAX_RECENT_OBSERVATIONS) {
      this.recentObservations.splice(
        0,
        this.recentObservations.length - StudioAgentSession.MAX_RECENT_OBSERVATIONS
      );
    }
    const durableResult = durableToolResult(result);
    const transientResult = liveToolResult(result);
    await this.emit(
      result.ok ? 'tool.completed' : 'tool.failed',
      { toolName: tool.name, input: durableInput, reason: action.reason, ...durableResult },
      requestId,
      toolCallId,
      { toolName: tool.name, input: durableInput, reason: action.reason, ...transientResult }
    );
    if (tool.activity === 'verify') {
      await this.emit('verify.completed', durableResult, requestId, toolCallId);
    }
    return result;
  }

  private hasVerifiedCompletion(requestId: string): boolean {
    const latestVerify = [...this.state.events]
      .reverse()
      .find((event) => event.type === 'verify.completed' && event.requestId === requestId);
    if (!latestVerify) {
      return false;
    }
    const result = latestVerify.data as StudioAgentToolResult;
    return (
      result.ok === true &&
      result.cardBlocking === false &&
      this.hasCanonicalChainClosure(requestId)
    );
  }

  private verificationToolName(): 'verify-goal' | 'verify-blocker' | undefined {
    if (this.state.goal && this.registry.get('verify-goal')) {
      return 'verify-goal';
    }
    return this.registry.get('verify-blocker') ? 'verify-blocker' : undefined;
  }

  private hasCanonicalChainClosure(requestId: string): boolean {
    const requestEvents = this.state.events.filter((event) => event.requestId === requestId);
    const latestSourceMutation = [...requestEvents].reverse().find((event) => {
      if (event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as Record<string, unknown>;
      return (
        data.changed === true &&
        data.toolName !== 'run-governed-command' &&
        data.toolName !== 'verify-blocker' &&
        data.toolName !== 'verify-goal'
      );
    });
    if (!latestSourceMutation) {
      return true;
    }

    return requestEvents.some((event) => {
      if (event.sequence <= latestSourceMutation.sequence || event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as Record<string, unknown>;
      const toolInput =
        data.input && typeof data.input === 'object' && !Array.isArray(data.input)
          ? (data.input as Record<string, unknown>)
          : undefined;
      return (
        data.toolName === 'run-governed-command' &&
        toolInput?.commandId === 'workspaceIntelligenceChain' &&
        data.ok === true
      );
    });
  }

  private modelContext(
    latestObservation?: StudioAgentToolResult,
    sourceActionRequired = false
  ): StudioAgentModelContext {
    const tools = this.registry
      .list()
      .filter((tool) => !this.exhaustedTools.has(tool.name))
      .filter(
        (tool) => !this.generalSourceRepairActive || GENERAL_SOURCE_REPAIR_TOOL_NAMES.has(tool.name)
      )
      .filter((tool) => !sourceActionRequired || tool.activity === 'change')
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        activity: tool.activity,
        risk: tool.risk,
      }));
    return {
      session: this.snapshot(),
      tools,
      latestObservation,
      recentObservations: this.recentObservations.map((observation) => ({
        toolCallId: observation.toolCallId,
        toolName: observation.toolName,
        input: structuredClone(observation.input),
        result: observation.result,
      })),
      ...(this.generalSourceRepairActive && this.sourceRepairDirective
        ? { sourceRepairDirective: this.sourceRepairDirective }
        : {}),
      ...(sourceActionRequired ? { sourceActionRequired: true } : {}),
      steering: this.steering.splice(0),
    };
  }

  private rememberExhaustedTools(output: unknown): void {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return;
    }
    const exhausted = (output as Record<string, unknown>).exhaustedTools;
    if (!Array.isArray(exhausted)) {
      return;
    }
    for (const name of exhausted) {
      if (typeof name === 'string' && this.registry.get(name)) {
        this.exhaustedTools.add(name);
      }
    }
  }

  private async setStatus(status: StudioAgentSessionStatus): Promise<void> {
    this.state.status = status;
    await this.emit('session.status', { status });
  }

  private async emit<T>(
    type: StudioAgentEvent['type'],
    data: T,
    requestId?: string,
    toolCallId?: string,
    transientData?: T
  ): Promise<void> {
    const sequence = this.state.sequence + 1;
    const event = createStudioAgentEvent({
      sessionId: this.id,
      sequence,
      type,
      data,
      requestId,
      toolCallId,
      now: this.now,
    });
    this.state.sequence = sequence;
    this.state.updatedAt = event.timestamp;
    this.state.events.push(event as StudioAgentEvent);
    if (this.state.events.length > StudioAgentSession.MAX_IN_MEMORY_EVENTS) {
      this.state.events = this.state.events.slice(-StudioAgentSession.MAX_IN_MEMORY_EVENTS);
    }
    await this.store.save(this.snapshot());
    const listenerEvent =
      transientData === undefined
        ? event
        : ({ ...event, data: transientData } as StudioAgentEvent<T>);
    this.listeners.forEach((listener) => listener(listenerEvent as StudioAgentEvent));
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
