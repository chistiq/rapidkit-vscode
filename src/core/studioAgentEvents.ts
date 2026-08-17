export const STUDIO_AGENT_EVENT_SCHEMA_VERSION = 'workspai.studio-agent-event.v1' as const;

export type StudioAgentSessionStatus =
  | 'idle'
  | 'running'
  | 'waiting-permission'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StudioAgentEventType =
  | 'session.created'
  | 'session.status'
  | 'request.started'
  | 'request.steered'
  | 'model.message'
  | 'model.checkpoint'
  | 'tool.requested'
  | 'tool.permission'
  | 'tool.started'
  | 'tool.progress'
  | 'tool.completed'
  | 'tool.failed'
  | 'verify.completed'
  | 'session.completed'
  | 'session.failed'
  | 'session.cancelled';

export type StudioAgentEvent<T = Record<string, unknown>> = {
  schemaVersion: typeof STUDIO_AGENT_EVENT_SCHEMA_VERSION;
  id: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: StudioAgentEventType;
  requestId?: string;
  toolCallId?: string;
  data: T;
};

export type StudioAgentPersistedSession = {
  schemaVersion: 'workspai.studio-agent-session.v1';
  id: string;
  workspacePath: string;
  projectPath?: string;
  cardId: string;
  assistantMode: 'agent' | 'ask' | 'plan' | 'goal';
  selectedModelId?: string;
  blockerSignature?: string;
  governedGoal?: {
    schemaVersion: 'workspai.studio-governed-goal.v1';
    id: string;
    fingerprint: string;
    objective: string;
    category:
      | 'release-readiness'
      | 'dependency-security'
      | 'test-coverage'
      | 'defect-repair'
      | 'feature-change'
      | 'refactor'
      | 'performance'
      | 'documentation'
      | 'system-understanding';
    scope: {
      kind: 'workspace' | 'project';
      projects: string[];
      selectionSource: 'workspace' | 'invocation-project' | 'explicit';
    };
    /**
     * Deterministic goals have an exact CLI success producer. Every other
     * engineering goal closes only after CLI safety verification plus a
     * model review of the requested outcome; it is never mislabeled as a
     * machine-verified semantic result.
     */
    completionMode: 'deterministic-verification' | 'evidence-review';
  };
  goal?: {
    schemaVersion: 'workspai.verified-goal.v1';
    id: string;
    fingerprint: string;
    createdAt: string;
    updatedAt: string;
    workspace: {
      name: string;
      path: string;
    };
    kind: 'release-readiness' | 'dependency-security' | 'test-coverage';
    summary: string;
    scope: {
      kind: 'workspace' | 'project';
      projectName?: string;
      projectPath?: string;
    };
    constraints: {
      allowBreakingChanges: boolean;
      allowForce: boolean;
      requireBuild: boolean;
      requireTests: boolean;
    };
    criteria: Record<string, unknown>;
    baseline: {
      measuredAt: string;
      value: number | null;
      target: number | null;
      unit: 'percent' | 'blocking-vulnerabilities' | 'gates' | 'unknown';
      status: 'satisfied' | 'unsatisfied' | 'unavailable';
      evidencePaths: string[];
      message: string;
    };
    dependencySafetyBaseline?: {
      manifests: Array<{
        path: string;
        ecosystem: string;
        sha256: string;
        dependencies?: Record<string, string>;
      }>;
    };
    artifactPaths: {
      goal: string;
      status: string;
      latestReport: string;
    };
  };
  status: StudioAgentSessionStatus;
  createdAt: string;
  updatedAt: string;
  sequence: number;
  events: StudioAgentEvent[];
};

export function createStudioAgentEvent<T>(input: {
  sessionId: string;
  sequence: number;
  type: StudioAgentEventType;
  data: T;
  requestId?: string;
  toolCallId?: string;
  now?: () => Date;
}): StudioAgentEvent<T> {
  const timestamp = (input.now ?? (() => new Date()))().toISOString();
  return {
    schemaVersion: STUDIO_AGENT_EVENT_SCHEMA_VERSION,
    id: `${input.sessionId}:${input.sequence}`,
    sessionId: input.sessionId,
    sequence: input.sequence,
    timestamp,
    type: input.type,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    data: input.data,
  };
}
