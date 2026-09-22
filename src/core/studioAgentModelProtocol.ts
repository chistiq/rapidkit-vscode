import { randomUUID } from 'node:crypto';

import type { AIMessage } from './aiService.js';
import type {
  StudioAgentModelResolution,
  StudioAgentPersistedSession,
} from './studioAgentEvents.js';
import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';
import type {
  StudioAgentModelAction,
  StudioAgentModelAdapter,
  StudioAgentModelContext,
} from './studioAgentSession.js';
import {
  getWorkspaceIntelligenceCanonicalStages,
  getWorkspaceIntelligenceAgentReadOrder,
  getWorkspaceIntelligenceChainInvariant,
  getWorkspaceIntelligenceExecutionPreflights,
} from './workspaceIntelligenceChainContract.js';

export const STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION =
  'workspai.studio-agent-model-action.v1' as const;
export const STUDIO_AGENT_COMPLETE_TOOL_NAME = 'workspai-complete' as const;
export const STUDIO_AGENT_REQUEST_INPUT_TOOL_NAME = 'workspai-request-input' as const;

export type StudioAgentNativeToolAction = {
  callId?: string;
  toolName: string;
  input: Record<string, unknown>;
  resolution?: StudioAgentModelResolution;
};

export type StudioAgentTextCompletion = {
  type: 'text';
  text: string;
  resolution?: StudioAgentModelResolution;
};

function isStudioAgentTextCompletion(
  value: StudioAgentNativeToolAction | StudioAgentTextCompletion
): value is StudioAgentTextCompletion {
  return 'type' in value && value.type === 'text';
}

export type StudioAgentConversationMessage = AIMessage;

function coherentConversationWindow(
  messages: StudioAgentConversationMessage[],
  limit: number
): StudioAgentConversationMessage[] {
  const bounded = messages.slice(-limit);
  const coherent: StudioAgentConversationMessage[] = [];
  for (let index = 0; index < bounded.length; index += 1) {
    const message = bounded[index];
    if ('toolResult' in message) {
      // A result whose assistant tool call fell outside the bounded window is
      // invalid for OpenAI-compatible providers and carries no safe context.
      continue;
    }
    if ('toolCall' in message) {
      const result = bounded[index + 1];
      if (
        result &&
        'toolResult' in result &&
        result.toolResult.callId === message.toolCall.callId
      ) {
        coherent.push(message, result);
        index += 1;
      }
      continue;
    }
    coherent.push(message);
  }
  while (coherent.length > 0 && coherent[0].role !== 'user') {
    coherent.shift();
  }
  return coherent;
}

export function restoreStudioAgentNativeConversation(
  session?: StudioAgentPersistedSession
): StudioAgentConversationMessage[] {
  if (!session) {
    return [];
  }
  const terminalByCallId = new Map(
    session.events
      .filter(
        (event) =>
          Boolean(event.toolCallId) &&
          (event.type === 'tool.completed' || event.type === 'tool.failed')
      )
      .map((event) => [event.toolCallId!, event] as const)
  );
  const requests = session.events
    .filter(
      (event) =>
        event.type === 'tool.requested' &&
        Boolean(event.toolCallId) &&
        terminalByCallId.has(event.toolCallId!)
    )
    .slice(-4);
  if (requests.length === 0) {
    return [];
  }
  const latestRequest = [...session.events]
    .reverse()
    .find((event) => event.type === 'request.started');
  const requestData =
    latestRequest?.data &&
    typeof latestRequest.data === 'object' &&
    !Array.isArray(latestRequest.data)
      ? (latestRequest.data as Record<string, unknown>)
      : undefined;
  const messages: StudioAgentConversationMessage[] = [
    {
      role: 'user',
      content: boundedControlText(
        typeof requestData?.request === 'string'
          ? requestData.request
          : `Resume the durable Workspai repair session for ${session.cardId}.`,
        4_000
      ),
    },
  ];
  for (const request of requests) {
    const callId = request.toolCallId!;
    const requestPayload =
      request.data && typeof request.data === 'object' && !Array.isArray(request.data)
        ? (request.data as Record<string, unknown>)
        : {};
    const terminal = terminalByCallId.get(callId)!;
    const terminalPayload =
      terminal.data && typeof terminal.data === 'object' && !Array.isArray(terminal.data)
        ? (terminal.data as Record<string, unknown>)
        : {};
    const name =
      typeof requestPayload.toolName === 'string' && requestPayload.toolName.trim()
        ? requestPayload.toolName.trim()
        : 'workspai-restored-tool';
    const toolInput =
      requestPayload.input &&
      typeof requestPayload.input === 'object' &&
      !Array.isArray(requestPayload.input)
        ? (requestPayload.input as Record<string, unknown>)
        : {};
    messages.push(
      {
        role: 'assistant',
        toolCall: {
          callId,
          name,
          input: redactControlValue(toolInput) as Record<string, unknown>,
        },
      },
      {
        role: 'tool',
        toolResult: {
          callId,
          name,
          content: boundedJson(
            {
              ok: terminal.type === 'tool.completed',
              ...(redactControlValue(terminalPayload) as Record<string, unknown>),
            },
            12_000
          ),
        },
      }
    );
  }
  return messages;
}

export type StudioAgentModelCompletion = (
  prompt: string,
  request: {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    messages: StudioAgentConversationMessage[];
  }
) => Promise<string | StudioAgentNativeToolAction | StudioAgentTextCompletion>;

function exactJson(text: string): Record<string, unknown> | undefined {
  const raw = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(raw);
  const trimmed = fenced?.[1]?.trim() ?? raw;
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return undefined;
  }
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedJson(value: unknown, maxChars = 24_000): string {
  const serialized = JSON.stringify(value);
  return serialized.length > maxChars
    ? `${serialized.slice(0, maxChars)}…[observation truncated]`
    : serialized;
}

function boundedText(value: string, maxChars = 10_000): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…[objective truncated]` : value;
}

function boundedControlText(value: string, maxChars = 10_000): string {
  return boundedText(redactLocalPathsForConsumer(value), maxChars);
}

function redactControlValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[depth-limited]';
  }
  if (typeof value === 'string') {
    return redactLocalPathsForConsumer(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactControlValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redactControlValue(entry, depth + 1),
    ])
  );
}

function redactConversationMessage(
  message: StudioAgentConversationMessage
): StudioAgentConversationMessage {
  if ('content' in message) {
    return { ...message, content: redactLocalPathsForConsumer(message.content) };
  }
  if ('toolCall' in message) {
    return {
      ...message,
      toolCall: {
        ...message.toolCall,
        input: redactControlValue(message.toolCall.input) as Record<string, unknown>,
      },
    };
  }
  return {
    ...message,
    toolResult: {
      ...message.toolResult,
      content: redactLocalPathsForConsumer(message.toolResult.content),
    },
  };
}

function conciseToolOutput(
  value: unknown,
  options: { sourceEntryLimit?: number; sourceContentLimit?: number } = {}
): unknown {
  if (Array.isArray(value)) {
    const sourceEntries = value
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          typeof (entry as Record<string, unknown>).path === 'string' &&
          typeof (entry as Record<string, unknown>).content === 'string'
      )
      .slice(0, options.sourceEntryLimit ?? 4);
    if (sourceEntries.length > 0) {
      return sourceEntries.map((entry) => ({
        path: redactLocalPathsForConsumer(String(entry.path)),
        exists: entry.exists !== false,
        sha256: entry.sha256,
        truncated: entry.truncated,
        content: boundedControlText(String(entry.content), options.sourceContentLimit ?? 6_000),
      }));
    }
    return {
      itemCount: value.length,
      paths: value
        .map((entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry as Record<string, unknown>).path
            : undefined
        )
        .filter((entry): entry is string => typeof entry === 'string')
        .slice(0, 8),
    };
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  return redactControlValue(
    Object.fromEntries(
      [
        'recoveryPath',
        'dependencyBlockerPresent',
        'nextAction',
        'closureReady',
        'transaction',
        'requiresUserDecision',
        'terminalReason',
        'decisionOptions',
        'auditExitCode',
        'auditSummary',
        'command',
        'target',
        'appliedCount',
        'changedPaths',
        'upgradeCandidates',
        'resolutionCandidates',
        'blockedCandidates',
        'dependencyDiagnostics',
        'sourceCandidates',
        'instruction',
        'unresolvedProjects',
        'processedProjects',
        'projectNames',
        'clearedProjects',
        'fallbackCapability',
        'recommendedTools',
        'recommendedActions',
        'producerRefreshCommandId',
        'producerRefreshReason',
        'remediationStep',
        'requiredAction',
        'remediationPlanRefreshed',
        'remediationPlanError',
        'exhaustedTools',
        'observations',
        'evidenceGeneration',
        'blockerSignature',
        'incidentGraph',
        'activeHandoff',
        'refresh',
        'blockingCards',
        'blockers',
        'files',
        'diagnostics',
        'status',
        'diff',
        'exitCode',
        'stdout',
        'stderr',
        'cwd',
        'purpose',
        'displayCommand',
        'mutatesSource',
        'observedSourceChange',
        'effects',
        'effectScopes',
        'observationScopes',
        'rolledBack',
        'rollbackReason',
      ]
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, record[key]])
    )
  );
}

function conciseLatestObservation(
  value: StudioAgentModelContext['latestObservation'],
  compact = false
): unknown {
  if (!value) {
    return null;
  }
  return {
    ok: value.ok,
    changed: value.changed,
    intelligencePhase: value.intelligencePhase,
    cardBlocking: value.cardBlocking,
    evidenceGeneration: value.evidenceGeneration,
    blockerSignature: value.blockerSignature,
    error: value.error ? boundedControlText(value.error, 3_000) : undefined,
    output: conciseToolOutput(
      value.output,
      compact ? { sourceEntryLimit: 4, sourceContentLimit: 3_000 } : {}
    ),
  };
}

function conciseRecentObservations(
  value: StudioAgentModelContext['recentObservations'],
  latestObservation?: StudioAgentModelContext['latestObservation']
): unknown {
  const observations = value ?? [];
  const finalObservation =
    observations.length > 0 ? observations[observations.length - 1] : undefined;
  const withoutDuplicatedLatest =
    finalObservation?.result === latestObservation ? observations.slice(0, -1) : observations;
  return withoutDuplicatedLatest.slice(-5).map((observation) => ({
    toolName: observation.toolName,
    input: redactControlValue(observation.input),
    ok: observation.result.ok,
    changed: observation.result.changed,
    cardBlocking: observation.result.cardBlocking,
    blockerSignature: observation.result.blockerSignature,
    error: observation.result.error
      ? boundedControlText(observation.result.error, 1_600)
      : undefined,
    output: conciseToolOutput(observation.result.output),
  }));
}

function conciseCausalEvent(event: StudioAgentModelContext['session']['events'][number]) {
  const data =
    event.data && typeof event.data === 'object' && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : {};
  return {
    sequence: event.sequence,
    type: event.type,
    toolName: data.toolName,
    input: redactControlValue(data.input),
    ok: data.ok,
    changed: data.changed,
    intelligencePhase: data.intelligencePhase,
    cardBlocking: data.cardBlocking,
    evidenceGeneration: data.evidenceGeneration,
    blockerSignature: data.blockerSignature,
    error: typeof data.error === 'string' ? boundedControlText(data.error, 1_200) : undefined,
    summary: typeof data.summary === 'string' ? boundedControlText(data.summary, 600) : undefined,
    output: conciseToolOutput(data.output),
  };
}

function isCausalSessionEvent(
  event: StudioAgentModelContext['session']['events'][number]
): boolean {
  return (
    event.type === 'request.steered' ||
    event.type === 'model.checkpoint' ||
    event.type === 'tool.completed' ||
    event.type === 'tool.failed' ||
    event.type === 'verify.completed'
  );
}

/**
 * Preserve the causal spine of long-running sessions without replaying source,
 * command transcripts, or every intermediate observation into the provider.
 * This summary is derived only from durable events and keeps sequence numbers,
 * so a newer raw event can safely supersede an older compacted outcome.
 */
function conciseEarlierCausalHistory(
  events: StudioAgentModelContext['session']['events']
): unknown {
  if (events.length === 0) {
    return null;
  }

  const toolOutcomes = new Map<
    string,
    { completed: number; failed: number; lastSequence: number; lastOutcome: string }
  >();
  let latestFailure: ReturnType<typeof conciseCausalEvent> | undefined;
  let latestVerification: ReturnType<typeof conciseCausalEvent> | undefined;
  let latestCheckpoint: ReturnType<typeof conciseCausalEvent> | undefined;
  let latestSteering: ReturnType<typeof conciseCausalEvent> | undefined;

  for (const event of events) {
    const concise = conciseCausalEvent(event);
    if (event.type === 'tool.completed' || event.type === 'tool.failed') {
      const toolName = typeof concise.toolName === 'string' ? concise.toolName : 'unknown-tool';
      const previous = toolOutcomes.get(toolName) ?? {
        completed: 0,
        failed: 0,
        lastSequence: event.sequence,
        lastOutcome: event.type,
      };
      if (event.type === 'tool.completed') {
        previous.completed += 1;
      } else {
        previous.failed += 1;
        latestFailure = concise;
      }
      previous.lastSequence = event.sequence;
      previous.lastOutcome = event.type;
      toolOutcomes.set(toolName, previous);
    } else if (event.type === 'verify.completed') {
      latestVerification = concise;
    } else if (event.type === 'model.checkpoint') {
      latestCheckpoint = concise;
    } else if (event.type === 'request.steered') {
      latestSteering = concise;
    }
  }

  return {
    compactedEventCount: events.length,
    sequenceRange: {
      first: events[0]?.sequence,
      last: events.at(-1)?.sequence,
    },
    toolOutcomes: [...toolOutcomes.entries()]
      .map(([toolName, outcome]) => ({ toolName, ...outcome }))
      .sort((left, right) => right.lastSequence - left.lastSequence)
      .slice(0, 16),
    latestEarlierFailure: latestFailure,
    latestEarlierVerification: latestVerification,
    latestEarlierCheckpoint: latestCheckpoint,
    latestEarlierSteering: latestSteering,
  };
}

export function parseStudioAgentModelAction(input: {
  text: string;
  allowedTools: readonly string[];
}): StudioAgentModelAction {
  const value = exactJson(input.text);
  if (!value) {
    return {
      type: 'message',
      text:
        input.text.trim() || 'The model response did not satisfy the Studio Agent action contract.',
    };
  }
  if (
    value.schemaVersion !== STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION ||
    typeof value.action !== 'string'
  ) {
    return {
      type: 'message',
      text:
        input.text.trim() || 'The model response did not satisfy the Studio Agent action contract.',
    };
  }
  if (
    value.action === 'tool' &&
    hasOnlyKeys(value, ['schemaVersion', 'action', 'toolName', 'input', 'reason']) &&
    typeof value.toolName === 'string' &&
    input.allowedTools.includes(value.toolName) &&
    typeof value.reason === 'string' &&
    value.reason.trim()
  ) {
    return {
      type: 'tool',
      toolName: value.toolName,
      input: value.input ?? {},
      reason: value.reason.trim(),
    };
  }
  if (
    value.action === 'input' &&
    hasOnlyKeys(value, ['schemaVersion', 'action', 'question', 'reason']) &&
    typeof value.question === 'string' &&
    value.question.trim() &&
    typeof value.reason === 'string' &&
    value.reason.trim()
  ) {
    return {
      type: 'input',
      question: boundedControlText(value.question, 1_000),
      reason: boundedControlText(value.reason, 500),
    };
  }
  if (
    value.action === 'complete' &&
    hasOnlyKeys(value, ['schemaVersion', 'action', 'summary']) &&
    typeof value.summary === 'string' &&
    value.summary.trim()
  ) {
    return { type: 'complete', summary: value.summary.trim() };
  }
  return {
    type: 'message',
    text: 'The model selected an unavailable tool or returned malformed action fields.',
  };
}

function promptForTurn(
  context: StudioAgentModelContext,
  objective: string,
  budget: 'standard' | 'compact' = 'standard'
): string {
  // The objective already carries the current card and evidence generation.
  // Re-sending request/status chatter on every turn wastes model context and
  // previously caused long-lived repair sessions to hit the provider token
  // limit before reaching a tool call. Keep only causal tool/checkpoint events.
  const causalEvents = context.session.events.filter(isCausalSessionEvent);
  const recentEventLimit = budget === 'compact' ? 2 : 8;
  const earlierEvents = causalEvents.slice(0, Math.max(0, causalEvents.length - recentEventLimit));
  const recentEvents = causalEvents.slice(-recentEventLimit).map(conciseCausalEvent);
  const selectedMode = context.session.assistantMode;
  const mode = context.session.executionPolicy?.toolMode ?? selectedMode;
  const intelligenceLoop = getWorkspaceIntelligenceCanonicalStages().map(
    ({ id, label, phase }) => ({ id, label, phase })
  );
  const intelligencePreflights = getWorkspaceIntelligenceExecutionPreflights().map(
    ({ id, label, purpose }) => ({ id, label, purpose })
  );
  const goalCompletionMode = context.session.governedGoal?.completionMode;
  const modeInstructions =
    mode === 'agent' || mode === 'goal'
      ? [
          'Own the task from evidence inspection through the required causal actions and final verification.',
          ...(mode === 'goal'
            ? goalCompletionMode === 'evidence-review'
              ? [
                  'This session is bound to an active CLI Goal Pack for an arbitrary engineering objective. Its objective, scope, evidence bindings, policy, and attempt budget are authoritative; it intentionally has no fake deterministic semantic verifier.',
                  'Own the complete objective, not merely one convenient metric. After each closed CLI repair transaction, inspect the final worktree and assess the result against the original objective. The final verify-goal call proves workspace safety and evidence freshness; your evidence-backed review establishes outcome readiness without calling it machine-verified.',
                ]
              : [
                  'This session is bound to an active CLI Goal Pack. Its linked verified-goal contract is the immutable definition of done, and every source proposal must remain inside its declared scope.',
                  'Do not claim completion from a patch or intermediate metric. Finish only after verify-goal closes the Goal Pack as verified.',
                ]
            : []),
          ...(mode === 'agent' && !context.session.goal && !context.session.governedGoal
            ? [
                'This is a free-form Agent session without a pre-defined blocker or goal. First, use your intelligence to understand what the user actually wants. If the request is vague, off-topic, or non-actionable (e.g. greetings, jokes, unrelated questions), respond with a brief clarifying message instead of running tools — you may send a plain-text message without a tool call in this case.',
                'When the request is a clear engineering task, interpret it as the objective and resolve it autonomously through the full intelligent loop: discover → inspect → act → verify → complete.',
                'After every closed CLI repair transaction, run verify-blocker to confirm workspace health, then inspect-workspace-changes to review the final diff. Only complete after both succeed.',
                'When the request is ambiguous about scope (workspace vs. a specific project), use query-workspace-graph or discover-workspace-files to enumerate available projects first. If multiple projects exist and the target is unclear, ask the user to confirm the intended project before mutating source.',
              ]
            : []),
          'Before starting any repair or feature work, inspect the existing Workspace Intelligence evidence (Doctor, Readiness, Analyze, Dependency Graph) through inspect-evidence and query-workspace-graph. Use these pre-generated artifacts to understand the workspace model, dependency structure, and health posture — they provide faster and more accurate context than raw source inspection alone.',
          'Follow the CLI-authored canonical agent read order. Read INDEX first, then an active Goal Pack, bounded workspace context, and the relevant generated operational Skill. Use bounded graph search for missing proof; never preload full Model or Graph exports unless the task explicitly requires a complete export.',
          'When the session includes a verified goal, treat its scope, constraints, baseline, and criteria as the authoritative definition of done. Continue until verify-goal returns state=verified; a plausible patch, higher metric, or successful single command is not completion.',
          'Verified goals are resumable transactions. Never weaken their target, disable required build/tests, enable force, or permit breaking changes unless the durable goal contract already authorizes it.',
          'Never delegate a resolvable step to the operator. Never claim completion while governed verification is required and still blocking.',
          'Treat .workspai reports as generated evidence: never patch them directly. Run their governed producer, then continue through every downstream gate required by the refreshed blocker.',
          'Prefer the workspaceIntelligenceChain governed command when the complete evidence chain must be regenerated. It is the contract-owned authority for stage order, dependencies, verdict propagation, and downstream artifacts.',
          'The unified intelligence chain does not replace card-specific producers. When a remediation plan is missing or stale, run workspaceRemediationPlan first; use workspaceIntelligenceChain only after source repair or when the complete canonical evidence chain must be refreshed.',
          'The canonical Workspace Intelligence stages below are immutable. Never reorder, skip, append, or substitute stages. Execution prerequisites are reported separately and never become chain stages. Auxiliary capabilities may repair the source needed to pass a stage, but they never become chain stages.',
          'Use a CLI Repair Engine proposal for semantic source edits whenever the exact file change can be expressed as an inspected patch. The CLI owns checkpointing, runtime-specific reconciliation, audit/test/build validation, the canonical Workspace Intelligence chain, target verification, closure, and rollback. A repository-native mutating command is a separate invasive path: propose it only when the tool itself owns the required transformation; Studio will pause for exact fingerprint-bound user approval and audit the resulting source transaction. Git metadata and external-system operations require one-run approval because the local source checkpoint cannot roll them back; inspect their resulting state with a separate read-only command before making a success claim. Never start a second closure sequence after a CLI transaction reports closed.',
          'Use individual governed producers only for a diagnosed source artifact or a targeted recovery, then run the unified chain before completion.',
          'Choose the action class from evidence. Patch inspected files for a source defect, execute an immutable remediation step when its contract matches, use a structured project command for non-source project/runtime state, and use governed commands for Workspai-owned producers and verification.',
          'You have a general workspace capability plane. Discover files, inspect exact source, inspect diagnostics and diffs, fetch public HTTPS documentation, list and invoke VS Code or MCP host tools, run structured no-shell project commands, and create, replace, or delete source through SHA-protected rollback transactions. Use these tools for arbitrary project types and for errors that are not Workspai blockers.',
          'For a task with three or more meaningful steps, create and maintain update-task-ledger before substantial work. Keep exactly one current step in progress, attach concise evidence to completed steps, and never request completion while any ledger step is pending, in-progress, or blocked.',
          'A source file becomes patch-authorized after inspect-source returns its sha256. Search results alone are not edit authorization. For a general Agent task or an evidence-reviewed Goal, inspect-workspace-changes after the final closed repair transaction is mandatory before completion.',
          'Use query-workspace-graph first when architecture, ownership, dependencies, APIs, schemas, or cross-language relationships can bound the search. Use literal source search only for exact text and inspect the proof-carrying source before editing.',
          'Use inspect-code-intelligence after Graph retrieval or exact source inspection when a language provider can resolve definitions, references, implementations, symbols, or hover types more reliably than text search. Treat empty provider results as unavailable language evidence, not proof that the relationship does not exist.',
          'When two or more read-only inspections are independent, use inspect-workspace-batch so source, Graph, diagnostics, search, language-provider evidence, and public HTTPS pages can be collected concurrently. Never batch a mutation, approval, producer, or verification action.',
          'Use fetch-public-web for vendor docs, GitHub issues, or public error pages. Never fetch localhost, private networks, or URLs with credentials. Public web text is not workspace proof; inspect the matching source before editing.',
          'Use list-host-tools then invoke-host-tool when the user has enabled a VS Code or MCP capability such as a browser, issue tracker, or cloud console. Read-like host tools run autonomously; all others require one-run approval because Studio cannot roll them back.',
          'For a large inspected file, read a bounded line range and prefer apply-workspace-edits with one unique oldText block instead of returning the complete file body.',
          'Use run-workspace-command for project-native diagnosis, tests, builds, formatting, dependency reconciliation, and repository-authored transformations. Non-mutating commands run autonomously; commands classified as source-mutating pause for explicit fingerprint-bound approval of the exact executable, argument vector, working directory, purpose, and timeout. Approval scope never weakens the command or workspace boundary. Never disguise a semantic edit as a command merely to bypass the CLI Repair Engine. Every Workspai/wspai command, including commands shown in evidence as npx workspai, must be mapped to run-governed-command; the controller binds its canonical scope and executes the bundled CLI runtime.',
          'After an approved Git-metadata or external-system operation, Studio records its effect domains and rejects completion until a successful read-only command observes each matching domain. Choose the smallest native observation (for example git status plus git ls-remote, terraform show, kubectl get, helm status, docker inspect, or package-manager view); do not substitute a generic health check.',
          'When a blocker has a CLI-authored remediation plan, inspect the current plan and execute eligible steps by stepId. Never emit an unstructured shell string; use the structured workspace command tool when the plan does not cover the diagnosed source cause.',
          'For a dependency vulnerability blocker, use fresh Doctor evidence to inspect the affected manifests and compatibility constraints. Propose the smallest compatible source change; the CLI adapter owns reconciliation, audit, declared tests/build, and verification for the detected ecosystem.',
          'When a blocker accelerator returns general-source-repair, no-safe-upgrade, a no-op, or a breaking/downgrade-only candidate, that accelerator is exhausted for the current causal generation. Do not call it again. Move to the general capability plane and choose from fresh evidence: inspect source or diagnostics, refresh the owning producer, execute an exact remediation step, run a structured project-native command, or apply a SHA-protected source transaction. Then run the appropriate build/test/audit and canonical verification.',
          'A rejected model proposal is not an operator decision. Read the rejection cause, inspect the exact producer artifact and its normalized finding, map that finding to the source file or missing source artifact that can change the verdict, and submit materially different content. Never rewrite an unchanged file merely because it appeared in an earlier source-candidate list.',
          'For aggregate cards such as Analyze, Readiness, Workspace Verify, and Workspace Intelligence, the aggregate message is not the source target. Trace it to the project-scoped blocking finding first. Repair one causal finding family, refresh its owning producer, then let the controller advance to the next blocker.',
          'Dependency source repair is runtime-native, not npm-specific. Use the Doctor-authored audit invocation and the detected manifest plus lock/baseline for Node, Python, Go, Rust, JVM, PHP, Ruby, .NET, Elixir, Deno, Bun, or native projects. Before requesting a breaking decision, perform one bounded compatibility investigation of the affected package, its owning direct dependency, admissible constraint or override support, and available replacement path.',
          'Never run Doctor, Readiness, Verify, Workspace Run, remediation-plan, or Workspace Intelligence through run-workspace-command. They are registered Workspai producers and always belong to run-governed-command. The controller prevents duplicate observations within one causal generation; do not infer that source mutation is required merely because a producer still reports a blocker.',
          'A project-native diagnostic such as npm audit commonly exits non-zero because it found a problem. Treat its stdout/stderr as causal evidence, not as permission to rerun the same command. Inspect the authorized manifest, choose a compatible source-level resolution, and apply one patch transaction.',
          'Never invoke Workspai through npx, npm, pnpm, yarn, bun, workspai, or wspai from the generic command tool. Portable npx strings in evidence are display guidance for humans, not model execution authority.',
          'Never repeat an inspection, audit, remediation, or verify action against the same causal evidence generation. Reuse the prior observation and advance to a different causal action.',
          'Never retry an exhausted repair accelerator and never hand-edit a package-manager lockfile. Move to a materially different causal capability supported by the prior observations.',
          'JSON files (.json) require strictly valid JSON. Never include comments (// or /* */), trailing commas, or non-standard syntax in any .json file content.',
          'Blocker-specific tools are optional accelerators, not capability boundaries. If an accelerator does not cover the diagnosed project or error, continue with discovery, diagnostics, inspected edits, project-native commands, diff review, and governed verification.',
          'Treat failed target verification as a new observation and diagnose the causal defect it reports without assuming that source must change. Remaining sourceCandidates after a rolled-back CLI transaction are candidate targets: inspect them before proposing, create any path that inspect-source reports as exists:false, and do not rewrite a restored file whose content already failed verification. A selected repair may close while unrelated workspace findings remain; report those findings as next work instead of reopening or misclassifying the verified target.',
          'One repair session owns the selected card and its causal action set. Do not absorb unrelated blocking cards merely because they appear in the same workspace dashboard.',
          'Recent in-memory observations preserve bounded inspected source for the current run. Reuse that content to patch or run the next causal diagnostic; do not re-inspect a file merely because another tool ran afterward.',
        ]
      : mode === 'plan'
        ? [
            'Produce an evidence-backed implementation plan. Do not modify files or run mutating commands.',
            'Inspect enough source and governed evidence to make the plan concrete. Fetch public HTTPS docs when the plan depends on an external contract. Complete with six concise sections: Scope, Evidence, Steps, Verification, Rollback, and Assumptions.',
          ]
        : [
            'Answer from inspected source and governed evidence. Do not modify files or run mutating commands.',
            'At least one relevant source, graph, diagnostic, change, public HTTPS, or governed-evidence inspection is required before completion. Then answer directly and concisely.',
          ];
  return [
    `You are Workspai Assistant operating under the ${mode.toUpperCase()} execution policy inside one trusted workspace.`,
    ...(mode !== selectedMode
      ? [
          `The user selected ${selectedMode.toUpperCase()} mode, but this request was safely reduced to ${mode.toUpperCase()} authority. Do not exceed the provided tools or imply that the selector changed.`,
        ]
      : []),
    ...modeInstructions,
    mode === 'agent' && !context.session.goal && !context.session.governedGoal
      ? 'Select exactly one provided native tool per turn. If essential scope is missing, call workspai-request-input before mutation; never use ordinary text as an implicit question.'
      : 'Select exactly one provided native tool per turn.',
    'If native tool calling is unavailable, use exactly one JSON action with no markdown or prose.',
    `Action schema: ${STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION}`,
    'Tool action: {"schemaVersion":"workspai.studio-agent-model-action.v1","action":"tool","toolName":"...","input":{},"reason":"..."}',
    ...(mode === 'agent' || mode === 'goal'
      ? [
          'Input action: {"schemaVersion":"workspai.studio-agent-model-action.v1","action":"input","question":"...","reason":"..."}',
        ]
      : []),
    'Completion action: {"schemaVersion":"workspai.studio-agent-model-action.v1","action":"complete","summary":"..."}',
    `Objective: ${boundedControlText(objective, 5_000)}`,
    `Durable task ledger: ${boundedJson(
      redactControlValue(context.session.taskLedger ?? null),
      8_000
    )}`,
    `Durable bounded-attempt ledger: ${boundedJson(
      redactControlValue(context.session.budgetLedger ?? null),
      2_000
    )}`,
    `Durable completion obligations: ${boundedJson(
      redactControlValue(context.session.completionObligations ?? null),
      2_000
    )}`,
    'Workspace control boundary: $WORKSPACE',
    ...(context.session.projectPath ? ['Project source boundary: $PROJECT'] : []),
    `Scope: ${context.session.cardId}`,
    `Blocker signature: ${context.session.blockerSignature ?? 'unknown'}`,
    `Governed Goal Pack: ${boundedJson(
      redactControlValue(context.session.governedGoal ?? null),
      5_000
    )}`,
    `Verified engineering goal: ${boundedJson(
      redactControlValue(context.session.goal ?? null),
      5_000
    )}`,
    `Canonical Workspace Intelligence invariant: ${getWorkspaceIntelligenceChainInvariant()}`,
    `Canonical agent read order: ${boundedJson(getWorkspaceIntelligenceAgentReadOrder(), 2_000)}`,
    `Execution prerequisites outside the canonical loop: ${boundedJson(
      intelligencePreflights,
      2_000
    )}`,
    `Canonical Workspace Intelligence stages: ${boundedJson(intelligenceLoop, 4_000)}`,
    `Tools: ${boundedJson(
      context.tools.map(({ name, title, activity, risk }) => ({ name, title, activity, risk })),
      4_000
    )}`,
    `Required causal action: ${
      context.requiredCausalAction
        ? `ACTIVE. Invoke exactly this native tool and input now. Do not inspect again, complete, substitute another tool, or restate the command. Policy evaluation, user approval, rollback, and verification remain controller-owned. Contract: ${boundedJson(
            redactControlValue(context.requiredCausalAction),
            3_000
          )}`
        : 'none'
    }`,
    `Causal recovery phase: ${
      context.sourceRepairDirective
        ? `ACTIVE. Choose the next materially different capability from evidence; blocker-specific accelerators are optional and duplicate observations remain bounded. Directive: ${boundedJson(
            conciseToolOutput(context.sourceRepairDirective),
            budget === 'compact' ? 3_000 : 8_000
          )}`
        : 'inactive'
    }`,
    `Causal action required: ${
      context.sourceActionRequired
        ? 'YES. The bounded observation budget is exhausted. Use a materially different evidence-backed capability: an exact producer/remediation action, a structured project command, or a governed source transaction. Do not repeat a prior observation.'
        : 'no'
    }`,
    `Pending non-source effect verification: ${boundedJson(
      context.pendingEffectVerificationScopes ?? [],
      1_000
    )}`,
    `Steering: ${boundedJson(context.steering.map(redactLocalPathsForConsumer), 2_000)}`,
    `Latest observation: ${boundedJson(
      conciseLatestObservation(context.latestObservation, budget === 'compact'),
      budget === 'compact' ? 10_000 : 12_000
    )}`,
    `Recent in-memory causal observations: ${boundedJson(
      budget === 'compact'
        ? []
        : conciseRecentObservations(context.recentObservations, context.latestObservation),
      budget === 'compact' ? 200 : 14_000
    )}`,
    `Recent causal session events: ${boundedJson(
      recentEvents,
      budget === 'compact' ? 1_500 : 6_000
    )}`,
    `Compacted earlier causal history: ${boundedJson(
      conciseEarlierCausalHistory(earlierEvents),
      budget === 'compact' ? 2_000 : 4_000
    )}`,
  ].join('\n');
}

function isModelContextLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /message exceeds token limit|context (?:length|window)|maximum context|too many tokens|prompt (?:is )?too (?:large|long)/i.test(
    message
  );
}

export class ContractStudioAgentModelAdapter implements StudioAgentModelAdapter {
  private conversation: StudioAgentConversationMessage[];
  private pendingResolution: StudioAgentModelResolution | undefined;
  private pendingToolCall:
    | { callId: string; name: string; input: Record<string, unknown> }
    | undefined;

  constructor(
    private readonly objective: string,
    private readonly complete: StudioAgentModelCompletion,
    restoredSession?: StudioAgentPersistedSession,
    initialConversation: StudioAgentConversationMessage[] = []
  ) {
    this.conversation = coherentConversationWindow(
      [
        ...initialConversation.map(redactConversationMessage),
        ...restoreStudioAgentNativeConversation(restoredSession).map(redactConversationMessage),
      ],
      10
    );
  }

  private conversationWindow(limit: number): StudioAgentConversationMessage[] {
    return coherentConversationWindow(this.conversation, limit);
  }

  consumeResolution(): StudioAgentModelResolution | undefined {
    const resolution = this.pendingResolution;
    this.pendingResolution = undefined;
    return resolution;
  }

  async next(context: StudioAgentModelContext): Promise<StudioAgentModelAction> {
    if (this.pendingToolCall) {
      const directObservation = [...(context.recentObservations ?? [])]
        .reverse()
        .find((observation) => observation.toolCallId === this.pendingToolCall?.callId);
      this.conversation.push({
        role: 'tool',
        toolResult: {
          callId: this.pendingToolCall.callId,
          name: this.pendingToolCall.name,
          content: boundedJson(
            {
              selectedTool: this.pendingToolCall.name,
              latestObservation: conciseLatestObservation(
                directObservation?.result ?? context.latestObservation
              ),
              recentObservations: conciseRecentObservations(
                context.recentObservations,
                context.latestObservation
              ),
            },
            24_000
          ),
        },
      });
      this.pendingToolCall = undefined;
    }
    const allowedTools = context.tools.map((tool) => tool.name);
    const request = {
      tools: [
        ...context.tools.map((tool) => ({
          name: tool.name,
          description: `${tool.description} Activity: ${tool.activity}. Risk: ${tool.risk}.`,
          inputSchema: tool.inputSchema,
        })),
        ...(context.session.executionPolicy?.toolMode === 'agent' ||
        context.session.executionPolicy?.toolMode === 'goal' ||
        (!context.session.executionPolicy &&
          (context.session.assistantMode === 'agent' || context.session.assistantMode === 'goal'))
          ? [
              {
                name: STUDIO_AGENT_REQUEST_INPUT_TOOL_NAME,
                description:
                  'Ask one concise blocking question only when essential scope or intent is missing and before any workspace mutation.',
                inputSchema: {
                  type: 'object',
                  required: ['question', 'reason'],
                  additionalProperties: false,
                  properties: {
                    question: { type: 'string', minLength: 1, maxLength: 1_000 },
                    reason: { type: 'string', minLength: 1, maxLength: 500 },
                  },
                },
              },
            ]
          : []),
        {
          name: STUDIO_AGENT_COMPLETE_TOOL_NAME,
          description:
            'Complete the current request only after its required non-blocking governed verification succeeded.',
          inputSchema: {
            type: 'object',
            required: ['summary'],
            additionalProperties: false,
            properties: { summary: { type: 'string', minLength: 1 } },
          },
        },
      ],
    };
    const standardPrompt = promptForTurn(context, this.objective);
    const requestWithConversation = (prompt: string, compact = false) => ({
      ...request,
      messages: [
        ...this.conversationWindow(compact ? 4 : 10),
        { role: 'user' as const, content: prompt },
      ],
    });
    let completionResponse: Awaited<ReturnType<StudioAgentModelCompletion>>;
    let contextOverflowRetries = 0;
    let prompt = standardPrompt;
    try {
      completionResponse = await this.complete(prompt, requestWithConversation(prompt));
    } catch (error) {
      if (!isModelContextLimitError(error)) {
        throw error;
      }
      // Context overflow is a transport constraint, not a blocker outcome.
      // Retry once with the same latest causal evidence, without replaying
      // historical observations that the active source inspection supersedes.
      contextOverflowRetries += 1;
      prompt = promptForTurn(context, this.objective, 'compact');
      completionResponse = await this.complete(prompt, requestWithConversation(prompt, true));
    }
    const resolution =
      typeof completionResponse === 'string' ? undefined : completionResponse.resolution;
    this.pendingResolution = resolution
      ? { ...resolution, attempts: resolution.attempts + contextOverflowRetries }
      : undefined;
    let response: string | StudioAgentNativeToolAction;
    if (typeof completionResponse === 'string') {
      response = completionResponse;
    } else if (isStudioAgentTextCompletion(completionResponse)) {
      response = completionResponse.text;
    } else {
      response = completionResponse;
    }
    this.conversation.push({ role: 'user', content: prompt });
    let selectedCallId: string | undefined;
    if (typeof response === 'string') {
      this.conversation.push({ role: 'assistant', content: response });
    } else {
      const callId = response.callId?.trim() || randomUUID();
      selectedCallId = callId;
      this.conversation.push({
        role: 'assistant',
        toolCall: {
          callId,
          name: response.toolName,
          input: response.input,
        },
      });
      this.pendingToolCall = {
        callId,
        name: response.toolName,
        input: response.input,
      };
    }
    if (this.conversation.length > 12) {
      this.conversation = this.conversationWindow(12);
    }
    if (typeof response !== 'string') {
      if (response.toolName === STUDIO_AGENT_COMPLETE_TOOL_NAME) {
        const summary = response.input.summary;
        return typeof summary === 'string' && summary.trim()
          ? { type: 'complete', summary: summary.trim() }
          : {
              type: 'message',
              text: 'The completion tool requires a non-empty summary.',
            };
      }
      if (response.toolName === STUDIO_AGENT_REQUEST_INPUT_TOOL_NAME) {
        const question = response.input.question;
        const reason = response.input.reason;
        return typeof question === 'string' &&
          question.trim() &&
          typeof reason === 'string' &&
          reason.trim()
          ? {
              type: 'input',
              question: boundedControlText(question, 1_000),
              reason: boundedControlText(reason, 500),
            }
          : {
              type: 'message',
              text: 'The structured input request requires a non-empty question and reason.',
            };
      }
      return allowedTools.includes(response.toolName)
        ? {
            type: 'tool',
            callId: selectedCallId,
            toolName: response.toolName,
            input: response.input,
            reason: `Model selected governed tool ${response.toolName}.`,
          }
        : {
            type: 'message',
            text: 'The model selected a tool outside the Studio Agent allowlist.',
          };
    }
    return parseStudioAgentModelAction({
      text: response,
      allowedTools,
    });
  }
}
