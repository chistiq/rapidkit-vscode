import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';
import { listExecutableCreateTargets } from '../contracts/createPlannerCapabilities.js';

export const CREATE_INTENT_ROUTE_TOOL = 'route-workspai-create-request' as const;

export type CreateRequestIntent =
  | 'conversation'
  | 'question'
  | 'clarification'
  | 'create'
  | 'adopt-project'
  | 'import-project'
  | 'import-workspace'
  | 'assistant-task';

export type CreateGuidanceAction =
  | 'none'
  | 'plan-workspace'
  | 'plan-project'
  | 'adopt-project'
  | 'import-project'
  | 'import-workspace'
  | 'continue-in-agent';

export type CreateIntentRoute = {
  intent: CreateRequestIntent;
  confidence: 'high' | 'medium' | 'low';
  normalizedRequest: string;
  userResponse: string;
  reason: string;
  recommendedAction: CreateGuidanceAction;
  creationTarget?: 'workspace' | 'project';
};

export type CreateIntentModelResult =
  | { type: 'tool'; toolName: string; input: Record<string, unknown> }
  | { type: 'text'; text: string };

export const CREATE_INTENT_ROUTE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'confidence',
    'normalizedRequest',
    'userResponse',
    'reason',
    'recommendedAction',
    'creationTarget',
  ],
  properties: {
    intent: {
      type: 'string',
      enum: [
        'conversation',
        'question',
        'clarification',
        'create',
        'adopt-project',
        'import-project',
        'import-workspace',
        'assistant-task',
      ],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    normalizedRequest: { type: 'string', minLength: 1, maxLength: 2_000 },
    userResponse: { type: 'string', maxLength: 1_000 },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    creationTarget: {
      type: 'string',
      enum: ['workspace', 'project', 'unspecified'],
      description:
        'For create: resolve the destination from the user request; use the selector only when the request leaves it unspecified. For other intents use unspecified.',
    },
    recommendedAction: {
      type: 'string',
      enum: [
        'none',
        'plan-workspace',
        'plan-project',
        'adopt-project',
        'import-project',
        'import-workspace',
        'continue-in-agent',
      ],
    },
  },
} as const;

const CREATE_INTENTS = new Set<CreateRequestIntent>([
  'conversation',
  'question',
  'clarification',
  'create',
  'adopt-project',
  'import-project',
  'import-workspace',
  'assistant-task',
]);
const CREATE_ACTIONS = new Set<CreateGuidanceAction>([
  'none',
  'plan-workspace',
  'plan-project',
  'adopt-project',
  'import-project',
  'import-workspace',
  'continue-in-agent',
]);
const EXPLICIT_CREATE_PATTERN = /\b(create|scaffold|bootstrap|generate|start|set up|build)\b/i;
const CREATE_TARGET_PATTERN =
  /\b(workspace|project|application|app|service|website|web app|storefront|frontend|backend|api|ai agent|agent workflow|automation bot)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function bounded(value: string, maxLength: number): string {
  return redactLocalPathsForConsumer(value).trim().slice(0, maxLength);
}

function safeName(value: string | undefined): string {
  return bounded(value ?? '', 100) || 'none';
}

export function parseCreateIntentRoute(value: unknown): CreateIntentRoute | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !CREATE_INTENTS.has(value.intent as CreateRequestIntent) ||
    !['high', 'medium', 'low'].includes(String(value.confidence)) ||
    typeof value.normalizedRequest !== 'string' ||
    !value.normalizedRequest.trim() ||
    typeof value.userResponse !== 'string' ||
    typeof value.reason !== 'string' ||
    !value.reason.trim() ||
    !CREATE_ACTIONS.has(value.recommendedAction as CreateGuidanceAction) ||
    (value.creationTarget !== undefined &&
      !['workspace', 'project', 'unspecified'].includes(String(value.creationTarget)))
  ) {
    return null;
  }
  const intent = value.intent as CreateRequestIntent;
  const proposedAction = value.recommendedAction as CreateGuidanceAction;
  const fixedActions: Partial<Record<CreateRequestIntent, CreateGuidanceAction>> = {
    conversation: 'none',
    question: 'none',
    clarification: 'none',
    create: 'none',
    'adopt-project': 'adopt-project',
    'import-project': 'import-project',
    'import-workspace': 'import-workspace',
    'assistant-task': 'continue-in-agent',
  };
  const recommendedAction =
    fixedActions[intent] ??
    (proposedAction === 'none' ||
    proposedAction === 'plan-workspace' ||
    proposedAction === 'plan-project'
      ? proposedAction
      : 'none');
  return {
    intent,
    confidence: value.confidence as CreateIntentRoute['confidence'],
    normalizedRequest: bounded(value.normalizedRequest, 2_000),
    userResponse: bounded(value.userResponse, 1_000),
    reason: bounded(value.reason, 500),
    recommendedAction,
    ...(intent === 'create' &&
    (value.creationTarget === 'workspace' || value.creationTarget === 'project')
      ? { creationTarget: value.creationTarget }
      : {}),
  };
}

export function buildCreateIntentRoutingPrompt(input: {
  request: string;
  selectedTarget: 'workspace' | 'project';
  stackFocus?: string;
  workspaceName?: string;
  projectName?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const executableCreateTargets = listExecutableCreateTargets().join(', ');
  const history = (input.history ?? [])
    .slice(-8)
    .map((entry) => `${entry.role}: ${bounded(entry.content, 500)}`)
    .join('\n');
  return [
    'You are the intent and navigation router for the Workspai Create tab.',
    'Your only job is to understand the request and choose the correct product path before any planner, filesystem write, package manager, or workspace command runs.',
    '',
    'Workspai architecture you must respect:',
    '- Workspai is workspace-first: one canonical workspace owns registered projects, model, graph, evidence, goals, skills, repair, and verification.',
    '- Create can scaffold a new canonical workspace plus its first project, or scaffold one project into the active canonical workspace explicitly selected by the user.',
    '- Adopt links existing source into a workspace without moving or copying it. Import consumes an existing Workspai project/workspace or supported archive.',
    '- Arbitrary edits to existing source belong in Assistant Agent, where changes are evidence-bound, reviewable, rollback-aware, and verified.',
    `- Executable create targets from the canonical capability contract: ${executableCreateTargets}.`,
    '- Unsupported stacks must never be translated into an unrelated kit. Guide the user to an empty workspace plus adopt/import when appropriate.',
    '- A creation plan is always previewed and requires explicit approval before mutation.',
    '',
    'Current Create context:',
    `- Selected target: ${input.selectedTarget}. This selector is a default, not authority over an explicit destination in the user request.`,
    `- Selected workspace: ${safeName(input.workspaceName)}.`,
    `- Selected project: ${safeName(input.projectName)}.`,
    `- Stack focus: ${safeName(input.stackFocus)}.`,
    '',
    'Call route-workspai-create-request exactly once:',
    '- create: the user clearly wants a new workspace, project, application, API, service, frontend, backend, desktop app, AI agent, or extension scaffolded.',
    '- adopt-project: the user wants existing local source linked into Workspai.',
    '- import-project: the user wants an existing Workspai project or supported project artifact imported.',
    '- import-workspace: the user wants an existing Workspai workspace or archive imported.',
    '- assistant-task: the user wants code, configuration, tests, documentation, investigation, or repair in existing source rather than a new scaffold.',
    '- question: the user is asking how Create or Workspai works and does not yet request execution.',
    '- conversation: greeting, thanks, social text, joke, or unrelated chat.',
    '- clarification: creation may be intended, but the desired outcome is too ambiguous to draft a trustworthy plan.',
    '',
    'Routing rules:',
    '- Never convert a greeting, generic question, or vague phrase into FastAPI or any other default stack.',
    '- Intent routing is not solution discovery. A clear product outcome such as a shop web app, internal API, or desktop client is already a high-confidence create request; the user does not need to know a framework, database, feature list, authentication design, or deployment target.',
    '- When the user asks for your suggestion, says they do not know, asks you to decide, or otherwise delegates technical choices, select create with high confidence and preserve that delegation in normalizedRequest. The planner owns safe stack and starter-feature recommendations.',
    '- Never repeat a clarification already present in Recent Create conversation. Ask at most one question in the entire Create session; after that, use explicit user intent plus conservative executable defaults and produce a reviewable plan.',
    '- For create, normalizedRequest must be a self-contained creation brief using the current conversation; use high confidence only when a trustworthy plan can be drafted.',
    '- A request to add or fix a feature inside existing source is assistant-task, even if it uses words such as build or create.',
    '- For create, set creationTarget from the user request in any language: a separate/new workspace is workspace; a project in the current/active workspace is project. Preserve this destination in normalizedRequest. Explicit user intent takes precedence over the selector, which may have been chosen automatically.',
    '- If the user leaves the destination unspecified, use the selected target as the default. Do not invent a different existing workspace. For non-create intents set creationTarget to unspecified.',
    '- Project creation requires an active selected workspace. Never silently fall back to another or default workspace.',
    '- userResponse must be concise, natural, and useful. Ask at most one focused question for clarification.',
    '- For social conversation, respond as the Workspai Create guide. Never echo the user message verbatim and never describe yourself as just a program, AI, language model, or bot.',
    '- Do not claim that files were created, inspected, adopted, imported, or modified.',
    '- Do not reveal machine-local paths.',
    '',
    history ? `Recent Create conversation:\n${history}` : 'Recent Create conversation: none',
    '',
    `Current user request: ${JSON.stringify(input.request.trim().slice(0, 4_000))}`,
  ].join('\n');
}

function isExplicitCreateRequest(value: string): boolean {
  return EXPLICIT_CREATE_PATTERN.test(value) && CREATE_TARGET_PATTERN.test(value);
}

function recoverDelegatedCreate(input: {
  request: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): CreateIntentRoute | null {
  const reversedUserHistory = [...(input.history ?? [])]
    .reverse()
    .filter((entry) => entry.role === 'user' && entry.content.trim().length > 0);
  const priorCreationRequest = reversedUserHistory.find((entry) =>
    isExplicitCreateRequest(entry.content)
  )?.content;
  const clarificationAlreadyAsked = (input.history ?? []).some(
    (entry) => entry.role === 'assistant' && entry.content.includes('?')
  );
  const creationRequest = isExplicitCreateRequest(input.request)
    ? input.request.trim()
    : clarificationAlreadyAsked
      ? (priorCreationRequest ?? reversedUserHistory[0]?.content)?.trim()
      : undefined;
  if (!creationRequest) {
    return null;
  }
  return {
    intent: 'create',
    confidence: 'high',
    normalizedRequest: bounded(
      `${creationRequest}\nUse Workspai's recommended executable stack and conservative starter defaults for every unspecified technical choice. Present those choices in the plan for review.`,
      2_000
    ),
    userResponse: '',
    reason:
      'A clear creation outcome exists and unspecified implementation choices belong to the reviewable planner.',
    recommendedAction: 'none',
  };
}

function enforceCreateRoutingPolicy(
  input: {
    request: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  route: CreateIntentRoute
): CreateIntentRoute {
  const resolved =
    route.intent === 'clarification' ? (recoverDelegatedCreate(input) ?? route) : route;
  if (resolved.intent !== 'conversation' && resolved.intent !== 'question') {
    return resolved;
  }
  const comparable = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const response = resolved.userResponse.trim();
  const echoesRequest = comparable(response) === comparable(input.request);
  const identityDisclaimer =
    /\b(?:just|only)\s+(?:a|an)\s+(?:program|ai|language model|bot|machine)\b/i.test(response) ||
    /\bi (?:am|'m) (?:a|an) (?:program|ai|language model|bot|machine)\b/i.test(response);
  if (response && !echoesRequest && !identityDisclaimer) {
    return resolved;
  }
  const greeting = /^(?:hi|hello|hey)\b/i.test(input.request.trim());
  return {
    ...resolved,
    userResponse: greeting
      ? 'Hi! What would you like to build?'
      : 'Ready when you are. Tell me what you would like to create, adopt, or import.',
  };
}

function localFallback(input: {
  request: string;
  selectedTarget: 'workspace' | 'project';
  projectName?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): CreateIntentRoute {
  const request = input.request.trim();
  const lower = request.toLowerCase();
  const normalizedRequest = request.slice(0, 2_000) || 'Clarify the requested creation.';
  if (/^(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening))[!.\s]*$/i.test(request)) {
    return {
      intent: 'conversation',
      confidence: 'high',
      normalizedRequest,
      userResponse: 'Hi! Describe the workspace or project you want to create.',
      reason: 'A deterministic greeting guard matched before creation planning.',
      recommendedAction: 'none',
    };
  }
  if (/\badopt\b/.test(lower)) {
    return {
      intent: 'adopt-project',
      confidence: 'high',
      normalizedRequest,
      userResponse: 'Choose the existing project folder you want Workspai to adopt.',
      reason: 'The request explicitly asks to adopt existing source.',
      recommendedAction: 'adopt-project',
    };
  }
  if (/\bimport\b/.test(lower) && /\bworkspace\b/.test(lower)) {
    return {
      intent: 'import-workspace',
      confidence: 'high',
      normalizedRequest,
      userResponse: 'Choose the Workspai workspace or archive you want to import.',
      reason: 'The request explicitly asks to import a workspace.',
      recommendedAction: 'import-workspace',
    };
  }
  if (/\bimport\b/.test(lower)) {
    return {
      intent: 'import-project',
      confidence: 'high',
      normalizedRequest,
      userResponse: 'Choose the existing project or supported artifact you want to import.',
      reason: 'The request explicitly asks to import a project.',
      recommendedAction: 'import-project',
    };
  }
  const sourceMutation = /\b(add|change|edit|fix|implement|refactor|remove|update|write)\b/.test(
    lower
  );
  const sourceTarget =
    /\b(code|configuration|config|documentation|endpoint|feature|file|test|tests)\b/.test(lower);
  if (input.projectName && sourceMutation && sourceTarget) {
    return {
      intent: 'assistant-task',
      confidence: 'high',
      normalizedRequest,
      userResponse:
        'This request changes existing source. Continue in Agent for governed edits and verification.',
      reason: 'The active project and requested source mutation belong in Assistant Agent.',
      recommendedAction: 'continue-in-agent',
    };
  }
  const delegatedCreate = recoverDelegatedCreate(input);
  if (delegatedCreate) {
    return delegatedCreate;
  }
  if (/\?$/.test(request) || /^(how|what|why|when|where|which|can|does|is|are)\b/.test(lower)) {
    return {
      intent: 'question',
      confidence: 'medium',
      normalizedRequest,
      userResponse:
        'I can help with new workspaces, projects, adoption, and imports. What would you like to create or connect?',
      reason: 'The request is informational and does not authorize creation.',
      recommendedAction: 'none',
    };
  }
  return {
    intent: 'clarification',
    confidence: 'low',
    normalizedRequest,
    userResponse:
      input.selectedTarget === 'workspace'
        ? 'What should this new workspace contain?'
        : 'What kind of project should Workspai create?',
    reason: 'No high-confidence creation or navigation intent was available.',
    recommendedAction: 'none',
  };
}

export async function routeCreateIntent(input: {
  request: string;
  selectedTarget: 'workspace' | 'project';
  stackFocus?: string;
  workspaceName?: string;
  projectName?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  complete: (input: {
    prompt: string;
    toolName: typeof CREATE_INTENT_ROUTE_TOOL;
    toolSchema: typeof CREATE_INTENT_ROUTE_TOOL_SCHEMA;
  }) => Promise<CreateIntentModelResult>;
}): Promise<CreateIntentRoute> {
  try {
    const result = await input.complete({
      prompt: buildCreateIntentRoutingPrompt(input),
      toolName: CREATE_INTENT_ROUTE_TOOL,
      toolSchema: CREATE_INTENT_ROUTE_TOOL_SCHEMA,
    });
    if (result.type === 'tool' && result.toolName === CREATE_INTENT_ROUTE_TOOL) {
      const route = parseCreateIntentRoute(result.input);
      if (route) {
        return enforceCreateRoutingPolicy(input, route);
      }
    }
  } catch {
    // The bounded local router below preserves useful offline behavior without
    // guessing a stack for ambiguous input.
  }
  return localFallback(input);
}
