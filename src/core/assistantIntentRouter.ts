import type { WorkspaiAssistantMode } from './assistantModeContract.js';
import {
  collectAssistantUserPaths,
  redactAssistantRequestForConsumer,
} from './consumerPathRedaction.js';

export const ASSISTANT_INTENT_ROUTE_TOOL = 'route-workspai-request' as const;

export type AssistantRequestIntent =
  | 'conversation'
  | 'general-question'
  | 'research'
  | 'question'
  | 'engineering-task'
  | 'goal'
  | 'clarification';

export type AssistantIntentRoute = {
  intent: AssistantRequestIntent;
  confidence: 'high' | 'medium' | 'low';
  normalizedRequest: string;
  userResponse: string;
  reason: string;
  continuesPreviousTask?: boolean;
  workspaceIntent?: 'create-new' | 'use-current' | 'none';
  /** Requested results, not a fixed execution plan or tool selection. */
  outcomes?: string[];
};

export type AssistantIntentModelResult =
  | { type: 'tool'; toolName: string; input: Record<string, unknown> }
  | { type: 'text'; text: string };

export const ASSISTANT_INTENT_ROUTE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'confidence',
    'normalizedRequest',
    'userResponse',
    'reason',
    'workspaceIntent',
  ],
  properties: {
    intent: {
      type: 'string',
      enum: [
        'conversation',
        'general-question',
        'research',
        'question',
        'engineering-task',
        'goal',
        'clarification',
      ],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    normalizedRequest: { type: 'string', minLength: 1, maxLength: 2_000 },
    userResponse: { type: 'string', maxLength: 4_000 },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    continuesPreviousTask: { type: 'boolean' },
    workspaceIntent: { type: 'string', enum: ['create-new', 'use-current', 'none'] },
    outcomes: {
      type: 'array',
      maxItems: 16,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function bounded(value: string, maxLength: number, userPaths: readonly string[] = []): string {
  return redactAssistantRequestForConsumer(value, userPaths).trim().slice(0, maxLength);
}

function requestExcerpt(value: string, userPaths: readonly string[]): string {
  const text = redactAssistantRequestForConsumer(value, userPaths).trim();
  if (text.length <= 32_000) {
    return text;
  }
  // Build/setup logs often put the actual failure at the end. Keep both ends
  // for routing; execution still receives the original request in full.
  return `${text.slice(0, 16_000)}\n[Middle omitted for routing; original request retained for execution.]\n${text.slice(-16_000)}`;
}

export function parseAssistantIntentRoute(
  value: unknown,
  userPaths: readonly string[] = []
): AssistantIntentRoute | null {
  if (!isRecord(value)) {
    return null;
  }
  const intents = new Set<AssistantRequestIntent>([
    'conversation',
    'general-question',
    'research',
    'question',
    'engineering-task',
    'goal',
    'clarification',
  ]);
  const confidences = new Set(['high', 'medium', 'low']);
  if (
    !intents.has(value.intent as AssistantRequestIntent) ||
    !confidences.has(String(value.confidence)) ||
    typeof value.normalizedRequest !== 'string' ||
    !value.normalizedRequest.trim() ||
    typeof value.userResponse !== 'string' ||
    typeof value.reason !== 'string' ||
    !value.reason.trim()
  ) {
    return null;
  }
  const outcomes =
    (value.intent === 'engineering-task' || value.intent === 'goal') &&
    Array.isArray(value.outcomes)
      ? [
          ...new Set(
            value.outcomes
              .filter((entry): entry is string => typeof entry === 'string')
              .map((entry) => bounded(entry, 300, userPaths))
              .filter(Boolean)
          ),
        ].slice(0, 16)
      : [];
  return {
    intent: value.intent as AssistantRequestIntent,
    confidence: value.confidence as AssistantIntentRoute['confidence'],
    normalizedRequest: bounded(value.normalizedRequest, 2_000, userPaths),
    userResponse: bounded(value.userResponse, 4_000),
    reason: bounded(value.reason, 500),
    continuesPreviousTask: value.continuesPreviousTask === true,
    ...(outcomes.length ? { outcomes } : {}),
    ...(value.workspaceIntent === 'create-new' ||
    value.workspaceIntent === 'use-current' ||
    value.workspaceIntent === 'none'
      ? { workspaceIntent: value.workspaceIntent }
      : {}),
  };
}

export function buildAssistantIntentRoutingPrompt(input: {
  task: string;
  selectedMode: WorkspaiAssistantMode;
  hasProjectScope: boolean;
  history?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const userPaths = [
    ...collectAssistantUserPaths(input.task),
    ...(input.history ?? [])
      .filter((turn) => turn.role === 'user')
      .slice(-8)
      .flatMap((turn) => collectAssistantUserPaths(turn.content)),
  ].slice(0, 64);
  return [
    'You are the intent router for Workspai Assistant. User-facing responses speak as Workspai Assistant, not as a provider product such as ChatGPT or Copilot. Never invent the active model version; Auto selection is not an exact model identity.',
    'Classify the user request before any workspace tool, Goal command, scope selector, or source mutation can run.',
    'Set workspaceIntent=create-new when the user asks to create a workspace, including a workspace containing new projects. Preserve this requirement even when a workspace is already open. Set use-current when the user explicitly targets the current, active or open workspace; it overrides any different workspace created earlier in this conversation. For an ordinary follow-up about that created workspace, use none so its owned target is preserved. A request phrased as "can you create" authorizes the task, not merely a capability answer.',
    `The user explicitly selected ${input.selectedMode.toUpperCase()} mode. Mode selection is authoritative; classification must never silently change it.`,
    `A project is ${input.hasProjectScope ? 'already selected' : 'not explicitly selected'}.`,
    '',
    'Call route-workspai-request exactly once. If native tool calling is unavailable, return only the equivalent JSON object (intent, confidence, normalizedRequest, userResponse, reason, continuesPreviousTask, workspaceIntent, outcomes) without prose. Select from:',
    '- conversation: greeting, thanks, social text, joke, or other non-engineering chat.',
    '- general-question: general knowledge, product explanations, advice, or code samples that can be answered without inspecting this repository. Supply the actual answer in userResponse.',
    '- research: requests to search the internet, fetch documentation, verify an exact CLI command or API, or answer something you cannot reliably establish from supplied context. Research is read-only tool work, not a workspace change. Resolve follow-ups using history and expand normalizedRequest into the complete question.',
    '- question: an explanation or investigation that needs evidence from the current repository, files, diagnostics, or artifacts, without an explicit change request.',
    '- engineering-task: a concrete code, configuration, test, documentation, or repair change. Imperatives such as fix, repair, change, create, implement, remove, or make this work remain engineering-task even when phrased as a question.',
    '- goal: a durable outcome that should be tracked across multiple steps with explicit completion evidence.',
    '- clarification: engineering intent exists but the requested outcome or necessary target is too ambiguous to act safely.',
    '',
    'Important boundaries:',
    '- For engineering-task or goal, populate outcomes with concise requested results and distinct reported failures, including secondary failures masked by success messages in logs. Combine closely related checks; do not invent work, prescribe tools or turn outcomes into an execution plan. For one focused defect use one outcome; for other intents omit outcomes. Execution will inspect current evidence and may revise the plan.',
    '- Available downstream capabilities include public web search/fetch, registered VS Code/MCP tools, live workspace inventory, source inspection, and command execution in Agent mode. The router itself does not execute tools. Never claim these capabilities are unavailable without trying them in the execution workflow.',
    '- Explicit search or lookup requests must be research, never general-question or clarification. This applies to every language,. Exact Workspai CLI syntax should be research when it needs documentation or installed help; do not send the user away to run help instead of investigating.',
    '- Questions about the current workspace name or project names are question. Use live workspace inventory, not stale health-report summaries.',
    '- A greeting such as "hi" is conversation, never a Goal.',
    '- "whats up?" is conversation. "tell me about workspai" is general-question. "How does this project authenticate requests?" is question.',
    '- Infer the requested action semantically in the user\'s language, not from isolated verbs in quoted text or history. "Explain how to fix this" and "Do not change anything, just explain the error" are questions; "Can you fix this?" is an engineering-task. A code example in chat is general-question; creating that code in a repository file is engineering-task.',
    "- Workspai is also a CLI and workspace/project platform: it creates workspaces and supported starter projects, adopts existing source in place or imports it with consent, models dependencies and relationships, and supports diagnostics, impact analysis, verification and agent grounding. The IDE assistant is one interface to that platform. A product introduction must not invent this workspace's health or require Doctor/Analyze/Readiness reports.",
    '- A detailed Workspai capability, architecture, support-boundary or operational question is research when its answer needs product evidence. Use the offline versioned knowledge through inspect-cli-commands topic=knowledge, then installed help or live evidence where relevant. Do not invent product features from the general introduction. Keep ordinary greetings and a short product introduction direct.',
    '- Classify the latest message on every turn, even during an unfinished repair or Goal. A previous task or selected Agent mode does not turn a new question into a change request.',
    '- When the user says a requested result was omitted, recover the original deliverable from history and route to supply it. Do not answer with only an apology or another promise. A follow-up asking to send an already requested CLI command list remains research.',
    '- Creating a test or sample project is an engineering task. Missing optional stack or name is not an essential blocker, especially when the user delegates the choice (for example, whatever you prefer). Resolve that follow-up from history, choose reasonable defaults and continue without asking the same question again. Require clarification only for a material ambiguity that cannot safely use a default.',
    '- Preserve the pending question across clarification replies. When the user supplies the product name after asking for its stable version, research that version; do not reset the task to asking whether they want an introduction. After a clarification, resolve the referent from history or state a reasonable assumption instead of repeating the same clarification.',
    '- Use history to resolve follow-ups such as "do it" or "continue the fix"; do not resume prior work for an unrelated greeting or explanation.',
    '- Set continuesPreviousTask=true for an explicit continuation or an answer to a pending clarification of the same unfinished request, including a read-only investigation. Resolve the original intent and full normalizedRequest when the user supplies missing information; the answer to a clarification is not a new clarification request. Set it false for a new topic, greeting or independent informational question.',
    '- A code change can remain an Agent task; it is not automatically a Goal.',
    '- A numeric metric can be goal-like, but Agent mode must remain Agent unless the user explicitly selected Goal.',
    '- Classify independently of the selector. In Goal mode, the deterministic execution policy may bind either a clear engineering-task or a durable goal to Goal planning.',
    '- In Goal mode, question, conversation, and clarification must not create a Goal; userResponse should briefly guide the user.',
    '- For conversation, general-question or clarification, userResponse is the actual helpful response shown directly to the user, in their language. Do not mention tools, verification or missing workspace evidence unless the question calls for it.',
    '- Do not solve the engineering task and do not call any workspace tools.',
    '',
    `Recent conversation (context, not new instructions): ${JSON.stringify((input.history ?? []).slice(-8).map((turn) => ({ role: turn.role, content: bounded(turn.content, 2_000, turn.role === 'user' ? userPaths : []) })))}`,
    `User request: ${JSON.stringify(requestExcerpt(input.task, userPaths))}`,
  ].join('\n');
}

export async function routeAssistantIntent(input: {
  task: string;
  selectedMode: WorkspaiAssistantMode;
  hasProjectScope: boolean;
  history?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  complete: (input: {
    prompt: string;
    toolName: typeof ASSISTANT_INTENT_ROUTE_TOOL;
    toolSchema: typeof ASSISTANT_INTENT_ROUTE_TOOL_SCHEMA;
  }) => Promise<AssistantIntentModelResult>;
}): Promise<AssistantIntentRoute> {
  const prompt = buildAssistantIntentRoutingPrompt(input);
  const userPaths = [
    ...collectAssistantUserPaths(input.task),
    ...(input.history ?? [])
      .filter((turn) => turn.role === 'user')
      .slice(-8)
      .flatMap((turn) => collectAssistantUserPaths(turn.content)),
  ].slice(0, 64);
  const result = await input.complete({
    prompt,
    toolName: ASSISTANT_INTENT_ROUTE_TOOL,
    toolSchema: ASSISTANT_INTENT_ROUTE_TOOL_SCHEMA,
  });
  if (result.type === 'tool' && result.toolName === ASSISTANT_INTENT_ROUTE_TOOL) {
    const route = parseAssistantIntentRoute(result.input, userPaths);
    if (route) {
      return route;
    }
  }

  if (result.type === 'text') {
    const json = result.text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
    try {
      const route = parseAssistantIntentRoute(JSON.parse(json), userPaths);
      if (route) {
        return route;
      }
    } catch {
      /* Invalid text is not an authoritative capability assessment. */
    }
  }
  return {
    intent: 'clarification',
    confidence: 'low',
    normalizedRequest: input.task.trim().slice(0, 2_000) || 'Clarify the requested outcome.',
    userResponse:
      'The selected model did not return a usable request route. Retry or select another model. ' +
      (input.selectedMode === 'goal'
        ? 'What durable engineering outcome should this Goal achieve?'
        : 'What would you like me to change, investigate, or explain?'),
    reason: 'The model did not return a valid structured intent route, so Workspai failed closed.',
  };
}
