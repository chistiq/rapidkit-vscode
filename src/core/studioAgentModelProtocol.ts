import type {
  StudioAgentModelAction,
  StudioAgentModelAdapter,
  StudioAgentModelContext,
} from './studioAgentSession.js';
import {
  getWorkspaceIntelligenceChainInvariant,
  getWorkspaceIntelligenceExecutionMilestones,
} from './workspaceIntelligenceChainContract.js';

export const STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION =
  'workspai.studio-agent-model-action.v1' as const;
export const STUDIO_AGENT_COMPLETE_TOOL_NAME = 'workspai-complete' as const;

export type StudioAgentNativeToolAction = {
  toolName: string;
  input: Record<string, unknown>;
};

export type StudioAgentModelCompletion = (
  prompt: string,
  request: {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
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

function conciseToolOutput(value: unknown): unknown {
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
      .slice(0, 4);
    if (sourceEntries.length > 0) {
      return sourceEntries.map((entry) => ({
        path: entry.path,
        sha256: entry.sha256,
        truncated: entry.truncated,
        content: boundedText(String(entry.content), 6_000),
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
      'auditExitCode',
      'auditSummary',
      'command',
      'target',
      'appliedCount',
      'changedPaths',
      'upgradeCandidates',
      'resolutionCandidates',
      'blockedCandidates',
      'fallbackCapability',
      'recommendedTools',
      'exhaustedTools',
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

function conciseLatestObservation(value: StudioAgentModelContext['latestObservation']): unknown {
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
    output: conciseToolOutput(value.output),
  };
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

function promptForTurn(context: StudioAgentModelContext, objective: string): string {
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
    .slice(-8)
    .map(conciseCausalEvent);
  const mode = context.session.assistantMode;
  const intelligenceLoop = getWorkspaceIntelligenceExecutionMilestones().map(
    ({ id, kind, label }) => ({ id, kind, label })
  );
  const modeInstructions =
    mode === 'agent'
      ? [
          'Own the task from evidence inspection through source change and final verification.',
          'Never delegate a resolvable step to the operator. Never claim completion while governed verification is required and still blocking.',
          'Treat .workspai reports as generated evidence: never patch them directly. Run their governed producer, then continue through every downstream gate required by the refreshed blocker.',
          'Prefer the workspaceIntelligenceChain governed command when the complete evidence chain must be regenerated. It is the contract-owned authority for stage order, dependencies, verdict propagation, and downstream artifacts.',
          'The canonical Workspace Intelligence milestones below are immutable. Never reorder, skip, append, or substitute stages. Auxiliary capabilities may repair the source needed to pass a milestone, but they never become chain stages.',
          'After every source mutation, the runtime will execute the complete canonical chain. Use any available governed or general workspace tool to repair the currently failing milestone, then let the unified chain prove closure.',
          'Use individual governed producers only for a diagnosed source artifact or a targeted recovery, then run the unified chain before completion.',
          'Repair source manifests, configuration, or project files when evidence identifies a source defect; use governed commands only to regenerate evidence and verify the result.',
          'You have a general workspace capability plane. Discover files, inspect exact source, inspect diagnostics and diffs, run structured no-shell project commands, and create, replace, or delete source through SHA-protected rollback transactions. Use these tools for arbitrary project types instead of waiting for a blocker-specific tool.',
          'A source file becomes patch-authorized after inspect-source returns its sha256. Search results alone are not edit authorization. Review changed files with inspect-workspace-changes when the effect of a command or patch is uncertain.',
          'Use run-workspace-command for project-native diagnosis, tests, builds, formatting, and dependency operations. Choose the narrowest cwd and purpose; never ask the operator to run a command that this tool can execute.',
          'When a blocker has a CLI-authored remediation plan, inspect the current plan and execute eligible steps by stepId. Never emit an unstructured shell string; use the structured workspace command tool when the plan does not cover the diagnosed source cause.',
          'For a dependency vulnerability blocker, inspect once, run the bounded non-force repair once, and follow the returned nextAction. When upgradeCandidates are present, call upgrade-dependency-security with that exact direct package; it owns manifest, lockfile, rollback, chain, and verify.',
          'When a blocker accelerator returns general-source-repair, no-safe-upgrade, a no-op, or a breaking/downgrade-only candidate, that accelerator is exhausted for the current causal generation. Do not call it again. Move to the general capability plane: inspect exact manifests and compatibility constraints, use structured project-native commands to discover admissible versions or alternatives, apply a SHA-protected source transaction, then build, test, audit, run the unified chain, and verify.',
          'Never repeat an inspection, audit, remediation, or verify action against the same causal evidence generation. Reuse the prior observation and advance to a different causal action.',
          'Never retry a failed bounded dependency repair. Do not hand-edit a package-manager lockfile. Use upgrade-dependency-security for a fresh audit-authorized direct dependency candidate.',
          'Blocker-specific tools are optional accelerators, not capability boundaries. If an accelerator does not cover the diagnosed project or error, continue with discovery, diagnostics, inspected edits, project-native commands, diff review, and governed verification.',
          'Treat failed verification as a new observation: follow its causal blockers, repair every related Workspace Intelligence card, rerun the unified chain, and verify again.',
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
    `Canonical Workspace Intelligence invariant: ${getWorkspaceIntelligenceChainInvariant()}`,
    `Canonical Workspace Intelligence execution: ${boundedJson(intelligenceLoop, 4_000)}`,
    `Tools: ${boundedJson(
      context.tools.map(({ name, title, activity, risk }) => ({ name, title, activity, risk })),
      4_000
    )}`,
    `Steering: ${boundedJson(context.steering, 2_000)}`,
    `Latest observation: ${boundedJson(conciseLatestObservation(context.latestObservation), 12_000)}`,
    `Recent causal session events: ${boundedJson(recentEvents, 6_000)}`,
  ].join('\n');
}

export class ContractStudioAgentModelAdapter implements StudioAgentModelAdapter {
  constructor(
    private readonly objective: string,
    private readonly complete: StudioAgentModelCompletion
  ) {}

  async next(context: StudioAgentModelContext): Promise<StudioAgentModelAction> {
    const allowedTools = context.tools.map((tool) => tool.name);
    const response = await this.complete(promptForTurn(context, this.objective), {
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
    });
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
