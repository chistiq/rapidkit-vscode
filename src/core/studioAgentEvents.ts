import type { AssistantExecutionPolicy } from './assistantExecutionPolicy.js';
import type { AIProviderKind } from './aiProviderCatalog.js';

export const STUDIO_AGENT_EVENT_SCHEMA_VERSION = 'workspai.studio-agent-event.v1' as const;

export type StudioAgentSessionStatus =
  | 'idle'
  | 'running'
  | 'waiting-input'
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
  | 'model.resolved'
  | 'model.checkpoint'
  | 'tool.requested'
  | 'tool.permission'
  | 'tool.approval.requested'
  | 'tool.approval.approved'
  | 'tool.approval.rejected'
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

export type StudioAgentRequiredCausalAction = {
  schemaVersion: 'workspai.studio-required-causal-action.v1';
  authority: 'workspai-cli-remediation-plan';
  toolName: 'execute-remediation-step';
  input: { stepId: string };
  stepId: string;
  executionKind: 'structured-operation' | 'contract-command';
  requiresApproval: boolean;
  reason: string;
  evidenceGeneration?: string;
  blockerSignature?: string;
};

export type StudioAgentCompletionObligations = {
  schemaVersion: 'workspai.studio-completion-obligations.v1';
  /**
   * Latest source mutation still relevant to completion. This sequence is
   * durable so bounded event history and a resumed request cannot erase the
   * safety work that must happen after a mutation.
   */
  latestSourceMutationSequence?: number;
  /** Require a successful final workspace-diff inspection after this mutation. */
  sourceReviewRequiredAfterSequence?: number;
  /** Require canonical Workspace Intelligence closure after this mutation. */
  canonicalClosureRequiredAfterSequence?: number;
  /** Require a successful, non-blocking verifier result after this mutation. */
  freshVerificationRequiredAfterSequence?: number;
};

export type StudioAgentModelResolution = {
  provider: AIProviderKind;
  modelId: string;
  requestedModelId?: string;
  fallback: boolean;
  attempts: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenUsageSource?: 'provider' | 'estimated';
};

export type StudioAgentResolvedModel = StudioAgentModelResolution & {
  resolvedAt: string;
};

export type StudioAgentTaskLedger = {
  schemaVersion: 'workspai.studio-task-ledger.v1';
  objective: string;
  currentStepId?: string;
  steps: Array<{
    id: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'blocked';
    evidence?: string;
  }>;
  updatedAt: string;
  updatedSequence: number;
};

export type StudioAgentBudgetLedger = {
  schemaVersion: 'workspai.studio-budget-ledger.v1';
  attemptsStarted: number;
  totalModelDecisions: number;
  totalProviderRequests: number;
  totalToolExecutions: number;
  totalProtocolMisses: number;
  totalContinuationNudges: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedTokenMeasurements: number;
  lastAttemptStartedAt: string;
};

export type StudioAgentPersistedSession = {
  schemaVersion: 'workspai.studio-agent-session.v1';
  id: string;
  workspacePath: string;
  projectPath?: string;
  cardId: string;
  assistantMode: 'agent' | 'ask' | 'plan' | 'goal';
  /** Immutable per-request policy derived from selected mode and model-classified intent. */
  executionPolicy?: AssistantExecutionPolicy;
  selectedModelId?: string;
  /** Actual provider/model that served the latest model decision. */
  lastResolvedModel?: StudioAgentResolvedModel;
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
      kind: 'workspace' | 'project' | 'project-set';
      projects: string[];
      selectionSource:
        | 'workspace'
        | 'single-project-workspace'
        | 'invocation-project'
        | 'explicit'
        | 'interactive';
      resolution?: 'selected' | 'selection-required';
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
      kind: 'workspace' | 'project' | 'project-set';
      projectName?: string;
      projectPath?: string;
      projects?: Array<{ projectName: string; projectPath: string }>;
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
  /**
   * Durable post-effect observation obligations. This remains explicit even
   * when older tool events fall out of the bounded session history.
   */
  pendingEffectVerificationScopes?: string[];
  /**
   * Durable exact-action continuation. While present, the next provider turn
   * receives only this native tool and exact input contract. Approval and
   * execution remain owned by the controller and CLI Repair Engine.
   */
  pendingRequiredCausalAction?: StudioAgentRequiredCausalAction;
  /**
   * Durable completion stop-gate state. Unlike event-derived request-local
   * checks, these obligations survive provider failure, Resume, and transcript
   * compaction.
   */
  completionObligations?: StudioAgentCompletionObligations;
  /** Model-maintained durable progress for multi-step autonomous work. */
  taskLedger?: StudioAgentTaskLedger;
  /** Durable request-count telemetry; Resume starts a new bounded attempt. */
  budgetLedger?: StudioAgentBudgetLedger;
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
