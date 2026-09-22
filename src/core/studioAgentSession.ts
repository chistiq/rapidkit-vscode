import crypto from 'node:crypto';
import path from 'node:path';

import {
  createStudioAgentEvent,
  type StudioAgentCompletionObligations,
  type StudioAgentEvent,
  type StudioAgentModelResolution,
  type StudioAgentPersistedSession,
  type StudioAgentRequiredCausalAction,
  type StudioAgentSessionStatus,
  type StudioAgentTaskLedger,
} from './studioAgentEvents.js';
import type { AssistantExecutionPolicy } from './assistantExecutionPolicy.js';
import {
  resolveStudioAgentToolPermission,
  type StudioAgentToolApprovalDecision,
  type StudioAgentToolApprovalDescriptor,
  type StudioAgentToolApprovalGrant,
  type StudioAgentToolApprovalRequest,
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
  | { type: 'input'; question: string; reason: string }
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
  requiredCausalAction?: StudioAgentRequiredCausalAction;
  pendingEffectVerificationScopes?: string[];
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
  consumeResolution?(): StudioAgentModelResolution | undefined;
}

export interface StudioAgentSessionStore {
  save(session: StudioAgentPersistedSession): Promise<void>;
  load?(sessionId: string): Promise<StudioAgentPersistedSession | undefined>;
}

const DURABLE_EVENT_STRING_LIMIT = 2_000;
const DURABLE_EVENT_ARRAY_LIMIT = 50;
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

function requiredCausalActionFromResult(
  result: StudioAgentToolResult
): StudioAgentRequiredCausalAction | undefined {
  const output = toolOutputRecord(result);
  const candidate =
    output?.requiredAction &&
    typeof output.requiredAction === 'object' &&
    !Array.isArray(output.requiredAction)
      ? (output.requiredAction as Record<string, unknown>)
      : undefined;
  const rawInput =
    candidate?.input && typeof candidate.input === 'object' && !Array.isArray(candidate.input)
      ? (candidate.input as Record<string, unknown>)
      : undefined;
  const stepId = typeof rawInput?.stepId === 'string' ? rawInput.stepId.trim() : '';
  const executionKind =
    candidate?.executionKind === 'structured-operation' ||
    candidate?.executionKind === 'contract-command'
      ? candidate.executionKind
      : undefined;
  if (
    candidate?.schemaVersion !== 'workspai.studio-required-causal-action.v1' ||
    candidate.authority !== 'workspai-cli-remediation-plan' ||
    candidate.toolName !== 'execute-remediation-step' ||
    !stepId ||
    !executionKind
  ) {
    return undefined;
  }
  return {
    schemaVersion: 'workspai.studio-required-causal-action.v1',
    authority: 'workspai-cli-remediation-plan',
    toolName: 'execute-remediation-step',
    input: { stepId },
    stepId,
    executionKind,
    requiresApproval: candidate.requiresApproval === true,
    reason:
      typeof candidate.reason === 'string' && candidate.reason.trim()
        ? candidate.reason.trim()
        : 'Execute the exact fresh CLI remediation action selected for the active blocker.',
    ...(result.evidenceGeneration ? { evidenceGeneration: result.evidenceGeneration } : {}),
    ...(result.blockerSignature ? { blockerSignature: result.blockerSignature } : {}),
  };
}

function matchesRequiredCausalAction(
  action: StudioAgentModelAction,
  required: StudioAgentRequiredCausalAction
): action is Extract<StudioAgentModelAction, { type: 'tool' }> {
  if (action.type !== 'tool' || action.toolName !== required.toolName) {
    return false;
  }
  const input =
    action.input && typeof action.input === 'object' && !Array.isArray(action.input)
      ? (action.input as Record<string, unknown>)
      : undefined;
  return input?.stepId === required.stepId && Object.keys(input).every((key) => key === 'stepId');
}

function requiredCausalActionApproval(
  action: StudioAgentRequiredCausalAction,
  projectScoped: boolean
): StudioAgentToolApprovalDescriptor {
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      canonicalJson({
        authority: action.authority,
        toolName: action.toolName,
        stepId: action.stepId,
        executionKind: action.executionKind,
        evidenceGeneration: action.evidenceGeneration ?? null,
        blockerSignature: action.blockerSignature ?? null,
      })
    )
    .digest('hex');
  return {
    fingerprint,
    title: 'Approve governed remediation action?',
    summary:
      'Workspai selected one immutable action from the fresh CLI remediation contract. The model cannot alter its step identity or command payload.',
    displayCommand: `Workspai remediation action: ${action.stepId}`,
    scope: projectScoped ? 'project' : 'workspace',
    reasons: [
      action.reason,
      `Execution kind: ${action.executionKind}`,
      ...(action.evidenceGeneration ? [`Evidence generation: ${action.evidenceGeneration}`] : []),
    ],
    execution: 'once',
    allowedExecutions: ['once'],
  };
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
    output?.schemaVersion === 'workspai.studio-task-ledger.v1' ||
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
    // Evidence generation identifies a physical producer run, not semantic
    // progress. Re-running the same producer may legitimately write a new
    // timestamp/fingerprint while leaving the exact blocker unchanged. If the
    // generation were part of this identity, an agent could alternate Verify
    // and discovery forever while the causal-loop breaker kept resetting.
    blockerSignature: result.blockerSignature,
    cardBlocking: result.cardBlocking,
    nextAction: output?.nextAction,
    sourceCandidates: output?.sourceCandidates,
    upgradeCandidates: output?.upgradeCandidates,
    taskLedger: output?.schemaVersion === 'workspai.studio-task-ledger.v1' ? output : undefined,
  });
}

export type StudioAgentSessionOptions = {
  id?: string;
  workspacePath: string;
  projectPath?: string;
  cardId: string;
  assistantMode: WorkspaiAssistantMode;
  executionPolicy?: AssistantExecutionPolicy;
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
  requestToolApproval?(
    request: StudioAgentToolApprovalRequest
  ): Promise<StudioAgentToolApprovalDecision>;
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
  private pendingInputResolve: (() => void) | undefined;
  private lastIdenticalToolSignature: string | undefined;
  private consecutiveIdenticalToolAttempts = 0;
  private readonly exhaustedTools = new Set<string>();
  private readonly pendingEffectVerificationScopes = new Set<string>();
  private causalEpoch = 0;
  private generalSourceRepairActive = false;
  private sourceRepairDirective: Record<string, unknown> | undefined;
  private sourceActionRequired = false;
  /** One-turn openings of the full tool plane after a no-progress dead end. */
  private unverifiedContinuationNudges = 0;
  private freedomPlaneActive = false;
  private skipProgressBreakerOnce = false;
  private providerRequestsThisAttempt = 0;
  private tokensThisAttempt = 0;
  private static readonly MAX_UNVERIFIED_CONTINUATION_NUDGES = 3;
  private static readonly MAX_IDENTICAL_TOOL_ATTEMPTS_PER_CAUSAL_STATE = 3;
  private static readonly AUTONOMOUS_MODEL_TURN_BUDGET = 96;
  private static readonly AUTONOMOUS_PROVIDER_REQUEST_BUDGET = 120;
  private static readonly AUTONOMOUS_TOKEN_BUDGET = 1_000_000;
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
          ...(options.executionPolicy
            ? { executionPolicy: structuredClone(options.executionPolicy) }
            : {}),
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
    if (options.executionPolicy) {
      this.state.executionPolicy = structuredClone(options.executionPolicy);
    }
    this.latestBlockerSignature =
      options.blockerSignature ?? options.restoredSession?.blockerSignature;
    this.latestActiveCardId = options.cardId;
    for (const scope of options.restoredSession?.pendingEffectVerificationScopes ?? []) {
      if (scope.trim()) {
        this.pendingEffectVerificationScopes.add(scope.trim());
      }
    }
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
      if (
        (event.type === 'tool.completed' || event.type === 'tool.failed') &&
        data?.toolName === 'run-workspace-command'
      ) {
        this.rememberWorkspaceCommandEffectVerification(data as StudioAgentToolResult);
      }
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
    this.rebuildCompletionObligationsIfNeeded();
    this.rebuildTaskLedgerFromEvents();
  }

  get id(): string {
    return this.state.id;
  }

  snapshot(): StudioAgentPersistedSession {
    return structuredClone(this.state);
  }

  private budgetLedger(): NonNullable<StudioAgentPersistedSession['budgetLedger']> {
    if (!this.state.budgetLedger) {
      this.state.budgetLedger = {
        schemaVersion: 'workspai.studio-budget-ledger.v1',
        attemptsStarted: 0,
        totalModelDecisions: 0,
        totalProviderRequests: 0,
        totalToolExecutions: 0,
        totalProtocolMisses: 0,
        totalContinuationNudges: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedTokenMeasurements: 0,
        lastAttemptStartedAt: this.now().toISOString(),
      };
    }
    this.state.budgetLedger.totalInputTokens ??= 0;
    this.state.budgetLedger.totalOutputTokens ??= 0;
    this.state.budgetLedger.estimatedTokenMeasurements ??= 0;
    return this.state.budgetLedger;
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
    this.pendingInputResolve?.();
    this.pendingInputResolve = undefined;
    void this.emit('request.steered', { message: normalized });
  }

  cancel(): void {
    this.abortController.abort();
    this.pendingInputResolve?.();
    this.pendingInputResolve = undefined;
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
    const executionMode = this.executionMode();
    const budgetLedger = this.budgetLedger();
    budgetLedger.attemptsStarted += 1;
    budgetLedger.lastAttemptStartedAt = this.now().toISOString();
    this.providerRequestsThisAttempt = 0;
    this.tokensThisAttempt = 0;
    await this.setStatus('running');
    await this.emit(
      'request.started',
      {
        request,
        assistantMode: this.state.assistantMode,
        executionPolicy: this.state.executionPolicy,
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
      isAutonomousWorkspaiAssistantMode(executionMode) &&
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
      isAutonomousWorkspaiAssistantMode(executionMode) &&
      !this.state.pendingRequiredCausalAction &&
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
      isAutonomousWorkspaiAssistantMode(executionMode) &&
      this.options.repairPolicy === 'refresh-producer';
    try {
      if (
        this.state.pendingRequiredCausalAction &&
        !this.registry.get(this.state.pendingRequiredCausalAction.toolName)
      ) {
        throw new StudioAgentTerminalError(
          'The durable session requires an exact CLI remediation action, but its native Studio tool is unavailable.',
          'required-causal-tool-unavailable'
        );
      }
      if (deterministicProducerRefreshPending && !producerRefreshToolName) {
        throw new StudioAgentTerminalError(
          'This card is producer-owned, but no exact producer refresh tool is registered.',
          'producer-refresh-unavailable'
        );
      }
      while (!this.abortController.signal.aborted) {
        if (
          isAutonomousWorkspaiAssistantMode(executionMode) &&
          (this.providerRequestsThisAttempt >=
            StudioAgentSession.AUTONOMOUS_PROVIDER_REQUEST_BUDGET ||
            this.tokensThisAttempt >= StudioAgentSession.AUTONOMOUS_TOKEN_BUDGET)
        ) {
          throw new StudioAgentTerminalError(
            'Verification is still open. Studio paused at the bounded provider request/token budget. Resume continues the same durable session with a fresh attempt; nothing was marked complete.',
            'model-causal-progress-exhausted'
          );
        }
        totalTurns += 1;
        const readOnlyTurnBudget =
          executionMode === 'ask' || executionMode === 'plan' ? 12 : undefined;
        const autonomousTurnBudget = isAutonomousWorkspaiAssistantMode(executionMode)
          ? StudioAgentSession.AUTONOMOUS_MODEL_TURN_BUDGET
          : undefined;
        const maxTurns = this.options.maxTurns ?? readOnlyTurnBudget ?? autonomousTurnBudget;
        // Read-only modes have a finite provider-credit boundary. Mutation
        // modes keep a separate hard turn budget so a live repair cannot spend
        // without a user continuation. An explicit host/test maxTurns still wins.
        if (maxTurns !== undefined && totalTurns > maxTurns) {
          if (
            isAutonomousWorkspaiAssistantMode(executionMode) &&
            this.options.maxTurns === undefined
          ) {
            throw new StudioAgentTerminalError(
              'Verification is still open. Studio paused this attempt so it would not keep spending tokens. Resume continues the same session with another bounded attempt. Nothing was marked complete.',
              'model-causal-progress-exhausted'
            );
          }
          throw new Error(
            executionMode === 'ask' || executionMode === 'plan'
              ? `${executionMode === 'ask' ? 'Ask' : 'Plan'} stopped after ${maxTurns} bounded model decisions without a contract-compliant answer. Refine the request or inspect the durable session evidence.`
              : 'Assistant turn budget exhausted. The durable session can resume safely.'
          );
        }
        const modelDecisionLimit = this.options.maxModelDecisionsWithoutSourceProgress ?? 12;
        if (this.skipProgressBreakerOnce) {
          this.skipProgressBreakerOnce = false;
        } else if (
          isAutonomousWorkspaiAssistantMode(executionMode) &&
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
              const completion = await this.completeSessionIfAllowed({
                requestId,
                summary: 'Deterministic verification confirmed that the blocker is resolved.',
              });
              if (completion.completed) {
                return completion.session;
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error: completion.blocker.reason,
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary: completion.blocker.reason,
                  recovery: 'completion-contract',
                  blocker: completion.blocker.kind,
                },
                requestId
              );
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              continue;
            }
          }
          if (!this.generalSourceRepairActive) {
            this.generalSourceRepairActive = true;
            this.sourceRepairDirective = {
              nextAction: 'general-source-repair',
              recoveryPath: 'provider-circuit-breaker',
              cardId: this.latestActiveCardId,
              instruction:
                'The blocker remains verified. Use the general workspace capability plane to identify and execute the next evidence-backed causal action.',
            };
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Deterministic verification confirmed the blocker remains. Studio is widening the next model turn to the governed causal capability plane instead of stopping.',
                recovery: 'provider-to-causal-recovery',
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
                  'The diagnosis loop made no semantic progress. Studio is requiring a new causal action while preserving every governed capability.',
                recovery: 'require-causal-action',
              },
              requestId
            );
            continue;
          }
          if (await this.beginUnverifiedContinuationNudge(requestId)) {
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            continue;
          }
          this.pauseUnverifiedContinuation();
        }
        const deterministicRequiredCausalAction = this.state.pendingRequiredCausalAction;
        const modelContextForTurn =
          deterministicSatisfiedGoalVerificationPending ||
          deterministicProducerRefreshPending ||
          deterministicRecoveryPending ||
          deterministicRequiredCausalAction
            ? undefined
            : this.modelContext(
                latestObservation,
                this.generalSourceRepairActive &&
                  consecutiveModelDecisionsWithoutSemanticProgress >=
                    Math.min(4, Math.max(1, modelDecisionLimit - 1))
              );
        const action: StudioAgentModelAction | undefined = deterministicRequiredCausalAction
          ? {
              type: 'tool',
              toolName: deterministicRequiredCausalAction.toolName,
              input: structuredClone(deterministicRequiredCausalAction.input),
              reason:
                'Execute the exact CLI-authored remediation action without spending another model decision.',
            }
          : deterministicSatisfiedGoalVerificationPending
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
                : await this.nextModelAction(modelContextForTurn!, requestId);
        if (!action) {
          break;
        }
        const satisfiedGoalVerificationWasDeterministic =
          deterministicSatisfiedGoalVerificationPending;
        const producerRefreshWasDeterministic = deterministicProducerRefreshPending;
        if (deterministicRequiredCausalAction) {
          await this.emit(
            'model.checkpoint',
            {
              summary:
                'Studio is executing the exact CLI-authored remediation action without asking the model to restate it.',
              recovery: 'required-causal-action-execution',
              requiredAction: deterministicRequiredCausalAction,
            },
            requestId
          );
        } else if (deterministicSatisfiedGoalVerificationPending) {
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
          this.budgetLedger().totalModelDecisions += 1;
        }
        turnsSinceCheckpoint += 1;
        const pendingRequiredAction = this.state.pendingRequiredCausalAction;
        if (
          modelContextForTurn &&
          !pendingRequiredAction &&
          action.type === 'tool' &&
          !modelContextForTurn.tools.some((tool) => tool.name === action.toolName)
        ) {
          latestObservation = {
            ok: false,
            error:
              `${action.toolName} is not available in the current governed capability set. ` +
              'Choose one of the tools supplied for this turn.',
          };
          await this.emit(
            'model.checkpoint',
            {
              summary: latestObservation.error,
              recovery: 'unavailable-tool-rejected',
              toolName: action.toolName,
            },
            requestId
          );
          continue;
        }
        if (
          modelContextForTurn &&
          pendingRequiredAction &&
          !matchesRequiredCausalAction(action, pendingRequiredAction)
        ) {
          latestObservation = {
            ok: false,
            evidenceGeneration: pendingRequiredAction.evidenceGeneration,
            blockerSignature: pendingRequiredAction.blockerSignature,
            error:
              `The fresh CLI remediation contract requires ${pendingRequiredAction.toolName} ` +
              `with stepId=${pendingRequiredAction.stepId}. Inspection, completion, and alternate mutations are unavailable until this exact action is executed or rejected by its policy boundary.`,
          };
          await this.emit(
            'model.checkpoint',
            {
              summary: latestObservation.error,
              recovery: 'required-causal-action-enforced',
              requiredAction: pendingRequiredAction,
            },
            requestId
          );
          continue;
        }
        if (action.type === 'input') {
          if (!isAutonomousWorkspaiAssistantMode(executionMode) || this.hasMutated()) {
            latestObservation = {
              ok: false,
              error:
                'User input can only be requested before mutation in Agent or Goal mode. Continue with the available evidence or complete the governed verification path.',
            };
            continue;
          }
          await this.emit(
            'model.message',
            {
              text: action.question,
              clarification: true,
              inputRequired: true,
              reason: action.reason,
            },
            requestId
          );
          const steeringBefore = this.steering.length;
          await this.setStatus('waiting-input');
          if (this.steering.length === steeringBefore && !this.abortController.signal.aborted) {
            await new Promise<void>((resolve) => {
              this.pendingInputResolve = resolve;
              if (this.steering.length !== steeringBefore || this.abortController.signal.aborted) {
                this.pendingInputResolve = undefined;
                resolve();
              }
            });
          }
          if (this.abortController.signal.aborted) {
            break;
          }
          await this.setStatus('running');
          latestObservation = {
            ok: true,
            output: {
              userResponse: this.steering[this.steering.length - 1],
              instruction:
                'The user answered your structured clarification. Proceed within the selected scope and mode contract.',
            },
          };
        } else if (action.type === 'message') {
          consecutiveProtocolMisses += 1;
          this.budgetLedger().totalProtocolMisses += 1;
          await this.emit('model.message', { text: action.text, protocolMiss: true }, requestId);
          if (consecutiveProtocolMisses >= 3) {
            throw new StudioAgentTerminalError(
              'Selected model did not produce a valid native Studio tool call after 3 attempts. Switch to a tool-capable model, then resume this session. The task was not marked complete.',
              'model-tool-protocol-exhausted'
            );
          }
          latestObservation = {
            ok: false,
            error:
              'The session is still active. Select a governed tool, request user input through the structured input action, or complete only after the mode contract is satisfied.',
          };
        } else if (action.type === 'complete') {
          consecutiveProtocolMisses = 0;
          const completionData = {
            verificationAuthority: isAutonomousWorkspaiAssistantMode(executionMode)
              ? 'workspai-cli'
              : 'workspace-evidence',
            acceptanceReview:
              executionMode === 'goal' && this.usesEvidenceReviewCompletion()
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
          };
          let completion = await this.completeSessionIfAllowed({
            requestId,
            summary: action.summary,
            data: completionData,
          });
          if (completion.completed) {
            return completion.session;
          }
          if (
            completion.blocker.kind === 'verification' ||
            completion.blocker.kind === 'fresh-verification'
          ) {
            const verificationToolName = this.verificationToolName();
            if (!verificationToolName) {
              latestObservation = {
                ok: false,
                error:
                  'Completion rejected: no canonical verification tool is registered for this session.',
              };
              continue;
            }
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  executionMode === 'goal' && this.usesEvidenceReviewCompletion()
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
            completion = await this.completeSessionIfAllowed({
              requestId,
              summary: action.summary,
              data: completionData,
            });
            if (completion.completed) {
              return completion.session;
            }
          }
          latestObservation = {
            ...(latestObservation ?? {}),
            ok: false,
            error: latestObservation?.error ?? completion.blocker.reason,
          };
          await this.emit(
            'model.checkpoint',
            {
              summary: completion.blocker.reason,
              recovery: 'completion-contract',
              blocker: completion.blocker.kind,
            },
            requestId
          );
        } else {
          consecutiveProtocolMisses = 0;
          const causalEpochBeforeTool = this.causalEpoch;
          const blockerSignatureBeforeAction = this.latestBlockerSignature;
          const activeCardBeforeAction = this.latestActiveCardId;
          const effectiveAction = action;
          const causalRecoveryWasActive = this.generalSourceRepairActive;
          const requiredActionBeforeExecution = this.state.pendingRequiredCausalAction;
          latestObservation = await this.executeTool(effectiveAction, requestId);
          if (effectiveAction.toolName === 'recover-active-blocker') {
            const requiredAction = requiredCausalActionFromResult(latestObservation);
            if (requiredAction) {
              this.state.pendingRequiredCausalAction = requiredAction;
              this.generalSourceRepairActive = false;
              this.sourceRepairDirective = undefined;
              this.sourceActionRequired = false;
              this.proposalRecoveryInspectionRequired = false;
              this.exhaustedTools.delete(requiredAction.toolName);
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              consecutiveCausalRejections = 0;
              causalRecoveryAttempts = 0;
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    'Fresh CLI evidence selected one exact remediation action. Studio is handing that bounded action to the model without reopening diagnosis.',
                  recovery: 'required-causal-action-ready',
                  requiredAction,
                },
                requestId
              );
              continue;
            }
          }
          if (
            requiredActionBeforeExecution &&
            matchesRequiredCausalAction(effectiveAction, requiredActionBeforeExecution)
          ) {
            if (latestObservation.ok !== true) {
              if (latestObservation.requiresUserDecision === true) {
                throw new StudioAgentReviewRequiredError(
                  latestObservation.error ??
                    'The exact CLI remediation action requires an explicit user decision before Studio can continue.',
                  latestObservation.terminalReason ?? 'required-causal-action-review'
                );
              }
              delete this.state.pendingRequiredCausalAction;
              this.generalSourceRepairActive = true;
              this.sourceRepairDirective = {
                nextAction: 'general-source-repair',
                recoveryPath: 'required-remediation-action-failed',
                failedRequiredAction: requiredActionBeforeExecution,
                observation:
                  latestObservation.error ??
                  'The exact CLI remediation action did not close successfully.',
                instruction:
                  'The exact action was attempted once and did not close. Use its transaction and failure evidence to choose a materially different governed capability. Do not retry the same step in this causal generation.',
              };
              this.sourceActionRequired = false;
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    'The exact CLI remediation action did not close. Studio is widening the next turn to the governed capability plane with the failure evidence attached.',
                  recovery: 'required-causal-action-fallback',
                  requiredAction: requiredActionBeforeExecution,
                  error: latestObservation.error,
                },
                requestId
              );
            } else {
              delete this.state.pendingRequiredCausalAction;
            }
          }
          if (
            satisfiedGoalVerificationWasDeterministic &&
            latestObservation.ok === true &&
            latestObservation.cardBlocking === false
          ) {
            const completion = await this.completeSessionIfAllowed({
              requestId,
              summary: 'Goal verified by the CLI; no source change was required.',
              data: {
                goalId: this.state.goal?.id,
                goalStatus: toolOutputRecord(latestObservation)?.status,
                verificationAuthority: 'workspai-cli',
              },
            });
            if (completion.completed) {
              return completion.session;
            }
            latestObservation = {
              ...latestObservation,
              ok: false,
              error: completion.blocker.reason,
            };
            await this.emit(
              'model.checkpoint',
              {
                summary: completion.blocker.reason,
                recovery: 'completion-contract',
                blocker: completion.blocker.kind,
              },
              requestId
            );
            continue;
          }
          if (producerRefreshWasDeterministic) {
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              const completion = await this.completeSessionIfAllowed({
                requestId,
                summary:
                  'The exact CLI producer refreshed successfully and the producer-owned card is no longer blocking.',
              });
              if (completion.completed) {
                return completion.session;
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error: completion.blocker.reason,
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary: completion.blocker.reason,
                  recovery: 'completion-contract',
                  blocker: completion.blocker.kind,
                },
                requestId
              );
              continue;
            }
            this.generalSourceRepairActive = true;
            this.sourceRepairDirective = {
              nextAction: 'general-source-repair',
              recoveryPath: 'diagnose-causal-blocker',
              cardId: this.latestActiveCardId,
              producerRefresh: 'completed-but-blocking',
              observation:
                latestObservation.error ??
                'The exact CLI producer completed but the card remains blocked.',
              instruction:
                'Diagnose the causal defect from fresh evidence. Select the smallest applicable governed capability: refresh the owning producer, execute an exact remediation step, run a structured project-native command, or submit a source transaction, then verify closure.',
            };
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The exact producer refreshed and the card is still blocked. Studio is transferring the fresh observation to the general causal capability plane.',
                recovery: 'producer-to-causal-recovery',
                cardId: this.latestActiveCardId,
              },
              requestId
            );
            continue;
          }
          const workspaceCommandOutput = toolOutputRecord(latestObservation);
          if (
            causalRecoveryWasActive &&
            effectiveAction.toolName === 'run-workspace-command' &&
            latestObservation.ok === true &&
            ['build', 'test'].includes(String(workspaceCommandOutput?.purpose ?? ''))
          ) {
            const verificationToolName = this.verificationToolName();
            if (!verificationToolName) {
              throw new StudioAgentTerminalError(
                'A causal project command completed, but the exact card verifier is unavailable.',
                'causal-command-verification-unavailable'
              );
            }
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The model completed a causal project build/test action without changing source. Studio is running the exact card verifier before accepting progress.',
                recovery: 'causal-command-verification',
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: verificationToolName,
                input: {},
                reason: 'Verify the blocker after the guarded causal project command.',
              },
              requestId
            );
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              const completion = await this.completeSessionIfAllowed({
                requestId,
                summary:
                  'The model-selected project command completed and canonical verification confirmed the blocker is resolved.',
                data: {
                  verificationAuthority: 'workspai-cli',
                  causalCapability: 'run-workspace-command',
                },
              });
              if (completion.completed) {
                return completion.session;
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error: completion.blocker.reason,
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary: completion.blocker.reason,
                  recovery: 'completion-contract',
                  blocker: completion.blocker.kind,
                },
                requestId
              );
            }
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
              if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
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
                const completion = await this.completeSessionIfAllowed({
                  requestId,
                  summary: `Goal verified by the CLI.${measurement}`,
                  data: {
                    transactionId: cliClosure.transactionId,
                    goalId: this.state.goal.id,
                    goalStatus: status,
                    workspaceResolved: cliClosure.workspaceResolved,
                    remainingActionIds: cliClosure.remainingActionIds,
                  },
                });
                if (completion.completed) {
                  return completion.session;
                }
                latestObservation = {
                  ...latestObservation,
                  ok: false,
                  error: completion.blocker.reason,
                };
                await this.emit(
                  'model.checkpoint',
                  {
                    summary: completion.blocker.reason,
                    recovery: 'completion-contract',
                    blocker: completion.blocker.kind,
                  },
                  requestId
                );
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error:
                  latestObservation.error ??
                  'The source repair closed, but the immutable Goal criteria remain unsatisfied.',
              };
            } else if (
              latestObservation.cardBlocking === true &&
              toolOutputRecord(latestObservation)?.nextAction === 'next-causal-target'
            ) {
              deterministicRecoveryPending = true;
              this.generalSourceRepairActive = false;
              this.sourceRepairDirective = undefined;
              this.sourceActionRequired = false;
              this.proposalRecoveryInspectionRequired = false;
              this.exhaustedTools.clear();
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              consecutiveCausalRejections = 0;
              causalRecoveryAttempts = 0;
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    'The selected causal target passed. Studio is continuing with the next blocking finding on the same aggregate card.',
                  recovery: 'next-causal-target',
                  transactionId: cliClosure.transactionId,
                  blockerSignature: latestObservation.blockerSignature,
                },
                requestId
              );
              continue;
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
                    executionMode === 'goal'
                      ? 'The source repair is safely closed. Review it against the complete Goal objective and inspect the final change, then request completion so Studio can verify workspace safety without claiming that an arbitrary semantic outcome was machine-proven.'
                      : 'The source repair is safely closed. Review the result against the user request, inspect the final change when needed, then request completion so Studio can run the final workspace verifier.',
                  recovery:
                    executionMode === 'goal'
                      ? 'general-goal-acceptance'
                      : 'general-task-acceptance',
                  transactionId: cliClosure.transactionId,
                },
                requestId
              );
            } else {
              const output = toolOutputRecord(latestObservation) ?? {};
              const verificationResult: StudioAgentToolResult = {
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
              };
              this.rememberVerificationCompletion(verificationResult, this.state.sequence + 1);
              await this.emit('verify.completed', verificationResult, requestId);
              const completion = await this.completeSessionIfAllowed({
                requestId,
                summary: cliClosure.summary,
                data: {
                  transactionId: cliClosure.transactionId,
                  workspaceResolved: cliClosure.workspaceResolved,
                  remainingActionIds: cliClosure.remainingActionIds,
                },
              });
              if (completion.completed) {
                return completion.session;
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error: completion.blocker.reason,
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary: completion.blocker.reason,
                  recovery: 'completion-contract',
                  blocker: completion.blocker.kind,
                },
                requestId
              );
            }
          }
          const initialProgressFingerprint = semanticProgressFingerprint(
            effectiveAction,
            latestObservation
          );
          if (initialProgressFingerprint && !semanticProgress.has(initialProgressFingerprint)) {
            semanticProgress.add(initialProgressFingerprint);
            consecutiveModelDecisionsWithoutSemanticProgress = 0;
            this.noteProductiveContinuation();
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
            this.noteProductiveContinuation();
          }
          if (this.freedomPlaneActive && consecutiveModelDecisionsWithoutSemanticProgress > 0) {
            consecutiveModelDecisionsWithoutSemanticProgress = modelDecisionLimit;
          }
          if (
            isAutonomousWorkspaiAssistantMode(executionMode) &&
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
              const completion = await this.completeSessionIfAllowed({
                requestId,
                summary: 'Deterministic verification confirmed that the blocker is resolved.',
              });
              if (completion.completed) {
                return completion.session;
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error: completion.blocker.reason,
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary: completion.blocker.reason,
                  recovery: 'completion-contract',
                  blocker: completion.blocker.kind,
                },
                requestId
              );
            }
          }
          const sourceCandidates = sourceRepairInspectionCandidates(latestObservation);
          if (
            isAutonomousWorkspaiAssistantMode(executionMode) &&
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
            isAutonomousWorkspaiAssistantMode(executionMode) &&
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
            /already produced|already ran|same semantic|unchanged generation|repeated the same input|without a causal state transition/i.test(
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
                if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
                  const completion = await this.completeSessionIfAllowed({
                    requestId,
                    summary: 'Goal verified by the CLI after its prerequisite repair.',
                    data: {
                      transactionId: remediationClosure.transactionId,
                      goalId: this.state.goal.id,
                      goalStatus: toolOutputRecord(latestObservation)?.status,
                      workspaceResolved: remediationClosure.workspaceResolved,
                      remainingActionIds: remediationClosure.remainingActionIds,
                    },
                  });
                  if (completion.completed) {
                    return completion.session;
                  }
                  latestObservation = {
                    ...latestObservation,
                    ok: false,
                    error: completion.blocker.reason,
                  };
                  await this.emit(
                    'model.checkpoint',
                    {
                      summary: completion.blocker.reason,
                      recovery: 'completion-contract',
                      blocker: completion.blocker.kind,
                    },
                    requestId
                  );
                }
              }
              causalRecoveryAttempts = 0;
              consecutiveCausalRejections = 0;
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              continue;
            }
            if (causalRecoveryAttempts >= 2) {
              if (await this.beginUnverifiedContinuationNudge(requestId)) {
                consecutiveCausalRejections = 0;
                causalRecoveryAttempts = 0;
                consecutiveModelDecisionsWithoutSemanticProgress = 0;
                continue;
              }
              this.pauseUnverifiedContinuation();
            }
            if (causalRecoveryAttempts >= 1) {
              this.generalSourceRepairActive = true;
              this.sourceRepairDirective = {
                ...(this.sourceRepairDirective ?? {}),
                nextAction: 'general-source-repair',
                recoveryPath: 'causal-action-required',
                cardId: this.latestActiveCardId,
                instruction:
                  'Reuse prior observations and advance through a materially different governed capability. Do not repeat the same producer, diagnostic, command, remediation step, or source proposal.',
              };
              this.sourceActionRequired = true;
              causalRecoveryAttempts += 1;
              consecutiveCausalRejections = 0;
              consecutiveModelDecisionsWithoutSemanticProgress = 0;
              await this.emit(
                'model.checkpoint',
                {
                  summary:
                    'Verification produced no new evidence. Studio is keeping the session active and requiring a materially different causal action.',
                  recovery: 'causal-action-escalation',
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
              const completion = await this.completeSessionIfAllowed({
                requestId,
                summary: 'Deterministic verification confirmed that the blocker is resolved.',
              });
              if (completion.completed) {
                return completion.session;
              }
              latestObservation = {
                ...latestObservation,
                ok: false,
                error: completion.blocker.reason,
              };
              await this.emit(
                'model.checkpoint',
                {
                  summary: completion.blocker.reason,
                  recovery: 'completion-contract',
                  blocker: completion.blocker.kind,
                },
                requestId
              );
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
      const terminalObservationOutput = latestObservation
        ? toolOutputRecord(latestObservation)
        : undefined;
      const missingExecutable =
        typeof terminalObservationOutput?.missingExecutable === 'string' &&
        terminalObservationOutput.missingExecutable.trim()
          ? terminalObservationOutput.missingExecutable.trim()
          : undefined;
      const repairTransactionState = latestDurableRepairTransactionState({
        latestObservation,
        events: this.state.events,
      });
      await this.emit(
        'session.failed',
        {
          error: message,
          ...(providerFailure ? { terminalReason: 'ai-provider-unavailable' } : {}),
          ...(missingExecutable ? { missingExecutable } : {}),
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
   * Release the session immediately when the user cancels even when a provider
   * transport cannot consume an AbortSignal. Promise.race attaches rejection
   * handling to the provider promise, so a late provider failure is contained
   * and cannot rewrite the already-cancelled durable session.
   */
  private async nextModelAction(
    context: StudioAgentModelContext,
    requestId: string
  ): Promise<StudioAgentModelAction | undefined> {
    if (this.abortController.signal.aborted) {
      return undefined;
    }
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<undefined>((resolve) => {
      onAbort = () => resolve(undefined);
      this.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const action = await Promise.race([this.model.next(context), cancelled]);
      if (!action) {
        return undefined;
      }
      const resolution = this.model.consumeResolution?.();
      if (resolution) {
        const providerRequests = Math.max(1, Math.trunc(resolution.attempts));
        const inputTokens = Math.max(0, Math.trunc(resolution.inputTokens ?? 0));
        const outputTokens = Math.max(0, Math.trunc(resolution.outputTokens ?? 0));
        const budgetLedger = this.budgetLedger();
        this.providerRequestsThisAttempt += providerRequests;
        this.tokensThisAttempt += inputTokens + outputTokens;
        budgetLedger.totalProviderRequests += providerRequests;
        budgetLedger.totalInputTokens += inputTokens;
        budgetLedger.totalOutputTokens += outputTokens;
        if (resolution.tokenUsageSource === 'estimated') {
          budgetLedger.estimatedTokenMeasurements += 1;
        }
        const resolvedAt = this.now().toISOString();
        this.state.lastResolvedModel = { ...resolution, resolvedAt };
        await this.emit(
          'model.resolved',
          {
            ...resolution,
            resolvedAt,
            selectedModelId: this.state.selectedModelId,
          },
          requestId
        );
      }
      return action;
    } finally {
      if (onAbort) {
        this.abortController.signal.removeEventListener('abort', onAbort);
      }
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
   * general causal-recovery epoch, where duplicate observations are bounded
   * until a real source transaction occurs.
   */
  private async recoverGoalFromCurrentRemediationPlan(
    requestId: string
  ): Promise<StudioAgentToolResult | undefined> {
    if (
      this.executionMode() !== 'goal' ||
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
      this.lastIdenticalToolSignature = undefined;
      this.consecutiveIdenticalToolAttempts = 0;
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
    if (this.exhaustedTools.has(tool.name)) {
      const result = {
        ok: false,
        evidenceGeneration: this.latestEvidenceGeneration,
        blockerSignature: this.latestBlockerSignature,
        error:
          `${tool.name} is exhausted for the current causal generation. ` +
          'Use a different workspace capability until source, generated state, or blocker evidence materially changes.',
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
    if (this.lastIdenticalToolSignature !== toolAttemptKey) {
      this.lastIdenticalToolSignature = toolAttemptKey;
      this.consecutiveIdenticalToolAttempts = 0;
    }
    const maxAttemptsWithoutProgress =
      StudioAgentSession.MAX_IDENTICAL_TOOL_ATTEMPTS_PER_CAUSAL_STATE;
    if (this.consecutiveIdenticalToolAttempts >= maxAttemptsWithoutProgress) {
      const result = {
        ok: false,
        evidenceGeneration: this.latestEvidenceGeneration,
        blockerSignature: this.latestBlockerSignature,
        error:
          `${tool.name} repeated the same input ${this.consecutiveIdenticalToolAttempts} times without a causal state transition. ` +
          'Reuse the prior results, choose a materially different capability, or change source, environment, or blocker evidence before retrying.',
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
    const authorizationContext: Omit<StudioAgentToolContext, 'approval' | 'reportProgress'> = {
      sessionId: this.id,
      requestId,
      toolCallId,
      workspacePath: this.options.workspacePath,
      ...(this.options.projectPath ? { projectPath: this.options.projectPath } : {}),
      signal: this.abortController.signal,
    };
    let authorization;
    try {
      authorization = tool.authorize
        ? await tool.authorize(action.input, authorizationContext)
        : { risk: tool.risk };
    } catch (error) {
      const result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      await this.emit(
        'tool.failed',
        { toolName: tool.name, input: durableInput, authorizationRejected: true, ...result },
        requestId,
        toolCallId
      );
      return result;
    }
    const requiredCausalAction = this.state.pendingRequiredCausalAction;
    const exactRequiredAction =
      requiredCausalAction && matchesRequiredCausalAction(action, requiredCausalAction)
        ? requiredCausalAction
        : undefined;
    if (exactRequiredAction?.requiresApproval) {
      authorization = {
        ...authorization,
        approval: requiredCausalActionApproval(
          exactRequiredAction,
          Boolean(this.options.projectPath)
        ),
      };
    }
    const policyPermission = resolveStudioAgentToolPermission({
      level: this.options.permissionLevel,
      risk: authorization.risk,
      workspaceTrusted: this.options.workspaceTrusted,
    });
    const permission = exactRequiredAction?.requiresApproval
      ? {
          allowed: false,
          reason:
            'The fresh CLI remediation contract requires explicit approval for this exact action.',
          requiresUserConfirmation: true,
        }
      : policyPermission;
    await this.emit(
      'tool.permission',
      {
        toolName: tool.name,
        risk: authorization.risk,
        escalationAvailable: Boolean(
          permission.requiresUserConfirmation &&
          authorization.approval &&
          this.options.requestToolApproval
        ),
        ...permission,
      },
      requestId,
      toolCallId
    );
    let approval: StudioAgentToolApprovalGrant | undefined;
    if (!permission.allowed) {
      const descriptor = authorization.approval;
      if (
        !permission.requiresUserConfirmation ||
        !descriptor ||
        !this.options.requestToolApproval
      ) {
        const approvalBoundaryIncomplete = permission.requiresUserConfirmation;
        const result = {
          ok: false,
          error: approvalBoundaryIncomplete
            ? !descriptor
              ? 'The operation requires confirmation, but no immutable approval descriptor was produced.'
              : 'The operation requires confirmation, but this Studio host cannot present an approval decision.'
            : permission.reason,
          ...(approvalBoundaryIncomplete
            ? {
                requiresUserDecision: true,
                terminalReason: !descriptor
                  ? 'approval-contract-missing'
                  : 'approval-ui-unavailable',
              }
            : {}),
        };
        await this.emit('tool.failed', { toolName: tool.name, ...result }, requestId, toolCallId);
        return result;
      }
      const approvalRequest: StudioAgentToolApprovalRequest = {
        ...descriptor,
        sessionId: this.id,
        requestId,
        toolCallId,
        toolName: tool.name,
        modelReason: action.reason,
      };
      await this.emit(
        'tool.approval.requested',
        durableEventValue(approvalRequest) as Record<string, unknown>,
        requestId,
        toolCallId
      );
      await this.setStatus('waiting-permission');
      let decision: StudioAgentToolApprovalDecision;
      try {
        decision = await this.options.requestToolApproval(approvalRequest);
      } catch (error) {
        decision = {
          approved: false,
          fingerprint: descriptor.fingerprint,
          approvedBy: `approval-error:${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (!this.abortController.signal.aborted) {
        await this.setStatus('running');
      }
      const exactApproval = decision.fingerprint === descriptor.fingerprint;
      if (!decision.approved || !exactApproval || this.abortController.signal.aborted) {
        const result = {
          ok: false,
          requiresUserDecision: true,
          terminalReason: this.abortController.signal.aborted
            ? 'approval-cancelled'
            : exactApproval
              ? 'approval-rejected'
              : 'approval-fingerprint-mismatch',
          error: this.abortController.signal.aborted
            ? 'The session was cancelled while command approval was pending.'
            : exactApproval
              ? 'The user declined the exact invasive workspace command.'
              : 'The approval response did not match the exact command authorization fingerprint.',
        };
        await this.emit(
          'tool.approval.rejected',
          {
            toolName: tool.name,
            fingerprint: descriptor.fingerprint,
            decisionFingerprint: decision.fingerprint,
            approved: decision.approved,
            ...result,
          },
          requestId,
          toolCallId
        );
        await this.emit('tool.failed', { toolName: tool.name, ...result }, requestId, toolCallId);
        return result;
      }
      approval = {
        fingerprint: descriptor.fingerprint,
        approvedBy: decision.approvedBy?.trim() || 'vscode:explicit-user-command-approval',
        approvedAt: this.now().toISOString(),
        execution: decision.execution ?? descriptor.execution,
      };
      await this.emit(
        'tool.approval.approved',
        {
          toolName: tool.name,
          fingerprint: descriptor.fingerprint,
          approvedBy: approval.approvedBy,
          approvedAt: approval.approvedAt,
          execution: approval.execution ?? 'once',
        },
        requestId,
        toolCallId
      );
      await this.emit(
        'tool.permission',
        {
          toolName: tool.name,
          risk: authorization.risk,
          allowed: true,
          requiresUserConfirmation: false,
          reason: `The user approved this exact command for ${approval.execution ?? 'once'} scope.`,
          authorizationFingerprint: descriptor.fingerprint,
          approvedBy: approval.approvedBy,
        },
        requestId,
        toolCallId
      );
    }
    // A declined or cancelled approval is not an execution attempt. Record the
    // bounded attempt only after every policy boundary has admitted the tool,
    // so a durable session may be resumed and approve the same exact action.
    this.consecutiveIdenticalToolAttempts += 1;
    this.budgetLedger().totalToolExecutions += 1;
    await this.emit(
      'tool.started',
      {
        toolName: tool.name,
        activity: tool.activity,
        input: durableInput,
        reason: action.reason,
        ...(approval
          ? {
              authorizationFingerprint: approval.fingerprint,
              approvedBy: approval.approvedBy,
              approvedAt: approval.approvedAt,
            }
          : {}),
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
      ...(approval ? { approval } : {}),
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
    const causalStateAdvanced =
      Boolean(result.changed) ||
      // Rollback/rejection is a real state transition: the checkpoint restores
      // source ownership and a fresh inspection of the same path is required.
      // Unlike producer timestamps, this transition is bounded by the CLI
      // transaction and therefore may open one new causal epoch safely.
      rolledBackOrRejected ||
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
    if (causalStateAdvanced) {
      this.causalEpoch += 1;
      this.lastIdenticalToolSignature = undefined;
      this.consecutiveIdenticalToolAttempts = 0;
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
    if (tool.name === 'update-task-ledger') {
      this.rememberTaskLedger(result, this.state.sequence + 1);
    }
    if (tool.name === 'run-workspace-command') {
      this.rememberWorkspaceCommandEffectVerification(result);
    }
    this.rememberToolCompletionObligations({
      toolName: tool.name,
      activity: tool.activity,
      toolInput: action.input,
      result,
      sequence: this.state.sequence + 1,
    });
    await this.emit(
      result.ok ? 'tool.completed' : 'tool.failed',
      { toolName: tool.name, input: durableInput, reason: action.reason, ...durableResult },
      requestId,
      toolCallId,
      { toolName: tool.name, input: durableInput, reason: action.reason, ...transientResult }
    );
    if (tool.activity === 'verify') {
      this.rememberVerificationCompletion(durableResult, this.state.sequence + 1);
      await this.emit('verify.completed', durableResult, requestId, toolCallId);
    }
    return result;
  }

  private completionObligations(): StudioAgentCompletionObligations {
    if (
      this.state.completionObligations?.schemaVersion ===
      'workspai.studio-completion-obligations.v1'
    ) {
      return this.state.completionObligations;
    }
    const obligations: StudioAgentCompletionObligations = {
      schemaVersion: 'workspai.studio-completion-obligations.v1',
    };
    this.state.completionObligations = obligations;
    return obligations;
  }

  private pruneCompletionObligations(): void {
    const obligations = this.state.completionObligations;
    if (
      obligations &&
      obligations.latestSourceMutationSequence === undefined &&
      obligations.sourceReviewRequiredAfterSequence === undefined &&
      obligations.canonicalClosureRequiredAfterSequence === undefined &&
      obligations.freshVerificationRequiredAfterSequence === undefined
    ) {
      delete this.state.completionObligations;
    }
  }

  private rememberToolCompletionObligations(input: {
    toolName: string;
    activity: string;
    toolInput: unknown;
    result: StudioAgentToolResult;
    sequence: number;
  }): void {
    const obligations = this.completionObligations();
    const sourceMutation =
      input.result.changed === true &&
      input.activity === 'change' &&
      input.toolName !== 'run-governed-command' &&
      input.toolName !== 'verify-blocker' &&
      input.toolName !== 'verify-goal';
    const governedEvidenceMutation =
      input.result.changed === true && input.toolName === 'run-governed-command';

    if (sourceMutation) {
      obligations.latestSourceMutationSequence = input.sequence;
      obligations.freshVerificationRequiredAfterSequence = input.sequence;
      if (this.usesEvidenceReviewCompletion()) {
        obligations.sourceReviewRequiredAfterSequence = input.sequence;
      }
      if (verifiedCliRepairClosure(input.result)) {
        delete obligations.canonicalClosureRequiredAfterSequence;
      } else {
        obligations.canonicalClosureRequiredAfterSequence = input.sequence;
      }
    }
    if (governedEvidenceMutation) {
      obligations.freshVerificationRequiredAfterSequence = input.sequence;
    }

    if (
      input.toolName === 'inspect-workspace-changes' &&
      input.result.ok === true &&
      obligations.sourceReviewRequiredAfterSequence !== undefined &&
      input.sequence > obligations.sourceReviewRequiredAfterSequence
    ) {
      delete obligations.sourceReviewRequiredAfterSequence;
    }

    const toolInput =
      input.toolInput && typeof input.toolInput === 'object' && !Array.isArray(input.toolInput)
        ? (input.toolInput as Record<string, unknown>)
        : undefined;
    if (
      input.toolName === 'run-governed-command' &&
      toolInput?.commandId === 'workspaceIntelligenceChain' &&
      input.result.ok === true &&
      obligations.canonicalClosureRequiredAfterSequence !== undefined &&
      input.sequence > obligations.canonicalClosureRequiredAfterSequence
    ) {
      delete obligations.canonicalClosureRequiredAfterSequence;
    }

    if (
      input.activity === 'verify' &&
      input.result.ok === true &&
      input.result.cardBlocking === false &&
      (obligations.freshVerificationRequiredAfterSequence === undefined ||
        input.sequence > obligations.freshVerificationRequiredAfterSequence)
    ) {
      delete obligations.freshVerificationRequiredAfterSequence;
    }
    this.pruneCompletionObligations();
  }

  private rememberVerificationCompletion(result: StudioAgentToolResult, sequence: number): void {
    const obligations = this.state.completionObligations;
    if (
      obligations?.freshVerificationRequiredAfterSequence !== undefined &&
      result.ok === true &&
      result.cardBlocking === false &&
      sequence > obligations.freshVerificationRequiredAfterSequence
    ) {
      delete obligations.freshVerificationRequiredAfterSequence;
      this.pruneCompletionObligations();
    }
  }

  private rebuildCompletionObligationsIfNeeded(): void {
    const hadPersistedObligations = Boolean(this.state.completionObligations);
    const events = this.state.events;
    if (
      !hadPersistedObligations &&
      this.options.restoredSession &&
      events.length > 0 &&
      (events[0]?.sequence ?? 1) > 1 &&
      isAutonomousWorkspaiAssistantMode(this.executionMode())
    ) {
      const unknownPriorSequence = Math.max(0, (events[0]?.sequence ?? 1) - 1);
      const obligations = this.completionObligations();
      obligations.latestSourceMutationSequence = unknownPriorSequence;
      obligations.freshVerificationRequiredAfterSequence = unknownPriorSequence;
      obligations.canonicalClosureRequiredAfterSequence = unknownPriorSequence;
      if (this.usesEvidenceReviewCompletion()) {
        obligations.sourceReviewRequiredAfterSequence = unknownPriorSequence;
      }
    }
    for (const event of events) {
      if (event.type === 'tool.completed' || event.type === 'tool.failed') {
        const data =
          event.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : {};
        const toolName = typeof data.toolName === 'string' ? data.toolName : '';
        if (!toolName) {
          continue;
        }
        const definition = this.registry.get(toolName);
        this.rememberToolCompletionObligations({
          toolName,
          activity:
            definition?.activity ??
            (toolName === 'verify-blocker' || toolName === 'verify-goal'
              ? 'verify'
              : data.changed === true
                ? 'change'
                : 'inspect'),
          toolInput: data.input,
          result: data as StudioAgentToolResult,
          sequence: event.sequence,
        });
      } else if (event.type === 'verify.completed') {
        this.rememberVerificationCompletion(event.data as StudioAgentToolResult, event.sequence);
      }
    }
    this.pruneCompletionObligations();
  }

  private rebuildTaskLedgerFromEvents(): void {
    const afterSequence = this.state.taskLedger?.updatedSequence ?? 0;
    for (const event of this.state.events) {
      if (
        event.sequence <= afterSequence ||
        event.type !== 'tool.completed' ||
        !event.data ||
        typeof event.data !== 'object' ||
        Array.isArray(event.data)
      ) {
        continue;
      }
      const data = event.data as Record<string, unknown>;
      if (data.toolName === 'update-task-ledger') {
        this.rememberTaskLedger(data as StudioAgentToolResult, event.sequence);
      }
    }
  }

  private hasVerifiedCompletion(requestId: string): boolean {
    const latestVerify = [...this.state.events]
      .reverse()
      .find((event) => event.type === 'verify.completed' && event.requestId === requestId);
    if (!latestVerify) {
      return false;
    }
    const result = latestVerify.data as StudioAgentToolResult;
    return result.ok === true && result.cardBlocking === false;
  }

  private verificationToolName(): 'verify-goal' | 'verify-blocker' | undefined {
    if ((this.state.governedGoal || this.state.goal) && this.registry.get('verify-goal')) {
      return 'verify-goal';
    }
    return this.registry.get('verify-blocker') ? 'verify-blocker' : undefined;
  }

  private completionPolicyViolation(requestId: string, summary: string): string | undefined {
    const executionMode = this.executionMode();
    if (executionMode === 'ask' || executionMode === 'plan') {
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
          'fetch-public-web',
          'list-host-tools',
          'invoke-host-tool',
        ].includes(toolName);
      });
      if (!inspected) {
        return `${executionMode === 'ask' ? 'Ask' : 'Plan'} completion rejected: inspect relevant workspace source or governed evidence before answering.`;
      }
    }
    if (executionMode === 'plan') {
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

  private completionGateViolation(
    requestId: string,
    summary: string
  ):
    | {
        kind:
          | 'policy'
          | 'required-causal-action'
          | 'pending-effects'
          | 'source-review'
          | 'canonical-closure'
          | 'fresh-verification'
          | 'task-ledger'
          | 'verification';
        reason: string;
      }
    | undefined {
    const policyViolation = this.completionPolicyViolation(requestId, summary);
    if (policyViolation) {
      return { kind: 'policy', reason: policyViolation };
    }
    if (this.state.pendingRequiredCausalAction) {
      return {
        kind: 'required-causal-action',
        reason:
          'Completion rejected: the exact CLI-authored causal action is still pending and cannot be bypassed.',
      };
    }
    if (this.pendingEffectVerificationScopes.size > 0) {
      return {
        kind: 'pending-effects',
        reason:
          'Completion rejected: approved non-source effects still require a successful read-only ' +
          `observation in these domains: ${[...this.pendingEffectVerificationScopes].sort().join(', ')}.`,
      };
    }
    const unfinishedSteps = this.state.taskLedger?.steps.filter(
      (step) => step.status !== 'completed'
    );
    if (unfinishedSteps && unfinishedSteps.length > 0) {
      return {
        kind: 'task-ledger',
        reason:
          'Completion rejected: the durable task ledger still contains unfinished steps: ' +
          unfinishedSteps.map((step) => `${step.id} (${step.status})`).join(', '),
      };
    }
    const obligations = this.state.completionObligations;
    if (obligations?.sourceReviewRequiredAfterSequence !== undefined) {
      return {
        kind: 'source-review',
        reason:
          'Completion rejected: inspect the final workspace changes after the latest source mutation before claiming the user request is complete.',
      };
    }
    if (obligations?.canonicalClosureRequiredAfterSequence !== undefined) {
      return {
        kind: 'canonical-closure',
        reason:
          'Completion rejected: the latest source mutation has not closed the canonical Workspace Intelligence chain.',
      };
    }
    if (obligations?.freshVerificationRequiredAfterSequence !== undefined) {
      return {
        kind: 'fresh-verification',
        reason:
          'Completion rejected: canonical verification has not succeeded after the latest source mutation.',
      };
    }
    if (
      isAutonomousWorkspaiAssistantMode(this.executionMode()) &&
      this.options.requiresVerifiedCompletion !== false &&
      !this.hasVerifiedCompletion(requestId)
    ) {
      return {
        kind: 'verification',
        reason:
          'Completion rejected: this attempt has no fresh successful canonical verification result.',
      };
    }
    return undefined;
  }

  private async completeSessionIfAllowed(input: {
    requestId: string;
    summary: string;
    data?: Record<string, unknown>;
  }): Promise<
    | { completed: true; session: StudioAgentPersistedSession }
    | {
        completed: false;
        blocker: NonNullable<ReturnType<StudioAgentSession['completionGateViolation']>>;
      }
  > {
    const blocker = this.completionGateViolation(input.requestId, input.summary);
    if (blocker) {
      return { completed: false, blocker };
    }
    await this.emit(
      'session.completed',
      { ...(input.data ?? {}), summary: input.summary },
      input.requestId
    );
    await this.setStatus('completed');
    return { completed: true, session: this.snapshot() };
  }

  private executionMode(): WorkspaiAssistantMode {
    return this.state.executionPolicy?.toolMode ?? this.state.assistantMode;
  }

  private usesEvidenceReviewCompletion(): boolean {
    return (
      (this.executionMode() === 'agent' && this.state.cardId.startsWith('assistant:')) ||
      (this.executionMode() === 'goal' &&
        this.state.governedGoal?.completionMode === 'evidence-review')
    );
  }

  private isFreeFormAgentSession(): boolean {
    return (
      this.executionMode() === 'agent' &&
      this.state.cardId.startsWith('assistant:') &&
      !this.state.goal &&
      !this.state.governedGoal
    );
  }

  private hasMutated(): boolean {
    if (this.state.completionObligations?.latestSourceMutationSequence !== undefined) {
      return true;
    }
    return this.state.events.some((event) => {
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
  }

  private noteProductiveContinuation(): void {
    this.unverifiedContinuationNudges = 0;
    this.freedomPlaneActive = false;
  }

  private pauseUnverifiedContinuation(): never {
    throw new StudioAgentTerminalError(
      'Verification is still open. Studio paused after bounded attempts so this run would not keep spending tokens. Resume continues the same session. Nothing was marked complete.',
      'model-causal-progress-exhausted'
    );
  }

  private async beginUnverifiedContinuationNudge(requestId: string): Promise<boolean> {
    if (this.state.pendingRequiredCausalAction) {
      return false;
    }
    if (
      this.unverifiedContinuationNudges >= StudioAgentSession.MAX_UNVERIFIED_CONTINUATION_NUDGES
    ) {
      return false;
    }
    this.unverifiedContinuationNudges += 1;
    this.budgetLedger().totalContinuationNudges += 1;
    this.freedomPlaneActive = true;
    this.sourceRepairDirective = {
      nextAction: 'continue-unverified',
      recoveryPath: 'unverified-continue-nudge',
      cardId: this.latestActiveCardId,
      instruction:
        'This path is closed and the task is not finished. Choose any other governed tool and continue until canonical verification reports the blocker closed. Do not repeat the previous observation and do not treat this pause as completion.',
    };
    this.skipProgressBreakerOnce = true;
    await this.emit(
      'model.checkpoint',
      {
        summary:
          'The previous path made no verified progress. Studio is returning the full tool set for one more attempt. The task is not complete.',
        recovery: 'unverified-continue-nudge',
        nudge: this.unverifiedContinuationNudges,
      },
      requestId
    );
    return true;
  }

  private modelContext(
    latestObservation?: StudioAgentToolResult,
    sourceActionRequired = false
  ): StudioAgentModelContext {
    const mustTakeSourceAction = sourceActionRequired || this.sourceActionRequired;
    const requiredCausalAction = this.state.pendingRequiredCausalAction;
    const tools = this.registry.list().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: this.exhaustedTools.has(tool.name)
        ? `${tool.description} This accelerator is exhausted for the current causal generation; choose a materially different capability until state advances.`
        : tool.description,
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
      ...(requiredCausalAction
        ? { requiredCausalAction: structuredClone(requiredCausalAction) }
        : {}),
      ...(this.pendingEffectVerificationScopes.size > 0
        ? {
            pendingEffectVerificationScopes: [...this.pendingEffectVerificationScopes].sort(),
          }
        : {}),
      steering: this.steering.splice(0),
    };
  }

  private rememberWorkspaceCommandEffectVerification(result: StudioAgentToolResult): void {
    const output = toolOutputRecord(result);
    if (!output) {
      return;
    }
    if (result.ok === true) {
      for (const scope of stringValues(output.observationScopes)) {
        this.pendingEffectVerificationScopes.delete(scope);
      }
    }
    const effects =
      output.effects && typeof output.effects === 'object' && !Array.isArray(output.effects)
        ? (output.effects as Record<string, unknown>)
        : undefined;
    for (const scope of stringValues(effects?.verificationScopes)) {
      this.pendingEffectVerificationScopes.add(scope);
    }
    if (this.pendingEffectVerificationScopes.size > 0) {
      this.state.pendingEffectVerificationScopes = [...this.pendingEffectVerificationScopes].sort();
    } else {
      delete this.state.pendingEffectVerificationScopes;
    }
  }

  private rememberTaskLedger(result: StudioAgentToolResult, sequence: number): void {
    const output = toolOutputRecord(result);
    if (
      result.ok !== true ||
      output?.schemaVersion !== 'workspai.studio-task-ledger.v1' ||
      typeof output.objective !== 'string' ||
      !Array.isArray(output.steps)
    ) {
      return;
    }
    const steps = output.steps
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
      )
      .map((entry) => ({
        id: String(entry.id ?? '').trim(),
        description: String(entry.description ?? '').trim(),
        status: String(entry.status ?? '') as StudioAgentTaskLedger['steps'][number]['status'],
        ...(typeof entry.evidence === 'string' && entry.evidence.trim()
          ? { evidence: entry.evidence.trim() }
          : {}),
      }))
      .filter(
        (entry) =>
          entry.id &&
          entry.description &&
          ['pending', 'in-progress', 'completed', 'blocked'].includes(entry.status)
      );
    if (steps.length === 0) {
      return;
    }
    const currentStepId =
      typeof output.currentStepId === 'string' &&
      steps.some((entry) => entry.id === output.currentStepId)
        ? output.currentStepId
        : undefined;
    this.state.taskLedger = {
      schemaVersion: 'workspai.studio-task-ledger.v1',
      objective: output.objective.trim(),
      ...(currentStepId ? { currentStepId } : {}),
      steps,
      updatedAt: this.now().toISOString(),
      updatedSequence: sequence,
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
