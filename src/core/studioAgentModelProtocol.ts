import { randomUUID } from 'node:crypto';

import type { AIMessage } from './aiService.js';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type {
  StudioAgentModelAction,
  StudioAgentModelAdapter,
  StudioAgentModelContext,
} from './studioAgentSession.js';
import {
  getWorkspaceIntelligenceCanonicalStages,
  getWorkspaceIntelligenceChainInvariant,
  getWorkspaceIntelligenceExecutionPreflights,
} from './workspaceIntelligenceChainContract.js';

export const STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION =
  'workspai.studio-agent-model-action.v1' as const;
export const STUDIO_AGENT_COMPLETE_TOOL_NAME = 'workspai-complete' as const;

export type StudioAgentNativeToolAction = {
  callId?: string;
  toolName: string;
  input: Record<string, unknown>;
};

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
      content: boundedText(
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
      { role: 'assistant', toolCall: { callId, name, input: toolInput } },
      {
        role: 'tool',
        toolResult: {
          callId,
          name,
          content: boundedJson(
            {
              ok: terminal.type === 'tool.completed',
              ...terminalPayload,
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
) => Promise<string | StudioAgentNativeToolAction>;

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
        path: entry.path,
        sha256: entry.sha256,
        truncated: entry.truncated,
        content: boundedText(String(entry.content), options.sourceContentLimit ?? 6_000),
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
  return Object.fromEntries(
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
      'unresolvedProjects',
      'processedProjects',
      'projectNames',
      'clearedProjects',
      'fallbackCapability',
      'recommendedTools',
      'recommendedActions',
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
    ]
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]])
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
    error: value.error ? boundedText(value.error, 3_000) : undefined,
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
    input: observation.input,
    ok: observation.result.ok,
    changed: observation.result.changed,
    cardBlocking: observation.result.cardBlocking,
    blockerSignature: observation.result.blockerSignature,
    error: observation.result.error ? boundedText(observation.result.error, 1_600) : undefined,
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
    input: data.input,
    ok: data.ok,
    changed: data.changed,
    intelligencePhase: data.intelligencePhase,
    cardBlocking: data.cardBlocking,
    evidenceGeneration: data.evidenceGeneration,
    blockerSignature: data.blockerSignature,
    error: typeof data.error === 'string' ? boundedText(data.error, 1_200) : undefined,
    summary: typeof data.summary === 'string' ? boundedText(data.summary, 600) : undefined,
    output: conciseToolOutput(data.output),
  };
}

export function parseStudioAgentModelAction(input: {
  text: string;
  allowedTools: readonly string[];
}): StudioAgentModelAction {
  const value = exactJson(input.text);
  if (
    !value ||
    value.schemaVersion !== STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION ||
    typeof value.action !== 'string'
  ) {
    return {
      type: 'message',
      text: 'The model response did not satisfy the Studio Agent action contract.',
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
  const recentEvents = context.session.events
    .filter(
      (event) =>
        event.type === 'request.steered' ||
        event.type === 'model.checkpoint' ||
        event.type === 'tool.completed' ||
        event.type === 'tool.failed' ||
        event.type === 'verify.completed'
    )
    .slice(budget === 'compact' ? -2 : -8)
    .map(conciseCausalEvent);
  const mode = context.session.assistantMode;
  const intelligenceLoop = getWorkspaceIntelligenceCanonicalStages().map(
    ({ id, label, phase }) => ({ id, label, phase })
  );
  const intelligencePreflights = getWorkspaceIntelligenceExecutionPreflights().map(
    ({ id, label, purpose }) => ({ id, label, purpose })
  );
  const modeInstructions =
    mode === 'agent'
      ? [
          'Own the task from evidence inspection through source change and final verification.',
          'When the session includes a verified goal, treat its scope, constraints, baseline, and criteria as the authoritative definition of done. Continue until verify-goal returns state=verified; a plausible patch, higher metric, or successful single command is not completion.',
          'Verified goals are resumable transactions. Never weaken their target, disable required build/tests, enable force, or permit breaking changes unless the durable goal contract already authorizes it.',
          'Never delegate a resolvable step to the operator. Never claim completion while governed verification is required and still blocking.',
          'Treat .workspai reports as generated evidence: never patch them directly. Run their governed producer, then continue through every downstream gate required by the refreshed blocker.',
          'Prefer the workspaceIntelligenceChain governed command when the complete evidence chain must be regenerated. It is the contract-owned authority for stage order, dependencies, verdict propagation, and downstream artifacts.',
          'The unified intelligence chain does not replace card-specific producers. When a remediation plan is missing or stale, run workspaceRemediationPlan first; use workspaceIntelligenceChain only after source repair or when the complete canonical evidence chain must be refreshed.',
          'The canonical Workspace Intelligence stages below are immutable. Never reorder, skip, append, or substitute stages. Execution prerequisites are reported separately and never become chain stages. Auxiliary capabilities may repair the source needed to pass a stage, but they never become chain stages.',
          'After a source mutation, the runtime classifies the change before canonical verification. Dependency edits must first close their manifest/lockfile reconciliation, focused audit, declared tests, and declared build transaction; other edits proceed directly to the complete Workspace Intelligence chain. Use the available governed or general workspace tools to repair the currently failing milestone, then let the runtime prove closure.',
          'Use individual governed producers only for a diagnosed source artifact or a targeted recovery, then run the unified chain before completion.',
          'Repair source manifests, configuration, or project files when evidence identifies a source defect; use governed commands only to regenerate evidence and verify the result.',
          'You have a general workspace capability plane. Discover files, inspect exact source, inspect diagnostics and diffs, run structured no-shell project commands, and create, replace, or delete source through SHA-protected rollback transactions. Use these tools for arbitrary project types instead of waiting for a blocker-specific tool.',
          'A source file becomes patch-authorized after inspect-source returns its sha256. Search results alone are not edit authorization. Review changed files with inspect-workspace-changes when the effect of a command or patch is uncertain.',
          'Use run-workspace-command for project-native diagnosis, tests, builds, formatting, and dependency operations. Choose the narrowest cwd and purpose; never ask the operator to run a command that this tool can execute.',
          'When a blocker has a CLI-authored remediation plan, inspect the current plan and execute eligible steps by stepId. Never emit an unstructured shell string; use the structured workspace command tool when the plan does not cover the diagnosed source cause.',
          'For a dependency vulnerability blocker, process every vulnerable project named by fresh Doctor evidence. Inspect each project once, run its bounded non-force repair once, and follow the returned nextAction. Never omit sibling projects from a workspace-scoped blocker. When upgradeCandidates are present, call upgrade-dependency-security with that exact direct package. The session controller, not the model, owns transaction closure, rollback evidence, the canonical intelligence chain, and final verification.',
          'When a blocker accelerator returns general-source-repair, no-safe-upgrade, a no-op, or a breaking/downgrade-only candidate, that accelerator is exhausted for the current causal generation. Do not call it again. Move to the general capability plane: inspect exact manifests and compatibility constraints, use structured project-native commands to discover admissible versions or alternatives, apply a SHA-protected source transaction, then build, test, audit, run the unified chain, and verify.',
          'Dependency source repair is runtime-native, not npm-specific. Use the Doctor-authored audit invocation and the detected manifest plus lock/baseline for Node, Python, Go, Rust, JVM, PHP, Ruby, .NET, Elixir, Deno, Bun, or native projects. Before requesting a breaking decision, perform one bounded compatibility investigation of the affected package, its owning direct dependency, admissible constraint or override support, and available replacement path.',
          'During an active general-source-repair phase, do not run Doctor, Readiness, Verify, remediation-plan, or Workspace Intelligence commands through run-workspace-command. The runtime has intentionally locked those evidence producers until you make a real source change.',
          'A project-native diagnostic such as npm audit commonly exits non-zero because it found a problem. Treat its stdout/stderr as causal evidence, not as permission to rerun the same command. Inspect the authorized manifest, choose a compatible source-level resolution, and apply one patch transaction.',
          'For local Workspai CLI execution through npx, the only valid shape is executable npx with --no-install followed by workspai and its arguments. Never use a bare npx doctor/readiness/verify invocation.',
          'Never repeat an inspection, audit, remediation, or verify action against the same causal evidence generation. Reuse the prior observation and advance to a different causal action.',
          'Never retry a failed bounded dependency repair. Do not hand-edit a package-manager lockfile. Use upgrade-dependency-security for a fresh audit-authorized direct dependency candidate.',
          'Blocker-specific tools are optional accelerators, not capability boundaries. If an accelerator does not cover the diagnosed project or error, continue with discovery, diagnostics, inspected edits, project-native commands, diff review, and governed verification.',
          'Treat failed verification as a new observation: follow its causal blockers, repair every related Workspace Intelligence card, rerun the unified chain, and verify again.',
          'One repair session owns the complete incident graph, not only the card that opened it. When verification returns activeHandoff or incidentGraph, treat the first blocking card as the current objective and continue until the graph is resolved.',
          'Recent in-memory observations preserve bounded inspected source for the current run. Reuse that content to patch or run the next causal diagnostic; do not re-inspect a file merely because another tool ran afterward.',
        ]
      : mode === 'plan'
        ? [
            'Produce an evidence-backed implementation plan. Do not modify files or run mutating commands.',
            'Inspect enough source and governed evidence to make the plan concrete, then complete with the plan as the summary.',
          ]
        : [
            'Answer from inspected source and governed evidence. Do not modify files or run mutating commands.',
            'Inspect enough evidence to answer accurately, then complete with the final answer as the summary.',
          ];
  return [
    `You are Workspai Assistant operating in ${mode.toUpperCase()} mode inside one trusted workspace.`,
    ...modeInstructions,
    'Select exactly one provided native tool per turn.',
    'If native tool calling is unavailable, use exactly one JSON action with no markdown or prose.',
    `Action schema: ${STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION}`,
    'Tool action: {"schemaVersion":"workspai.studio-agent-model-action.v1","action":"tool","toolName":"...","input":{},"reason":"..."}',
    'Completion action: {"schemaVersion":"workspai.studio-agent-model-action.v1","action":"complete","summary":"..."}',
    `Objective: ${boundedText(objective, 5_000)}`,
    `Workspace: ${context.session.workspacePath}`,
    `Scope: ${context.session.cardId}`,
    `Blocker signature: ${context.session.blockerSignature ?? 'unknown'}`,
    `Verified engineering goal: ${boundedJson(context.session.goal ?? null, 5_000)}`,
    `Canonical Workspace Intelligence invariant: ${getWorkspaceIntelligenceChainInvariant()}`,
    `Execution prerequisites outside the canonical loop: ${boundedJson(
      intelligencePreflights,
      2_000
    )}`,
    `Canonical Workspace Intelligence stages: ${boundedJson(intelligenceLoop, 4_000)}`,
    `Tools: ${boundedJson(
      context.tools.map(({ name, title, activity, risk }) => ({ name, title, activity, risk })),
      4_000
    )}`,
    `Source repair phase: ${
      context.sourceRepairDirective
        ? `ACTIVE. Evidence refresh, verify, remediation-plan, and exhausted blocker accelerators are intentionally withheld until a real source transaction occurs. Directive: ${boundedJson(
            conciseToolOutput(context.sourceRepairDirective),
            budget === 'compact' ? 3_000 : 8_000
          )}`
        : 'inactive'
    }`,
    `Source action required: ${
      context.sourceActionRequired
        ? 'YES. Repeated inspection has exhausted the bounded read budget. Select one available change tool that advances the repair transaction; do not rerun Doctor, Verify, or another inspection.'
        : 'no'
    }`,
    `Steering: ${boundedJson(context.steering, 2_000)}`,
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
  private pendingToolCall:
    | { callId: string; name: string; input: Record<string, unknown> }
    | undefined;

  constructor(
    private readonly objective: string,
    private readonly complete: StudioAgentModelCompletion,
    restoredSession?: StudioAgentPersistedSession
  ) {
    this.conversation = restoreStudioAgentNativeConversation(restoredSession);
  }

  private conversationWindow(limit: number): StudioAgentConversationMessage[] {
    return coherentConversationWindow(this.conversation, limit);
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
    let response: Awaited<ReturnType<StudioAgentModelCompletion>>;
    let prompt = standardPrompt;
    try {
      response = await this.complete(prompt, requestWithConversation(prompt));
    } catch (error) {
      if (!isModelContextLimitError(error)) {
        throw error;
      }
      // Context overflow is a transport constraint, not a blocker outcome.
      // Retry once with the same latest causal evidence, without replaying
      // historical observations that the active source inspection supersedes.
      prompt = promptForTurn(context, this.objective, 'compact');
      response = await this.complete(prompt, requestWithConversation(prompt, true));
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
