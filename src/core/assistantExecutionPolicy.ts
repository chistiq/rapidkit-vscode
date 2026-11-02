import type { WorkspaiAssistantMode } from './assistantModeContract.js';
import type { AssistantRequestIntent } from './assistantIntentRouter.js';

export type AssistantExecutionProfile =
  | 'direct-response'
  | 'evidence-answer'
  | 'implementation-plan'
  | 'autonomous-change'
  | 'governed-goal';

export type AssistantModeSuggestion = {
  mode: WorkspaiAssistantMode;
  label: string;
  description: string;
};

export type AssistantExecutionPolicy = {
  schemaVersion: 'workspai.assistant-execution-policy.v1';
  selectedMode: WorkspaiAssistantMode;
  requestIntent: AssistantRequestIntent;
  routeConfidence: 'high' | 'medium' | 'low';
  profile: AssistantExecutionProfile;
  toolMode: WorkspaiAssistantMode;
  directResponse?: string;
  workspaceIntent?: 'create-new' | 'use-current' | 'none';
  suggestion?: AssistantModeSuggestion;
};

function suggestion(
  mode: WorkspaiAssistantMode,
  label: string,
  description: string
): AssistantModeSuggestion {
  return { mode, label, description };
}

/**
 * Resolve one immutable execution contract from the user's explicit mode and
 * the model-classified request. The model may reduce authority for one turn,
 * but it can never grant itself a more privileged mode. Privilege escalation
 * is represented only as an explicit, user-accepted suggestion.
 */
export function resolveAssistantExecutionPolicy(input: {
  selectedMode: WorkspaiAssistantMode;
  requestIntent: AssistantRequestIntent;
  routeConfidence?: 'high' | 'medium' | 'low';
  workspaceIntent?: AssistantExecutionPolicy['workspaceIntent'];
}): AssistantExecutionPolicy {
  const base = {
    schemaVersion: 'workspai.assistant-execution-policy.v1' as const,
    selectedMode: input.selectedMode,
    requestIntent: input.requestIntent,
    routeConfidence: input.routeConfidence ?? 'high',
    ...(input.workspaceIntent ? { workspaceIntent: input.workspaceIntent } : {}),
  };

  if (input.requestIntent === 'research') {
    return { ...base, profile: 'evidence-answer', toolMode: 'ask' };
  }

  if (
    input.requestIntent === 'conversation' ||
    input.requestIntent === 'general-question' ||
    input.requestIntent === 'clarification'
  ) {
    return {
      ...base,
      profile: 'direct-response',
      toolMode: input.selectedMode,
    };
  }

  if (
    base.routeConfidence !== 'high' &&
    (input.requestIntent === 'engineering-task' || input.requestIntent === 'goal')
  ) {
    return {
      ...base,
      profile: 'direct-response',
      toolMode: input.selectedMode,
      directResponse:
        'I need a clearer engineering outcome or target before selecting tools, changing files, or creating a Goal.',
    };
  }

  if (input.selectedMode === 'agent') {
    if (input.requestIntent === 'question') {
      return {
        ...base,
        profile: 'evidence-answer',
        // The selector is an authority ceiling, not a requirement to mutate or
        // verify. Enforce a read-only capability set for this informational turn.
        toolMode: 'ask',
      };
    }
    return {
      ...base,
      profile: 'autonomous-change',
      toolMode: 'agent',
      ...(input.requestIntent === 'goal'
        ? {
            suggestion: suggestion(
              'goal',
              'Track as Goal',
              'Keep this outcome durable, resumable, and evidence-bound across sessions.'
            ),
          }
        : {}),
    };
  }

  if (input.selectedMode === 'ask') {
    if (input.requestIntent === 'question') {
      return { ...base, profile: 'evidence-answer', toolMode: 'ask' };
    }
    const targetMode = input.requestIntent === 'goal' ? 'goal' : 'agent';
    return {
      ...base,
      profile: 'direct-response',
      toolMode: 'ask',
      directResponse:
        targetMode === 'goal'
          ? 'This request describes a durable outcome. Ask mode will not change files or create a Goal.'
          : 'This request requires a source change. Ask mode will not modify the workspace.',
      suggestion:
        targetMode === 'goal'
          ? suggestion('goal', 'Track as Goal', 'Create a governed, resumable engineering Goal.')
          : suggestion('agent', 'Continue in Agent', 'Apply the change and verify it safely.'),
    };
  }

  if (input.selectedMode === 'plan') {
    if (input.requestIntent === 'question') {
      return {
        ...base,
        profile: 'evidence-answer',
        toolMode: 'ask',
        suggestion: suggestion('ask', 'Continue in Ask', 'Keep this conversation read-only.'),
      };
    }
    return {
      ...base,
      profile: 'implementation-plan',
      toolMode: 'plan',
      suggestion:
        input.requestIntent === 'goal'
          ? suggestion('goal', 'Track as Goal', 'Pursue the planned outcome with durable evidence.')
          : suggestion(
              'agent',
              'Run with Agent',
              'Apply the plan through governed mutation and verification.'
            ),
    };
  }

  if (input.requestIntent === 'question') {
    return {
      ...base,
      profile: 'evidence-answer',
      toolMode: 'ask',
    };
  }

  // Selecting Goal is explicit authorization to turn any clear, bounded
  // engineering task into a governed outcome. It must not depend on whether
  // the classifier called the request a task or a durable goal.
  return {
    ...base,
    profile: 'governed-goal',
    toolMode: 'goal',
  };
}

export function assistantExecutionPolicyInstruction(policy: AssistantExecutionPolicy): string {
  switch (policy.profile) {
    case 'evidence-answer':
      return 'Execution policy: answer the user question using only the smallest necessary read-only evidence. Answer directly when the supplied context suffices. Do not create or update a task ledger, repair missing reports, create a Goal, run verification, or mutate files. Prefer live workspace inventory for project names and current scope; reports can be partial or stale. Use public web search/fetch or host tools for research, and try another applicable capability if optional evidence is missing. Explain an unavailable capability only after observing its failure. Stop when the question is answered.';
    case 'implementation-plan':
      return 'Execution policy: produce an evidence-backed implementation plan without mutating source or running mutating commands.';
    case 'autonomous-change':
      return policy.requestIntent === 'goal'
        ? 'Execution policy: complete this goal-like request as a one-shot governed Agent task. Do not create or activate a durable Goal unless the user accepts the mode suggestion.'
        : 'Execution policy: own the requested source change through governed mutation and final verification.';
    case 'governed-goal':
      return 'Execution policy: bind this bounded outcome to the governed Goal lifecycle and its canonical evidence contract.';
    case 'direct-response':
      return 'Execution policy: answer directly without starting a workspace session.';
  }
}

/**
 * Convert a completed read-only Plan into an explicit, user-approved Agent
 * handoff. The plan is context, not authority: Agent must re-inspect current
 * evidence before mutation and remains bound to its own verification gates.
 */
export function buildAssistantPlanAgentHandoff(input: { request: string; plan: string }): string {
  const request = input.request.trim().slice(0, 4_000);
  const plan = input.plan.trim().slice(0, 12_000);
  return [
    'Implement the following user-approved Workspai Plan in Agent mode.',
    'Treat the plan as a bounded handoff, not as proof that the workspace is unchanged: re-inspect relevant evidence and source before mutation, then verify the completed result.',
    '',
    'Original request:',
    request,
    '',
    'Approved plan:',
    plan,
  ].join('\n');
}

export function parseAssistantExecutionPolicy(
  value: unknown,
  expectedSelectedMode: WorkspaiAssistantMode
): AssistantExecutionPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
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
    record.schemaVersion !== 'workspai.assistant-execution-policy.v1' ||
    record.selectedMode !== expectedSelectedMode ||
    !intents.has(record.requestIntent as AssistantRequestIntent) ||
    !confidences.has(String(record.routeConfidence))
  ) {
    return null;
  }
  const canonical = resolveAssistantExecutionPolicy({
    selectedMode: expectedSelectedMode,
    requestIntent: record.requestIntent as AssistantRequestIntent,
    routeConfidence: record.routeConfidence as AssistantExecutionPolicy['routeConfidence'],
    ...(record.workspaceIntent === 'create-new' ||
    record.workspaceIntent === 'use-current' ||
    record.workspaceIntent === 'none'
      ? { workspaceIntent: record.workspaceIntent }
      : {}),
  });
  return record.profile === canonical.profile && record.toolMode === canonical.toolMode
    ? canonical
    : null;
}
