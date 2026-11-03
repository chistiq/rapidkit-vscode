import {
  CREATE_PLANNER_CAPABILITIES_CONTRACT,
  CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION,
  listExecutableCreateKits,
  listExecutableCreateTargets,
} from '../contracts/createPlannerCapabilities.js';
import type { AIMessage } from './aiService.js';
import {
  SCAFFOLD_FRAMEWORK_KITS,
  scaffoldKitsForFramework,
  type ScaffoldFramework,
} from './scaffoldKits.js';

export const CREATE_CAPABILITY_TOOL_NAMES = {
  inspectContext: 'inspect-create-context',
  listCapabilities: 'list-create-capabilities',
  recommendArchitecture: 'recommend-create-architecture',
  submitPlan: 'submit-create-plan',
} as const;

export type CreateCapabilityToolName =
  (typeof CREATE_CAPABILITY_TOOL_NAMES)[keyof typeof CREATE_CAPABILITY_TOOL_NAMES];

export type CreateCapabilityModelAction =
  | {
      type: 'tool';
      provider: string;
      callId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | { type: 'text'; provider: string; text: string };

export type CreateCapabilityToolDefinition = {
  name: CreateCapabilityToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type CreateCapabilityContext = {
  request: string;
  selectedTarget: 'workspace' | 'project';
  stackFocus?: string;
  workspaceName?: string;
  projectName?: string;
  workspaceAvailable: boolean;
};

export type CreateCapabilityPlanningResult =
  | {
      status: 'submitted';
      provider: string;
      draft: Record<string, unknown>;
      observations: CreateCapabilityToolName[];
      turns: number;
    }
  | {
      status: 'fallback';
      provider?: string;
      reason: string;
      observations: CreateCapabilityToolName[];
      turns: number;
    };

const CREATE_PLAN_PROPERTIES = {
  workspaceName: { type: 'string', minLength: 2, maxLength: 30 },
  profile: {
    type: 'string',
    enum: [
      'minimal',
      'python-only',
      'node-only',
      'go-only',
      'java-only',
      'dotnet-only',
      'polyglot',
      'enterprise',
    ],
  },
  installMethod: { type: 'string', enum: ['auto'] },
  framework: { type: 'string', enum: listExecutableCreateTargets() },
  kit: { type: 'string', enum: listExecutableCreateKits() },
  projectName: { type: 'string', minLength: 2, maxLength: 80 },
  suggestedModules: {
    type: 'array',
    maxItems: 6,
    items: { type: 'string', minLength: 1, maxLength: 160 },
  },
  description: { type: 'string', minLength: 1, maxLength: 240 },
} as const;

export const CREATE_CAPABILITY_TOOLS: readonly CreateCapabilityToolDefinition[] = [
  {
    name: CREATE_CAPABILITY_TOOL_NAMES.inspectContext,
    description:
      'Read the portable Create-tab target and canonical workspace/project selection. This tool never reads source or mutates the filesystem.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: CREATE_CAPABILITY_TOOL_NAMES.listCapabilities,
    description:
      'Read the canonical executable framework, kit, profile, and unsupported-stack policy used by the Workspai runtime.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'backend', 'frontend', 'desktop', 'agent', 'extension', 'gaming'],
        },
      },
    },
  },
  {
    name: CREATE_CAPABILITY_TOOL_NAMES.recommendArchitecture,
    description:
      'Evaluate a product outcome against Workspai architecture rules and return bounded stack-selection guidance. This is read-only and does not draft or execute a plan.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['outcome'],
      properties: {
        outcome: { type: 'string', minLength: 1, maxLength: 2_000 },
        shape: {
          type: 'string',
          enum: [
            'unspecified',
            'frontend',
            'backend',
            'full-stack',
            'desktop',
            'agent',
            'extension',
          ],
        },
      },
    },
  },
  {
    name: CREATE_CAPABILITY_TOOL_NAMES.submitPlan,
    description:
      'Submit one complete creation proposal after inspecting context and capabilities. Submission is non-mutating; Workspai validates it and shows it to the user for explicit approval.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(CREATE_PLAN_PROPERTIES),
      properties: {
        ...CREATE_PLAN_PROPERTIES,
        secondaryProject: {
          type: 'object',
          additionalProperties: false,
          required: ['framework', 'kit', 'projectName'],
          properties: {
            framework: { type: 'string', enum: listExecutableCreateTargets() },
            kit: { type: 'string', enum: listExecutableCreateKits() },
            projectName: { type: 'string', minLength: 2, maxLength: 80 },
          },
        },
      },
    },
  },
] as const;

function safeText(value: string | undefined, fallback = 'none'): string {
  const normalized = value?.trim().slice(0, 200);
  return normalized || fallback;
}

function architectureGuidance(input: Record<string, unknown>): Record<string, unknown> {
  const outcome = typeof input.outcome === 'string' ? input.outcome.trim().slice(0, 2_000) : '';
  const shape = typeof input.shape === 'string' ? input.shape : 'unspecified';
  return {
    outcome,
    requestedShape: shape,
    decisionRules: [
      'Choose the smallest executable stack that satisfies the product outcome.',
      'A user-facing app alone is frontend; add a backend only when API, persistence, authentication, integration, or server workflow is required or clearly implied.',
      'A workspace may contain a primary and one companion project when a separate frontend and backend are justified.',
      'Full-stack topology does not imply polyglot runtime. Prefer Next.js plus NestJS and the node-only profile when technical choices are delegated.',
      'Use the polyglot profile only when the selected projects use different runtime families or the user explicitly requests multiple runtimes.',
      'Use conservative starter features for unspecified choices and expose every assumption in the reviewable plan description.',
      'Agent projects must use a release-admitted framework kit and runtime; never guess an unverified latest dependency.',
      'Never translate an unsupported ecosystem into an unrelated executable kit.',
    ],
  };
}

function inspectContext(context: CreateCapabilityContext): Record<string, unknown> {
  return {
    schemaVersion: 'workspai.create-context.v1',
    surface: 'create',
    selectedTarget: context.selectedTarget,
    workspace: context.workspaceAvailable
      ? { available: true, name: safeText(context.workspaceName) }
      : { available: false },
    project: context.projectName ? { selected: true, name: safeText(context.projectName) } : null,
    stackFocus: safeText(context.stackFocus, 'balanced'),
    authority: {
      planning: 'model-proposal',
      mutation: 'controller-after-explicit-approval',
      verification: 'workspai-cli',
    },
  };
}

function listCapabilities(category: unknown): Record<string, unknown> {
  const requestedCategory =
    typeof category === 'string' && category !== 'all' ? category : undefined;
  const contract = CREATE_PLANNER_CAPABILITIES_CONTRACT;
  const native = contract.nativeCreate.filter(
    (entry) => !requestedCategory || entry.category === requestedCategory
  );
  const official = contract.officialCreate.filter(
    (entry) => !requestedCategory || entry.category === requestedCategory
  );
  return {
    schemaVersion: CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION,
    executableFrameworks: listExecutableCreateTargets(),
    executableKits: listExecutableCreateKits(),
    executablePairs: Object.entries(SCAFFOLD_FRAMEWORK_KITS).map(([framework, kits]) => ({
      framework,
      kits,
    })),
    native,
    official,
    profiles: CREATE_PLAN_PROPERTIES.profile.enum,
    productRules: contract.productRules,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasPlanShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.workspaceName === 'string' &&
    typeof value.profile === 'string' &&
    typeof value.installMethod === 'string' &&
    typeof value.framework === 'string' &&
    typeof value.kit === 'string' &&
    typeof value.projectName === 'string' &&
    Array.isArray(value.suggestedModules) &&
    typeof value.description === 'string'
  );
}

function validateSubmittedPlan(value: Record<string, unknown>): string | undefined {
  const frameworks = new Set<string>(listExecutableCreateTargets());
  const profiles = new Set<string>(CREATE_PLAN_PROPERTIES.profile.enum);
  const installMethods = new Set<string>(CREATE_PLAN_PROPERTIES.installMethod.enum);
  if (!frameworks.has(String(value.framework))) {
    return `Unsupported executable framework: ${String(value.framework)}.`;
  }
  const framework = value.framework as ScaffoldFramework;
  if (!scaffoldKitsForFramework(framework).includes(String(value.kit))) {
    return `Kit ${String(value.kit)} does not belong to framework ${framework}.`;
  }
  if (!profiles.has(String(value.profile))) {
    return `Unsupported workspace profile: ${String(value.profile)}.`;
  }
  if (!installMethods.has(String(value.installMethod))) {
    return `Unsupported install method: ${String(value.installMethod)}.`;
  }
  if (value.secondaryProject !== undefined) {
    if (!isRecord(value.secondaryProject)) {
      return 'The companion project must be an object.';
    }
    const secondary = value.secondaryProject;
    if (!frameworks.has(String(secondary.framework))) {
      return `Unsupported companion framework: ${String(secondary.framework)}.`;
    }
    const secondaryFramework = secondary.framework as ScaffoldFramework;
    if (!scaffoldKitsForFramework(secondaryFramework).includes(String(secondary.kit))) {
      return `Companion kit ${String(secondary.kit)} does not belong to framework ${secondaryFramework}.`;
    }
    if (secondaryFramework === framework) {
      return 'Primary and companion projects must use different framework lanes.';
    }
    if (typeof secondary.projectName !== 'string' || secondary.projectName.trim().length < 2) {
      return 'The companion project name is missing or invalid.';
    }
  }
  return undefined;
}

function capabilityPrompt(context: CreateCapabilityContext): string {
  return [
    'You are the bounded planning agent inside the Workspai Create tab.',
    'Use the provided tools to understand the current Create surface and draft the best executable plan for the user outcome.',
    '',
    'Required lifecycle:',
    '1. Call inspect-create-context.',
    '2. Call list-create-capabilities.',
    '3. Call recommend-create-architecture when product shape or technical choices are delegated or uncertain.',
    '4. Call submit-create-plan exactly once with the complete proposal.',
    '',
    'Enterprise boundaries:',
    '- Tools in this planning loop are read-only. submit-create-plan is a proposal, not execution.',
    '- The resolved workspace/project target reflects the user request and is authoritative for this draft. Do not switch it while choosing a stack.',
    '- A project plan belongs only to the active canonical workspace selected by the user; never choose or imply a hidden default workspace.',
    '- Use only executable framework and kit pairs returned by list-create-capabilities.',
    '- Choose sensible conservative defaults when the user delegates technical choices; do not ask the user to understand frameworks.',
    '- Use one project unless the outcome genuinely requires separate frontend and backend applications.',
    '- Full-stack does not mean polyglot. For delegated choices, prefer a same-runtime Node.js stack (Next.js + NestJS) that avoids optional host prerequisites.',
    '- Preserve an explicitly requested runtime even when it requires host setup; never silently replace an explicit framework.',
    '- Never invent capabilities, inspect source, expose local paths, or claim that anything was created.',
    '- The controller validates and hashes the proposal. Only an explicit user approval may execute it through the Workspai CLI.',
    '',
    `Selected target: ${context.selectedTarget}`,
    `User outcome: ${JSON.stringify(context.request.trim().slice(0, 4_000))}`,
  ].join('\n');
}

function observationMessage(
  callId: string,
  name: string,
  content: Record<string, unknown>
): AIMessage {
  return {
    role: 'tool',
    toolResult: { callId, name, content: JSON.stringify(content) },
  };
}

export async function runCreateCapabilityPlanning(input: {
  context: CreateCapabilityContext;
  callModel: (
    messages: AIMessage[],
    tools: readonly CreateCapabilityToolDefinition[]
  ) => Promise<CreateCapabilityModelAction>;
  maxTurns?: number;
}): Promise<CreateCapabilityPlanningResult> {
  const maxTurns = Math.min(Math.max(input.maxTurns ?? 6, 3), 8);
  const messages: AIMessage[] = [{ role: 'user', content: capabilityPrompt(input.context) }];
  const observations: CreateCapabilityToolName[] = [];
  const observed = new Set<CreateCapabilityToolName>();
  const repeatedCalls = new Map<string, number>();
  const callIds = new Set<string>();
  let provider: string | undefined;

  for (let turn = 1; turn <= maxTurns; turn++) {
    let action: CreateCapabilityModelAction;
    try {
      action = await input.callModel(messages, CREATE_CAPABILITY_TOOLS);
      provider = action.provider;
    } catch (error) {
      return {
        status: 'fallback',
        provider,
        reason: error instanceof Error ? error.message : String(error),
        observations,
        turns: turn,
      };
    }
    if (action.type !== 'tool') {
      return {
        status: 'fallback',
        provider,
        reason: 'The model returned text instead of a bounded Create capability call.',
        observations,
        turns: turn,
      };
    }
    const tool = CREATE_CAPABILITY_TOOLS.find((candidate) => candidate.name === action.toolName);
    if (!tool) {
      return {
        status: 'fallback',
        provider,
        reason: `The model selected an unknown Create capability: ${action.toolName}.`,
        observations,
        turns: turn,
      };
    }
    if (!action.callId.trim() || callIds.has(action.callId)) {
      return {
        status: 'fallback',
        provider,
        reason: 'The model returned a missing or repeated Create capability call identifier.',
        observations,
        turns: turn,
      };
    }
    callIds.add(action.callId);
    const signature = `${tool.name}:${JSON.stringify(action.input)}`;
    const repeated = (repeatedCalls.get(signature) ?? 0) + 1;
    repeatedCalls.set(signature, repeated);
    messages.push({
      role: 'assistant',
      toolCall: { callId: action.callId, name: tool.name, input: action.input },
    });
    if (repeated > 2) {
      return {
        status: 'fallback',
        provider,
        reason: `The model repeated ${tool.name} without making planning progress.`,
        observations,
        turns: turn,
      };
    }

    let result: Record<string, unknown>;
    if (tool.name === CREATE_CAPABILITY_TOOL_NAMES.inspectContext) {
      result = inspectContext(input.context);
    } else if (tool.name === CREATE_CAPABILITY_TOOL_NAMES.listCapabilities) {
      result = listCapabilities(action.input.category);
    } else if (tool.name === CREATE_CAPABILITY_TOOL_NAMES.recommendArchitecture) {
      result = architectureGuidance(action.input);
    } else {
      const missing = [
        !observed.has(CREATE_CAPABILITY_TOOL_NAMES.inspectContext)
          ? CREATE_CAPABILITY_TOOL_NAMES.inspectContext
          : null,
        !observed.has(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities)
          ? CREATE_CAPABILITY_TOOL_NAMES.listCapabilities
          : null,
      ].filter((value): value is NonNullable<typeof value> => value !== null);
      if (missing.length > 0) {
        result = {
          accepted: false,
          reason: 'Required capability observations are missing.',
          requiredNext: missing,
        };
      } else if (!hasPlanShape(action.input)) {
        result = {
          accepted: false,
          reason: 'The submitted proposal is incomplete or does not match the plan schema.',
          requiredNext: [CREATE_CAPABILITY_TOOL_NAMES.submitPlan],
        };
      } else {
        const validationError = validateSubmittedPlan(action.input);
        if (validationError) {
          result = {
            accepted: false,
            reason: validationError,
            requiredNext: [CREATE_CAPABILITY_TOOL_NAMES.submitPlan],
          };
          observations.push(tool.name);
          messages.push(observationMessage(action.callId, tool.name, result));
          continue;
        }
        observations.push(tool.name);
        return {
          status: 'submitted',
          provider: provider ?? 'unknown',
          draft: action.input,
          observations,
          turns: turn,
        };
      }
    }
    observed.add(tool.name);
    observations.push(tool.name);
    messages.push(observationMessage(action.callId, tool.name, result));
  }
  return {
    status: 'fallback',
    provider,
    reason: `Create capability planning exceeded the ${maxTurns}-turn bound.`,
    observations,
    turns: maxTurns,
  };
}
