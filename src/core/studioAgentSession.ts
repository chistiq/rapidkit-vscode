import crypto from 'node:crypto';
import path from 'node:path';

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
import {
  isAutonomousWorkspaiAssistantMode,
  type WorkspaiAssistantMode,
} from './assistantModeContract.js';
import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';
import { selectStudioSourceRepairCandidates } from './studioRepairReceipt.js';

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
  'inspect-evidence',
  'search-workspace',
  'query-workspace-graph',
  'inspect-workspace-diagnostics',
  'run-workspace-command',
  'apply-workspace-patch',
  'apply-workspace-edits',
  'delete-workspace-files',
  'inspect-workspace-changes',
]);

const CAUSAL_SOURCE_INSPECTION_TOOL_NAMES = new Set([
  'discover-workspace-files',
  'inspect-source',
  'inspect-evidence',
  'search-workspace',
  'query-workspace-graph',
  'inspect-workspace-diagnostics',
]);

const GOVERNED_SOURCE_MUTATION_TOOL_NAMES = new Set([
  'apply-workspace-patch',
  'apply-workspace-edits',
  'delete-workspace-files',
]);

const CLI_REPAIR_MUTATION_TOOL_NAMES = new Set([
  'recover-active-blocker',
  'apply-workspace-patch',
  'apply-workspace-edits',
  'delete-workspace-files',
  'execute-remediation-step',
  // These aliases stay readable for older durable sessions, but successful
  // execution must still return the canonical CLI transaction receipt.
  'repair-dependency-security',
  'upgrade-dependency-security',
  'complete-dependency-transaction',
]);

function isAiProviderFailure(message: string): boolean {
  return /(request failed:|ai provider|provider request|fetch failed|network(?: error)?|econn(?:reset|refused)|etimedout|invalid_api_key|incorrect api key|could not reach the (?:configured )?ai provider)/i.test(
    message
  );
}

function durableRepairTransactionState(
  state: string | undefined
): 'closed' | 'rolled-back' | 'decision-required' | 'active' | undefined {
  if (state === 'closed' || state === 'rolled-back' || state === 'decision-required') {
    return state;
  }
  if (
    state === 'approved' ||
    state === 'checkpointed' ||
    state === 'executing' ||
    state === 'verifying' ||
    state === 'rollback-required' ||
    state === 'rolling-back' ||
    state === 'active'
  ) {
    return 'active';
  }
  return undefined;
}

function repairTransactionStateFromToolData(
  data: Record<string, unknown> | undefined
): ReturnType<typeof durableRepairTransactionState> {
  if (!data) {
    return undefined;
  }
  const toolName = data.toolName;
  if (typeof toolName === 'string' && !CLI_REPAIR_MUTATION_TOOL_NAMES.has(toolName)) {
    return undefined;
  }
  const output = data.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return undefined;
  }
  const transaction = (output as { transaction?: unknown }).transaction;
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
    return undefined;
  }
  const state = (transaction as { state?: unknown }).state;
  return typeof state === 'string' ? durableRepairTransactionState(state) : undefined;
}

function latestDurableRepairTransactionState(input: {
  latestObservation?: StudioAgentToolResult;
  events: StudioAgentEvent[];
}): ReturnType<typeof durableRepairTransactionState> {
  const fromObservation = repairTransactionStateFromToolData(
    input.latestObservation ? { output: input.latestObservation.output as unknown } : undefined
  );
  if (fromObservation) {
    return fromObservation;
  }
  for (let index = input.events.length - 1; index >= 0; index -= 1) {
    const event = input.events[index];
    if (event.type !== 'tool.completed' && event.type !== 'tool.failed') {
      continue;
    }
    const mapped = repairTransactionStateFromToolData(event.data);
    if (mapped) {
      return mapped;
    }
  }
  return undefined;
}

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

class StudioAgentTerminalError extends Error {
  readonly terminalReason: string;
  readonly requiresUserDecision = false;

  constructor(message: string, terminalReason: string) {
    super(message);
    this.name = 'StudioAgentTerminalError';
    this.terminalReason = terminalReason;
  }
}

function isRepairProtocolFailure(error: string): boolean {
  return /repair protocol handshake failed|unknown option ['"]--workspace['"]|incompatible result for workspace repair/i.test(
    error
  );
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
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

function shouldInspectGeneralSourceCandidates(
  toolName: string,
  result: StudioAgentToolResult
): boolean {
  if (!requestsGeneralSourceRepair(result) || toolOutputRecord(result)?.proposalRejected === true) {
    return false;
  }
  if (toolName === 'recover-active-blocker') {
    return true;
  }
  return (
    CLI_REPAIR_MUTATION_TOOL_NAMES.has(toolName) &&
    cliRepairTransactionState(result) === 'rolled-back'
  );
}

function requestsReviewDecision(result: StudioAgentToolResult): boolean {
  const output = toolOutputRecord(result);
  return output?.nextAction === 'review-required' && output?.requiresUserDecision === true;
}

type VerifiedCliRepairClosure = {
  transactionId: string;
  summary: string;
  workspaceResolved: boolean;
  remainingActionIds: string[];
};

/**
 * A closed CLI Repair Engine transaction is already the product's canonical
 * mutation + verification receipt. The extension must consume that verdict;
 * it must never start a second dependency transaction, intelligence chain, or
 * card verification pass that can contradict the CLI source of truth.
 */
function verifiedCliRepairClosure(
  result: StudioAgentToolResult
): VerifiedCliRepairClosure | undefined {
  const output = toolOutputRecord(result);
  const transaction =
    output?.transaction &&
    typeof output.transaction === 'object' &&
    !Array.isArray(output.transaction)
      ? (output.transaction as Record<string, unknown>)
      : undefined;
  const verification =
    transaction?.verification &&
    typeof transaction.verification === 'object' &&
    !Array.isArray(transaction.verification)
      ? (transaction.verification as Record<string, unknown>)
      : undefined;
  if (
    transaction?.state !== 'closed' ||
    verification?.status !== 'passed' ||
    verification?.targetStatus !== 'passed' ||
    typeof transaction.transactionId !== 'string'
  ) {
    return undefined;
  }
  return {
    transactionId: transaction.transactionId,
    summary:
      typeof verification.summary === 'string' && verification.summary.trim()
        ? verification.summary.trim()
        : 'The CLI Repair Engine closed the selected repair after canonical verification.',
    workspaceResolved: verification.workspaceStatus === 'passed',
    remainingActionIds: stringValues(verification.remainingActionIds),
  };
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

function cliRepairTransactionState(result: StudioAgentToolResult): string | undefined {
  const output = toolOutputRecord(result);
  const transaction =
    output?.transaction &&
    typeof output.transaction === 'object' &&
    !Array.isArray(output.transaction)
      ? (output.transaction as Record<string, unknown>)
      : undefined;
  return typeof transaction?.state === 'string' ? transaction.state : undefined;
}

type GeneralSourceRepairCommandViolation = {
  commandIdentity: string;
  message: string;
};

function generalSourceRepairCommandViolation(
  action: Extract<StudioAgentModelAction, { type: 'tool' }>
): GeneralSourceRepairCommandViolation | undefined {
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
    const commandIdentity = command.slice(0, 2).join(' ');
    return {
      commandIdentity,
      message:
        `The ${commandIdentity} evidence producer is locked during general source repair. ` +
        'Make a real source change or return a review-required result; the controller owns evidence refresh and verification.',
    };
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
  return selectStudioSourceRepairCandidates(
    candidates.filter((entry): entry is string => typeof entry === 'string'),
    12
  );
}

function durableEventValue(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[depth-limited]';
  }
  if (typeof value === 'string') {
    const redacted = redactLocalPathsForConsumer(value);
    return redacted.length > DURABLE_EVENT_STRING_LIMIT
      ? `${redacted.slice(0, DURABLE_EVENT_STRING_LIMIT)}…`
      : redacted;
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
      .filter(([key]) => !/^(?:fileChanges|diffLines)$/i.test(key))
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

function redactLiveEventValue(value: unknown, depth = 0): unknown {
  if (depth > 10) {
    return '[depth-limited]';
  }
  if (typeof value === 'string') {
    return redactLocalPathsForConsumer(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactLiveEventValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redactLiveEventValue(entry, depth + 1),
    ])
  );
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
    return redactLiveEventValue(result) as StudioAgentToolResult;
  }
  return redactLiveEventValue({
    ...result,
    output: { ...output, fileChanges },
  }) as StudioAgentToolResult;
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
  governedGoal?: NonNullable<StudioAgentPersistedSession['governedGoal']>;
  goal?: NonNullable<StudioAgentPersistedSession['goal']>;
  permissionLevel: StudioAgentPermissionLevel;
  workspaceTrusted: boolean;
  requiresVerifiedCompletion?: boolean;
  checkpointEvery?: number;
  maxTurns?: number;
  maxModelDecisionsWithoutSourceProgress?: number;
  /** Maximum exact Goal verification attempts from the immutable Goal Pack policy. */
  goalMaxAttempts?: number;
  /** Attempts already recorded by CLI verified-goal status before this session started. */
  goalAttemptsUsed?: number;
  repairPolicy?: 'diagnose-and-repair' | 'source-repair-then-produce' | 'refresh-producer';
  initialSourceRepairDirective?: Record<string, unknown>;
  restoredSession?: StudioAgentPersistedSession;
};

export function studioAgentSessionScopeMatches(
  session: Pick<StudioAgentPersistedSession, 'workspacePath' | 'projectPath'>,
  options: Pick<StudioAgentSessionOptions, 'workspacePath' | 'projectPath'>
): boolean {
  const normalize = (value: string | undefined): string | undefined =>
    value?.trim() ? path.resolve(value) : undefined;
  return (
    normalize(session.workspacePath) === normalize(options.workspacePath) &&
    normalize(session.projectPath) === normalize(options.projectPath)
  );
}

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
  private sourceActionRequired = false;
  private proposalRecoveryInspectionRequired = false;
  private latestActiveCardId: string;
  private latestEvidenceGeneration: string | undefined;
  private latestBlockerSignature: string | undefined;
  private goalVerificationAttempts = 0;
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
          ...(options.governedGoal ? { governedGoal: structuredClone(options.governedGoal) } : {}),
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
    if (options.governedGoal) {
      this.state.governedGoal = structuredClone(options.governedGoal);
    }
    if (options.restoredSession && options.selectedModelId) {
      this.state.selectedModelId = options.selectedModelId;
    }
    this.latestBlockerSignature =
      options.blockerSignature ?? options.restoredSession?.blockerSignature;
    this.latestActiveCardId = options.cardId;
    if (options.initialSourceRepairDirective) {
      this.generalSourceRepairActive = true;
      this.sourceRepairDirective = structuredClone(options.initialSourceRepairDirective);
    }
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
        if (toolOutputRecord(result)?.proposalRejected === true) {
          this.proposalRecoveryInspectionRequired = true;
          this.sourceActionRequired = true;
        }
      }
      if (event.type === 'verify.completed' && verifiedNonBlockingResult(data)) {
        this.generalSourceRepairActive = false;
        this.sourceRepairDirective = undefined;
        this.proposalRecoveryInspectionRequired = false;
        this.sourceActionRequired = false;
      }
      if (event.type === 'tool.started' && data?.toolName === 'verify-goal') {
        this.goalVerificationAttempts += 1;
      }
    }
    this.goalVerificationAttempts = Math.max(
      this.goalVerificationAttempts,
      Math.max(0, Math.trunc(options.goalAttemptsUsed ?? 0))
    );
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
        ...(this.state.governedGoal ? { governedGoal: this.state.governedGoal } : {}),
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
      isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
      this.options.restoredSession?.status === 'failed';
    const resumedProviderFailure =
      resumedFailedAgentSession &&
      [...(this.options.restoredSession?.events ?? [])]
        .reverse()
        .some(
          (event) =>
            event.type === 'session.failed' &&
            Boolean(
              event.data &&
              typeof event.data === 'object' &&
              !Array.isArray(event.data) &&
              (event.data as Record<string, unknown>).terminalReason === 'ai-provider-unavailable'
            )
        );
    let deterministicRecoveryPending =
      isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
      !this.isFreeFormAgentSession() &&
      this.options.repairPolicy !== 'refresh-producer' &&
      Boolean(this.registry.get('recover-active-blocker')) &&
      ((!resumedProviderFailure && resumedFailedAgentSession) ||
        (!this.generalSourceRepairActive &&
          !this.state.events.some((event) => {
            if (event.type !== 'tool.completed' && event.type !== 'tool.failed') {
              return false;
            }
            const data =
              event.data && typeof event.data === 'object' && !Array.isArray(event.data)
                ? (event.data as Record<string, unknown>)
                : undefined;
            return data?.toolName === 'recover-active-blocker';
          })));
    const producerRefreshToolName = this.verificationToolName();
    let deterministicSatisfiedGoalVerificationPending =
      this.state.goal?.baseline.status === 'satisfied' && Boolean(this.registry.get('verify-goal'));
    let deterministicProducerRefreshPending =
      isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
      this.options.repairPolicy === 'refresh-producer';
    try {
      if (deterministicProducerRefreshPending && !producerRefreshToolName) {
        throw new StudioAgentTerminalError(
          'This card is producer-owned, but no exact producer refresh tool is registered.',
          'producer-refresh-unavailable'
        );
      }
      while (!this.abortController.signal.aborted) {
        totalTurns += 1;
        const readOnlyTurnBudget =
          this.state.assistantMode === 'ask' || this.state.assistantMode === 'plan'
            ? 12
            : undefined;
        const maxTurns = this.options.maxTurns ?? readOnlyTurnBudget;
        // Read-only modes have a finite provider-credit boundary. Mutation
        // modes are durable and checkpointed, so only an explicit host/test
        // maxTurns boundary may hand an unresolved session back safely.
        if (maxTurns !== undefined && totalTurns > maxTurns) {
          throw new Error(
            this.state.assistantMode === 'ask' || this.state.assistantMode === 'plan'
              ? `${this.state.assistantMode === 'ask' ? 'Ask' : 'Plan'} stopped after ${maxTurns} bounded model decisions without a contract-compliant answer. Refine the request or inspect the durable session evidence.`
              : 'Assistant turn budget exhausted. The durable session can resume safely.'
          );
        }
        const modelDecisionLimit = this.options.maxModelDecisionsWithoutSourceProgress ?? 12;
        if (
          isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
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
          if (!this.generalSourceRepairActive) {
            this.generalSourceRepairActive = true;
            this.sourceRepairDirective = {
              nextAction: 'general-source-repair',
              recoveryPath: 'provider-circuit-breaker',
              cardId: this.latestActiveCardId,
              instruction:
                'The blocker remains verified. Diagnose and repair its causal source through the general workspace capability plane.',
            };
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Deterministic verification confirmed the blocker remains. Studio is widening the next model turn to governed source diagnosis instead of stopping.',
                recovery: 'provider-to-source-repair',
              },
              requestId
            );
            continue;
          }
          if (!this.sourceActionRequired) {
            this.sourceActionRequired = true;
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The diagnosis loop made no semantic progress. Studio is constraining the next turn to the causal source path instead of repeating evidence producers.',
                recovery: 'require-causal-source-action',
              },
              requestId
            );
            continue;
          }
          throw new StudioAgentTerminalError(
            `The model made ${modelDecisionLimit} additional decisions without a causal source change after deterministic verification and constrained recovery.`,
            'model-source-progress-exhausted'
          );
        }
        const action: StudioAgentModelAction = deterministicSatisfiedGoalVerificationPending
          ? {
              type: 'tool',
              toolName: 'verify-goal',
              input: {},
              reason:
                'Confirm the already-satisfied Goal baseline before authorizing any source mutation.',
            }
          : deterministicProducerRefreshPending
            ? {
                type: 'tool',
                toolName: producerRefreshToolName!,
                input: {},
                reason: 'Refresh the exact producer-owned card before spending a model decision.',
              }
            : deterministicRecoveryPending
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
        const satisfiedGoalVerificationWasDeterministic =
          deterministicSatisfiedGoalVerificationPending;
        const producerRefreshWasDeterministic = deterministicProducerRefreshPending;
        if (deterministicSatisfiedGoalVerificationPending) {
          deterministicSatisfiedGoalVerificationPending = false;
          await this.emit(
            'model.checkpoint',
            {
              summary:
                'The Goal baseline is already satisfied. Studio is confirming it with the exact CLI verifier before involving the model.',
              recovery: 'goal-satisfied-preflight',
            },
            requestId
          );
        } else if (deterministicProducerRefreshPending) {
          deterministicProducerRefreshPending = false;
          await this.emit(
            'model.checkpoint',
            {
              summary:
                'This card is producer-owned. Studio is refreshing its exact CLI producer before involving the model.',
              recovery: 'exact-producer-refresh',
            },
            requestId
          );
        } else if (deterministicRecoveryPending) {
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
          const isFreeFormClarification =
            this.isFreeFormAgentSession() && !this.hasMutated() && this.steering.length === 0;
          if (isFreeFormClarification) {
            await this.emit('model.message', { text: action.text, clarification: true }, requestId);
            const waitStart = Date.now();
            const steeringBefore = this.steering.length;
            while (
              this.steering.length === steeringBefore &&
              !this.abortController.signal.aborted &&
              Date.now() - waitStart < 120_000
            ) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            if (this.abortController.signal.aborted) {
              break;
            }
            latestObservation = {
              ok: true,
              output: {
                userResponse: this.steering[this.steering.length - 1],
                instruction:
                  'The user answered your clarification. Proceed with the selected scope.',
              },
            };
          } else {
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
          }
        } else if (action.type === 'complete') {
          consecutiveProtocolMisses = 0;
          const completionPolicyViolation = this.completionPolicyViolation(
            requestId,
            action.summary
          );
          if (completionPolicyViolation) {
            latestObservation = { ok: false, error: completionPolicyViolation };
            await this.emit(
              'model.checkpoint',
              { summary: completionPolicyViolation, recovery: 'completion-contract' },
              requestId
            );
            continue;
          }
          if (
            this.options.requiresVerifiedCompletion === false ||
            (this.hasVerifiedCompletion(requestId) &&
              this.hasGeneralTaskAcceptanceReview(requestId))
          ) {
            await this.emit(
              'session.completed',
              {
                summary: action.summary,
                verificationAuthority: 'workspai-cli',
                acceptanceReview:
                  this.state.assistantMode === 'goal' && this.usesEvidenceReviewCompletion()
                    ? 'agent-reviewed-outcome-and-final-worktree'
                    : this.state.cardId.startsWith('assistant:')
                      ? 'final-worktree-inspected'
                      : 'exact-card-contract',
                ...(this.state.governedGoal
                  ? {
                      goalId: this.state.governedGoal.id,
                      goalCompletionMode: this.state.governedGoal.completionMode,
                    }
                  : {}),
              },
              requestId
            );
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
                  this.state.assistantMode === 'goal' && this.usesEvidenceReviewCompletion()
                    ? 'The model requested completion. Studio is running canonical workspace verification before accepting the evidence-reviewed outcome.'
                    : 'The model requested completion. Studio is running the exact card verification contract before accepting it.',
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
              this.hasCanonicalChainClosure(requestId) &&
              this.hasGeneralTaskAcceptanceReview(requestId)
            ) {
              await this.emit(
                'session.completed',
                {
                  summary: action.summary,
                  verificationAuthority: 'workspai-cli',
                  acceptanceReview:
                    this.state.assistantMode === 'goal' && this.usesEvidenceReviewCompletion()
                      ? 'agent-reviewed-outcome-and-final-worktree'
                      : this.state.cardId.startsWith('assistant:')
                        ? 'final-worktree-inspected'
                        : 'exact-card-contract',
                  ...(this.state.governedGoal
                    ? {
                        goalId: this.state.governedGoal.id,
                        goalCompletionMode: this.state.governedGoal.completionMode,
                      }
                    : {}),
                },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
            latestObservation = {
              ...latestObservation,
              ok: false,
              error:
                latestObservation.error ??
                (this.usesEvidenceReviewCompletion() &&
                !this.hasGeneralTaskAcceptanceReview(requestId)
                  ? 'Completion rejected: inspect the final workspace changes after the closed repair transaction before claiming the user request is complete.'
                  : 'Completion rejected: exact card verification still reports a blocker.'),
            };
          }
        } else {
          consecutiveProtocolMisses = 0;
          const causalEpochBeforeTool = this.causalEpoch;
          const blockerSignatureBeforeAction = this.latestBlockerSignature;
          const activeCardBeforeAction = this.latestActiveCardId;
          const effectiveAction = action;
          latestObservation = await this.executeTool(effectiveAction, requestId);
          if (
            satisfiedGoalVerificationWasDeterministic &&
            latestObservation.ok === true &&
            latestObservation.cardBlocking === false
          ) {
            await this.emit(
              'session.completed',
              {
                summary: 'Goal verified by the CLI; no source change was required.',
                goalId: this.state.goal?.id,
                goalStatus: toolOutputRecord(latestObservation)?.status,
                verificationAuthority: 'workspai-cli',
              },
              requestId
            );
            await this.setStatus('completed');
            return this.snapshot();
          }
          if (producerRefreshWasDeterministic) {
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              await this.emit(
                'session.completed',
                {
                  summary:
                    'The exact CLI producer refreshed successfully and the producer-owned card is no longer blocking.',
                },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
            this.generalSourceRepairActive = true;
            this.sourceRepairDirective = {
              nextAction: 'general-source-repair',
              recoveryPath: 'diagnose-causal-source',
              cardId: this.latestActiveCardId,
              producerRefresh: 'completed-but-blocking',
              observation:
                latestObservation.error ??
                'The exact CLI producer completed but the card remains blocked.',
              instruction:
                'Diagnose the causal source defect, inspect the smallest relevant source and evidence set, apply a governed source transaction when warranted, and let the CLI Repair Engine verify closure.',
            };
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The exact producer refreshed and the card is still blocked. Studio is transferring the fresh observation to the general source-repair capability plane.',
                recovery: 'producer-to-source-repair',
                cardId: this.latestActiveCardId,
              },
              requestId
            );
            continue;
          }
          const cliClosure = verifiedCliRepairClosure(latestObservation);
          if (cliClosure) {
            if (this.state.goal) {
              const verificationToolName = this.verificationToolName();
              if (verificationToolName !== 'verify-goal') {
                throw new StudioAgentTerminalError(
                  'The CLI repair transaction closed, but the Goal verifier is unavailable.',
                  'goal-verification-unavailable'
                );
              }
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    'The source repair closed safely. Studio is now measuring the exact Goal criteria before accepting completion.',
                  recovery: 'goal-post-repair-verification',
                  transactionId: cliClosure.transactionId,
                },
                requestId
              );
              latestObservation = await this.executeTool(
                {
                  type: 'tool',
                  toolName: 'verify-goal',
                  input: {},
                  reason:
                    'Measure the immutable Goal criteria after the closed source repair transaction.',
                },
                requestId
              );
              if (
                latestObservation.ok === true &&
                latestObservation.cardBlocking === false &&
                this.hasCanonicalChainClosure(requestId)
              ) {
                const status = toolOutputRecord(latestObservation)?.status as
                  | Record<string, unknown>
                  | undefined;
                const progress =
                  status?.progress &&
                  typeof status.progress === 'object' &&
                  !Array.isArray(status.progress)
                    ? (status.progress as Record<string, unknown>)
                    : undefined;
                const current = progress?.value;
                const target = progress?.target ?? this.state.goal.baseline.target;
                const measurement =
                  typeof current === 'number'
                    ? ` Current: ${current}${progress?.unit === 'percent' ? '%' : ''}${typeof target === 'number' ? `; target: ${target}${progress?.unit === 'percent' ? '%' : ''}.` : '.'}`
                    : '';
                await this.emit(
                  'session.completed',
                  {
                    summary: `Goal verified by the CLI.${measurement}`,
                    transactionId: cliClosure.transactionId,
                    goalId: this.state.goal.id,
                    goalStatus: status,
                    workspaceResolved: cliClosure.workspaceResolved,
                    remainingActionIds: cliClosure.remainingActionIds,
                  },
                  requestId
                );
                await this.setStatus('completed');
                return this.snapshot();
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error:
                  latestObservation.error ??
                  'The source repair closed, but the immutable Goal criteria remain unsatisfied.',
              };
            } else if (this.usesEvidenceReviewCompletion()) {
              latestObservation = {
                ...latestObservation,
                output: {
                  ...(toolOutputRecord(latestObservation) ?? {}),
                  mutationReceipt: {
                    transactionId: cliClosure.transactionId,
                    sourceRepairClosed: true,
                    workspaceResolved: cliClosure.workspaceResolved,
                    remainingActionIds: cliClosure.remainingActionIds,
                  },
                },
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    this.state.assistantMode === 'goal'
                      ? 'The source repair is safely closed. Review it against the complete Goal objective and inspect the final change, then request completion so Studio can verify workspace safety without claiming that an arbitrary semantic outcome was machine-proven.'
                      : 'The source repair is safely closed. Review the result against the user request, inspect the final change when needed, then request completion so Studio can run the final workspace verifier.',
                  recovery:
                    this.state.assistantMode === 'goal'
                      ? 'general-goal-acceptance'
                      : 'general-task-acceptance',
                  transactionId: cliClosure.transactionId,
                },
                requestId
              );
            } else {
              const output = toolOutputRecord(latestObservation) ?? {};
              await this.emit(
                'verify.completed',
                {
                  ...latestObservation,
                  ok: true,
                  cardBlocking: false,
                  output: {
                    ...output,
                    closureAuthority: 'cli-repair-engine',
                    cardVerification: {
                      cardId: this.latestActiveCardId,
                      resolved: true,
                      blocking: false,
                    },
                    workspaceVerification: {
                      resolved: cliClosure.workspaceResolved,
                      blocking: !cliClosure.workspaceResolved,
                      remainingActionIds: cliClosure.remainingActionIds,
                    },
                  },
                },
                requestId
              );
              await this.emit(
                'session.completed',
                {
                  summary: cliClosure.summary,
                  transactionId: cliClosure.transactionId,
                  workspaceResolved: cliClosure.workspaceResolved,
                  remainingActionIds: cliClosure.remainingActionIds,
                },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
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
              latestObservation.terminalReason ??
                toolOutputRecord(latestObservation)?.terminalReason ??
                'review-required'
            );
            const decisionMetadata = reviewDecisionMetadata(latestObservation);
            throw new StudioAgentReviewRequiredError(
              latestObservation.error ??
                'No compatible non-breaking remediation is currently available. Studio requires an explicit engineering decision before continuing.',
              terminalReason,
              decisionMetadata
            );
          }
          if (latestObservation.terminalReason && latestObservation.requiresUserDecision !== true) {
            throw new StudioAgentTerminalError(
              latestObservation.error ??
                'Studio stopped because its CLI repair protocol is unavailable.',
              latestObservation.terminalReason
            );
          }
          const observationOutput = toolOutputRecord(latestObservation);
          if (
            latestObservation.changed === true &&
            effectiveAction.toolName !== 'run-governed-command' &&
            effectiveAction.toolName !== 'verify-blocker' &&
            effectiveAction.toolName !== 'verify-goal'
          ) {
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            this.sourceActionRequired = false;
            this.proposalRecoveryInspectionRequired = false;
          }
          if (
            isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
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
            isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
            shouldInspectGeneralSourceCandidates(effectiveAction.toolName, latestObservation) &&
            sourceCandidates.length > 0 &&
            this.registry.get('inspect-source')
          ) {
            const recoveredFromAccelerator = effectiveAction.toolName === 'recover-active-blocker';
            await this.emit(
              'model.checkpoint',
              {
                summary: recoveredFromAccelerator
                  ? 'Blocker accelerators delegated to source repair. Studio is loading the exact causal manifests before spending a model decision.'
                  : 'CLI restored the previous source. Studio is loading remaining source candidates before spending a model decision.',
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
                reason: recoveredFromAccelerator
                  ? 'Authorize and inspect the exact source candidates returned by blocker recovery.'
                  : 'Inspect remaining source candidates after the CLI transaction was restored.',
              },
              requestId
            );
          }
          if (this.causalEpoch > causalEpochBeforeTool) {
            causalRecoveryAttempts = 0;
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            consecutiveCausalRejections = 0;
          }
          const activeBlockerAdvanced =
            latestObservation.cardBlocking === true &&
            ((Boolean(latestObservation.blockerSignature) &&
              latestObservation.blockerSignature !== blockerSignatureBeforeAction) ||
              this.latestActiveCardId !== activeCardBeforeAction);
          if (
            activeBlockerAdvanced &&
            isAutonomousWorkspaiAssistantMode(this.state.assistantMode) &&
            this.registry.get('recover-active-blocker')
          ) {
            this.generalSourceRepairActive = false;
            this.sourceRepairDirective = undefined;
            this.sourceActionRequired = false;
            this.proposalRecoveryInspectionRequired = false;
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
            const remediation = await this.recoverGoalFromCurrentRemediationPlan(requestId);
            if (remediation) {
              latestObservation = remediation;
              const remediationClosure = verifiedCliRepairClosure(remediation);
              if (remediationClosure && this.state.goal && this.registry.get('verify-goal')) {
                await this.emit(
                  'model.checkpoint',
                  {
                    summary:
                      'The Goal prerequisite repair closed safely. Studio is measuring the immutable Goal criteria before returning control to the model.',
                    recovery: 'goal-post-prerequisite-verification',
                    transactionId: remediationClosure.transactionId,
                  },
                  requestId
                );
                latestObservation = await this.executeTool(
                  {
                    type: 'tool',
                    toolName: 'verify-goal',
                    input: {},
                    reason:
                      'Measure the immutable Goal criteria after the closed prerequisite repair.',
                  },
                  requestId
                );
                if (
                  latestObservation.ok === true &&
                  latestObservation.cardBlocking === false &&
                  this.hasCanonicalChainClosure(requestId)
                ) {
                  await this.emit(
                    'session.completed',
                    {
                      summary: 'Goal verified by the CLI after its prerequisite repair.',
                      transactionId: remediationClosure.transactionId,
                      goalId: this.state.goal.id,
                      goalStatus: toolOutputRecord(latestObservation)?.status,
                      workspaceResolved: remediationClosure.workspaceResolved,
                      remainingActionIds: remediationClosure.remainingActionIds,
                    },
                    requestId
                  );
                  await this.setStatus('completed');
                  return this.snapshot();
                }
              }
              causalRecoveryAttempts = 0;
              consecutiveCausalRejections = 0;
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              continue;
            }
            if (causalRecoveryAttempts >= 2) {
              throw new StudioAgentTerminalError(
                'Deterministic verification and two constrained causal recoveries produced no new source or blocker evidence.',
                'causal-source-progress-exhausted'
              );
            }
            if (causalRecoveryAttempts >= 1) {
              this.generalSourceRepairActive = true;
              this.sourceRepairDirective = {
                ...(this.sourceRepairDirective ?? {}),
                nextAction: 'general-source-repair',
                recoveryPath: 'causal-source-action-required',
                cardId: this.latestActiveCardId,
                instruction:
                  'Reuse prior observations and advance to an inspected source mutation. Do not repeat the same producer or diagnostic.',
              };
              this.sourceActionRequired = true;
              causalRecoveryAttempts += 1;
              consecutiveCausalRejections = 0;
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    'Verification produced no new evidence. Studio is keeping the session active and constraining the next turn to a causal source action.',
                  recovery: 'causal-source-escalation',
                },
                requestId
              );
              continue;
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
      const providerFailure = isAiProviderFailure(message);
      const repairTransactionState = latestDurableRepairTransactionState({
        latestObservation,
        events: this.state.events,
      });
      await this.emit(
        'session.failed',
        {
          error: message,
          ...(providerFailure ? { terminalReason: 'ai-provider-unavailable' } : {}),
          ...(repairTransactionState ? { repairTransactionState } : {}),
          ...(error instanceof StudioAgentReviewRequiredError ||
          error instanceof StudioAgentTerminalError
            ? {
                terminalReason: error.terminalReason,
                requiresUserDecision: error.requiresUserDecision,
                ...(error instanceof StudioAgentReviewRequiredError && error.transactionId
                  ? { transactionId: error.transactionId }
                  : {}),
                ...(error instanceof StudioAgentReviewRequiredError &&
                error.decisionOptions.length > 0
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

  /**
   * A governed Goal must not fail merely because the model repeated an
   * evidence producer. Before giving up, the controller refreshes the
   * contract-authored remediation plan and executes the first bounded action
   * that is both dependency-ready and accepted by the CLI Repair Engine.
   *
   * This fallback is intentionally Goal-only: incident repair already owns a
   * dedicated recover-active-blocker prelude. It also stays disabled during a
   * general source-repair epoch, where producer refresh is causally forbidden
   * until a real source transaction occurs.
   */
  private async recoverGoalFromCurrentRemediationPlan(
    requestId: string
  ): Promise<StudioAgentToolResult | undefined> {
    if (
      this.state.assistantMode !== 'goal' ||
      this.generalSourceRepairActive ||
      !this.registry.get('inspect-remediation-plan') ||
      !this.registry.get('execute-remediation-step')
    ) {
      return undefined;
    }

    const governedProducer = this.registry.get('run-governed-command');
    const refreshRemediationPlan = async (reason: string): Promise<void> => {
      if (!governedProducer) {
        return;
      }
      await this.emit(
        'model.checkpoint',
        {
          summary:
            'Goal verification made no causal progress. Studio is refreshing the project-scoped CLI remediation contract before asking the model again.',
          recovery: 'goal-remediation-plan-refresh',
        },
        requestId
      );
      await this.executeTool(
        {
          type: 'tool',
          toolName: 'run-governed-command',
          input: { commandId: 'workspaceRemediationPlan' },
          reason,
        },
        requestId
      );
    };

    await refreshRemediationPlan(
      'Refresh the contract-authored remediation plan for the active Goal scope.'
    );

    let inspected = await this.executeTool(
      {
        type: 'tool',
        toolName: 'inspect-remediation-plan',
        input: {},
        reason: 'Select the next bounded CLI remediation action for the active Goal.',
      },
      requestId
    );
    const inspectedOutput = toolOutputRecord(inspected);
    const freshness = inspectedOutput?.freshness;
    const stalePlan =
      !inspected.ok &&
      freshness !== null &&
      typeof freshness === 'object' &&
      !Array.isArray(freshness) &&
      (freshness as Record<string, unknown>).verdict === 'stale';
    if (stalePlan && governedProducer) {
      // A stale verdict is itself proof that canonical evidence advanced after
      // the first plan was produced. Move deterministic recovery into a new
      // causal epoch so the duplicate-tool guard permits exactly one rebuild;
      // arbitrary model retries remain bounded by the normal guard.
      this.causalEpoch += 1;
      this.exhaustedTools.clear();
      await this.emit(
        'model.checkpoint',
        {
          summary:
            'Goal evidence advanced while the repair plan was being selected. Studio is rebuilding the plan once from the newest canonical evidence.',
          recovery: 'goal-remediation-plan-stale-retry',
        },
        requestId
      );
      await refreshRemediationPlan(
        'Rebuild the remediation plan after its source evidence advanced.'
      );
      inspected = await this.executeTool(
        {
          type: 'tool',
          toolName: 'inspect-remediation-plan',
          input: {},
          reason: 'Inspect the rebuilt Goal remediation plan against current evidence.',
        },
        requestId
      );
    }
    if (!inspected.ok) {
      return undefined;
    }
    const steps = toolOutputRecord(inspected)?.steps;
    if (!Array.isArray(steps)) {
      return undefined;
    }
    const currentIds = new Set(
      steps
        .map((entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry as Record<string, unknown>).id
            : undefined
        )
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    );
    const eligible = steps
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
      )
      .filter((step) => {
        const dependencies = Array.isArray(step.dependsOn)
          ? step.dependsOn.filter((entry): entry is string => typeof entry === 'string')
          : [];
        return (
          typeof step.id === 'string' &&
          step.risk !== 'invasive' &&
          (step.studioState === 'ready' || step.studioState === 'review-required') &&
          (step.canApply === true || step.executable === true) &&
          dependencies.every((dependency) => !currentIds.has(dependency))
        );
      })
      .sort(
        (left, right) =>
          Number(left.order ?? Number.MAX_SAFE_INTEGER) -
          Number(right.order ?? Number.MAX_SAFE_INTEGER)
      )[0];
    if (!eligible || typeof eligible.id !== 'string') {
      return undefined;
    }

    await this.emit(
      'model.checkpoint',
      {
        summary:
          'The refreshed CLI plan contains a bounded action. Studio is executing it through the Repair Engine and will continue the Goal afterward.',
        recovery: 'goal-remediation-step',
        stepId: eligible.id,
      },
      requestId
    );
    const execution = await this.executeTool(
      {
        type: 'tool',
        toolName: 'execute-remediation-step',
        input: { stepId: eligible.id },
        reason: 'Execute the next dependency-ready remediation action for the active Goal.',
      },
      requestId
    );
    return execution.ok || execution.changed === true ? execution : undefined;
  }

  private async executeTool(
    action: Extract<StudioAgentModelAction, { type: 'tool' }>,
    requestId: string
  ): Promise<StudioAgentToolResult> {
    if (action.toolName === 'verify-goal') {
      const maxAttempts = this.options.goalMaxAttempts ?? 5;
      if (this.goalVerificationAttempts >= maxAttempts) {
        const result: StudioAgentToolResult = {
          ok: false,
          cardBlocking: true,
          error: `Goal verification reached its immutable attempt budget (${maxAttempts}). Review the latest evidence before starting another governed Goal run.`,
          requiresUserDecision: true,
          terminalReason: 'goal-attempt-budget-exhausted',
          output: {
            attempts: this.goalVerificationAttempts,
            maxAttempts,
            nextAction: 'review-required',
            requiresUserDecision: true,
          },
        };
        await this.emit('tool.failed', result, requestId, action.callId?.trim());
        return result;
      }
      this.goalVerificationAttempts += 1;
    }
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
      const rejectionKey = `${this.causalEpoch}:source-repair-policy:${phaseViolation.commandIdentity}`;
      const priorRejections = this.toolAttemptsByEpoch.get(rejectionKey) ?? 0;
      this.toolAttemptsByEpoch.set(rejectionKey, priorRejections + 1);
      const repeated = priorRejections >= 1;
      if (repeated) {
        this.sourceActionRequired = true;
      }
      const result: StudioAgentToolResult = repeated
        ? {
            ok: false,
            error: `${phaseViolation.message} The duplicate producer request was rejected without stopping the session. Continue with a causal source action.`,
            requiresUserDecision: false,
            output: {
              nextAction: 'causal-source-change-required',
              requiresUserDecision: false,
              recoveryPath: 'general-source-repair',
            },
          }
        : { ok: false, error: phaseViolation.message };
      await this.emit(
        'tool.failed',
        {
          toolName: tool.name,
          input: durableInput,
          policyRejected: true,
          repeatedPolicyRejection: repeated,
          ...result,
        },
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
      const message = error instanceof Error ? error.message : String(error);
      result = isRepairProtocolFailure(message)
        ? {
            ok: false,
            error: message,
            terminalReason: 'cli-repair-contract-mismatch',
            requiresUserDecision: false,
          }
        : { ok: false, error: message };
    }
    if (
      result.changed === true &&
      CLI_REPAIR_MUTATION_TOOL_NAMES.has(tool.name) &&
      !verifiedCliRepairClosure(result)
    ) {
      const transactionState = cliRepairTransactionState(result);
      if (transactionState) {
        result = {
          ...result,
          ok: false,
          ...(transactionState === 'rolled-back' ? { changed: false } : {}),
        };
      } else {
        result = {
          ...result,
          ok: false,
          error:
            'A Studio mutation returned without a closed CLI Repair Engine transaction. The result was rejected before Studio could report a successful change.',
          terminalReason: 'cli-repair-closure-missing',
          requiresUserDecision: false,
        };
      }
    }
    const transactionState = cliRepairTransactionState(result);
    const proposalRejected = toolOutputRecord(result)?.proposalRejected === true;
    const rolledBackOrRejected = transactionState === 'rolled-back' || proposalRejected === true;
    const evidenceAdvanced =
      Boolean(result.changed) ||
      rolledBackOrRejected ||
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
    if (result.changed === true || rolledBackOrRejected) {
      this.exhaustedTools.clear();
      this.sourceActionRequired = false;
      if (result.changed === true) {
        this.proposalRecoveryInspectionRequired = false;
      }
    }
    this.rememberExhaustedTools(result.output);
    if (requestsGeneralSourceRepair(result)) {
      this.generalSourceRepairActive = true;
      this.sourceRepairDirective = toolOutputRecord(result);
      if (toolOutputRecord(result)?.proposalRejected === true) {
        this.proposalRecoveryInspectionRequired = true;
        this.sourceActionRequired = true;
      }
    }
    if (
      this.proposalRecoveryInspectionRequired &&
      tool.name === 'inspect-source' &&
      result.ok === true
    ) {
      this.proposalRecoveryInspectionRequired = false;
      this.sourceActionRequired = true;
    }
    if (tool.activity === 'verify' && result.ok === true && result.cardBlocking === false) {
      this.generalSourceRepairActive = false;
      this.sourceRepairDirective = undefined;
      this.sourceActionRequired = false;
      this.proposalRecoveryInspectionRequired = false;
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
    if ((this.state.governedGoal || this.state.goal) && this.registry.get('verify-goal')) {
      return 'verify-goal';
    }
    return this.registry.get('verify-blocker') ? 'verify-blocker' : undefined;
  }

  private completionPolicyViolation(requestId: string, summary: string): string | undefined {
    if (this.state.assistantMode === 'ask' || this.state.assistantMode === 'plan') {
      const inspected = this.state.events.some((event) => {
        if (event.requestId !== requestId || event.type !== 'tool.completed') {
          return false;
        }
        const toolName = String((event.data as Record<string, unknown>).toolName ?? '');
        return [
          'inspect-source',
          'inspect-evidence',
          'query-workspace-graph',
          'search-workspace',
          'inspect-workspace-diagnostics',
          'inspect-workspace-changes',
        ].includes(toolName);
      });
      if (!inspected) {
        return `${this.state.assistantMode === 'ask' ? 'Ask' : 'Plan'} completion rejected: inspect relevant workspace source or governed evidence before answering.`;
      }
    }
    if (this.state.assistantMode === 'plan') {
      const missing = [
        'scope',
        'evidence',
        'steps',
        'verification',
        'rollback',
        'assumptions',
      ].filter((section) => !new RegExp(`(?:^|\\n)#{0,3}\\s*${section}\\b`, 'i').test(summary));
      if (missing.length > 0) {
        return `Plan completion rejected: the concise implementation plan is missing ${missing.join(', ')}.`;
      }
    }
    return undefined;
  }

  private hasGeneralTaskAcceptanceReview(requestId: string): boolean {
    if (!this.usesEvidenceReviewCompletion()) {
      return true;
    }
    const requestEvents = this.state.events.filter((event) => event.requestId === requestId);
    const latestMutation = [...requestEvents].reverse().find((event) => {
      if (event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as StudioAgentToolResult & { toolName?: string };
      return data.changed === true && verifiedCliRepairClosure(data) !== undefined;
    });
    if (!latestMutation) {
      return true;
    }
    return requestEvents.some((event) => {
      if (event.sequence <= latestMutation.sequence || event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as Record<string, unknown>;
      return data.toolName === 'inspect-workspace-changes' && data.ok === true;
    });
  }

  private usesEvidenceReviewCompletion(): boolean {
    return (
      (this.state.assistantMode === 'agent' && this.state.cardId.startsWith('assistant:')) ||
      (this.state.assistantMode === 'goal' &&
        this.state.governedGoal?.completionMode === 'evidence-review')
    );
  }

  private isFreeFormAgentSession(): boolean {
    return (
      this.state.assistantMode === 'agent' &&
      this.state.cardId.startsWith('assistant:') &&
      !this.state.goal &&
      !this.state.governedGoal
    );
  }

  private hasMutated(): boolean {
    return this.state.events.some((event) => {
      if (event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as Record<string, unknown>;
      return GOVERNED_SOURCE_MUTATION_TOOL_NAMES.has(String(data.toolName ?? ''));
    });
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

    if (verifiedCliRepairClosure(latestSourceMutation.data as StudioAgentToolResult)) {
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
    const mustTakeSourceAction = sourceActionRequired || this.sourceActionRequired;
    const hasInspectedSource = this.recentObservations.some(
      (observation) => observation.toolName === 'inspect-source' && observation.result.ok === true
    );
    const tools = this.registry
      .list()
      .filter((tool) => !this.exhaustedTools.has(tool.name))
      .filter(
        (tool) => !this.generalSourceRepairActive || GENERAL_SOURCE_REPAIR_TOOL_NAMES.has(tool.name)
      )
      .filter(
        (tool) =>
          !mustTakeSourceAction ||
          (this.proposalRecoveryInspectionRequired
            ? CAUSAL_SOURCE_INSPECTION_TOOL_NAMES.has(tool.name)
            : hasInspectedSource
              ? GOVERNED_SOURCE_MUTATION_TOOL_NAMES.has(tool.name)
              : CAUSAL_SOURCE_INSPECTION_TOOL_NAMES.has(tool.name))
      )
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
      ...(mustTakeSourceAction ? { sourceActionRequired: true } : {}),
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
