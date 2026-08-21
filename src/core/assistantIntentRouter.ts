import type { WorkspaiAssistantMode } from './assistantModeContract.js';
import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';

export const ASSISTANT_INTENT_ROUTE_TOOL = 'route-workspai-request' as const;

export type AssistantRequestIntent =
  | 'conversation'
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
};

export type AssistantIntentModelResult =
  | { type: 'tool'; toolName: string; input: Record<string, unknown> }
  | { type: 'text'; text: string };

export const ASSISTANT_INTENT_ROUTE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'confidence', 'normalizedRequest', 'userResponse', 'reason'],
  properties: {
    intent: {
      type: 'string',
      enum: ['conversation', 'question', 'engineering-task', 'goal', 'clarification'],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    normalizedRequest: { type: 'string', minLength: 1, maxLength: 2_000 },
    userResponse: { type: 'string', maxLength: 1_000 },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function bounded(value: string, maxLength: number): string {
  return redactLocalPathsForConsumer(value).trim().slice(0, maxLength);
}

export function parseAssistantIntentRoute(value: unknown): AssistantIntentRoute | null {
  if (!isRecord(value)) {
    return null;
  }
  const intents = new Set<AssistantRequestIntent>([
    'conversation',
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
  return {
    intent: value.intent as AssistantRequestIntent,
    confidence: value.confidence as AssistantIntentRoute['confidence'],
    normalizedRequest: bounded(value.normalizedRequest, 2_000),
    userResponse: bounded(value.userResponse, 1_000),
    reason: bounded(value.reason, 500),
  };
}

export function buildAssistantIntentRoutingPrompt(input: {
  task: string;
  selectedMode: WorkspaiAssistantMode;
  hasProjectScope: boolean;
}): string {
  return [
    'You are the intent router for Workspai Assistant.',
    'Classify the user request before any workspace tool, Goal command, scope selector, or source mutation can run.',
    `The user explicitly selected ${input.selectedMode.toUpperCase()} mode. Mode selection is authoritative; classification must never silently change it.`,
    `A project is ${input.hasProjectScope ? 'already selected' : 'not explicitly selected'}.`,
    '',
    'Call route-workspai-request exactly once with:',
    '- conversation: greeting, thanks, social text, joke, or other non-engineering chat.',
    '- question: a request for explanation, investigation, or an answer without an explicit source change.',
    '- engineering-task: a concrete code, configuration, test, documentation, or repair change.',
    '- goal: a durable outcome that should be tracked across multiple steps with explicit completion evidence.',
    '- clarification: engineering intent exists but the requested outcome or necessary target is too ambiguous to act safely.',
    '',
    'Important boundaries:',
    '- A greeting such as "hi" is conversation, never a Goal.',
    '- A code change can remain an Agent task; it is not automatically a Goal.',
    '- A numeric metric can be goal-like, but Agent mode must remain Agent unless the user explicitly selected Goal.',
    '- Classify independently of the selector. In Goal mode, the deterministic execution policy may bind either a clear engineering-task or a durable goal to Goal planning.',
    '- In Goal mode, question, conversation, and clarification must not create a Goal; userResponse should briefly guide the user.',
    '- For conversation or clarification, userResponse is the concise message shown directly to the user.',
    '- Do not solve the engineering task and do not call any workspace tools.',
    '',
    `User request: ${JSON.stringify(input.task.trim().slice(0, 4_000))}`,
  ].join('\n');
}

export async function routeAssistantIntent(input: {
  task: string;
  selectedMode: WorkspaiAssistantMode;
  hasProjectScope: boolean;
  complete: (input: {
    prompt: string;
    toolName: typeof ASSISTANT_INTENT_ROUTE_TOOL;
    toolSchema: typeof ASSISTANT_INTENT_ROUTE_TOOL_SCHEMA;
  }) => Promise<AssistantIntentModelResult>;
}): Promise<AssistantIntentRoute> {
  const prompt = buildAssistantIntentRoutingPrompt(input);
  const result = await input.complete({
    prompt,
    toolName: ASSISTANT_INTENT_ROUTE_TOOL,
    toolSchema: ASSISTANT_INTENT_ROUTE_TOOL_SCHEMA,
  });
  if (result.type === 'tool' && result.toolName === ASSISTANT_INTENT_ROUTE_TOOL) {
    const route = parseAssistantIntentRoute(result.input);
    if (route) {
      return route;
    }
  }

  const fallbackText = result.type === 'text' ? bounded(result.text, 1_000) : '';
  return {
    intent: 'clarification',
    confidence: 'low',
    normalizedRequest: input.task.trim().slice(0, 2_000) || 'Clarify the requested outcome.',
    userResponse:
      fallbackText ||
      (input.selectedMode === 'goal'
        ? 'What durable engineering outcome should this Goal achieve?'
        : 'What would you like me to change, investigate, or explain?'),
    reason: 'The model did not return a valid structured intent route, so Workspai failed closed.',
  };
}
