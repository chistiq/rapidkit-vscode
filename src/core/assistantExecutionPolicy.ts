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
}): AssistantExecutionPolicy {
  const base = {
    schemaVersion: 'workspai.assistant-execution-policy.v1' as const,
    selectedMode: input.selectedMode,
    requestIntent: input.requestIntent,
    routeConfidence: input.routeConfidence ?? 'high',
  };

  if (input.requestIntent === 'conversation' || input.requestIntent === 'clarification') {
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
      profile: 'direct-response',
      toolMode: 'goal',
      directResponse:
        'Goal mode is for pursuing a bounded engineering outcome. This message is a question and will not create a Goal.',
      suggestion: suggestion(
        'ask',
        'Continue in Ask',
        'Answer from workspace evidence without changing files.'
      ),
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
      return 'Execution policy: answer from read-only workspace evidence. Do not mutate source, create a Goal, or claim verified change completion.';
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
  });
  return record.profile === canonical.profile && record.toolMode === canonical.toolMode
    ? canonical
    : null;
}
