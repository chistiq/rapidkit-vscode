/**
 * Incident Studio State Management
 * 5-phase workflow + user mode + scope truthfulness
 */

export type IncidentPhase = 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
export type UserMode = 'guided' | 'standard' | 'expert';
export type ReleaseGatePosture = 'go' | 'no-go' | 'pending';
export type ScopeType = 'workspace' | 'project';

export interface HealthMetrics {
  modulesOk: number;
  modulesWarning: number;
  modulesError: number;
  systemLastCheck?: string;
  gitState?: string;
  memoryState?: string;
}

export interface RelatedFile {
  path: string;
  health: 'ok' | 'warning' | 'error';
  freshness?: string;
}

export interface PolicyGateState {
  flowState: 'passing' | 'warning' | 'blocking' | 'pending';
  telemetryState: 'complete' | 'partial' | 'stale' | 'pending';
  releasePosture: ReleaseGatePosture;
  artifactId?: string;
  freshness?: string;
}

export interface IncidentStudioState {
  // Workflow
  currentPhase: IncidentPhase;
  isPhaseTransitioning: boolean;

  // User interaction
  userMode: UserMode;
  scopeType: ScopeType;
  workspaceName?: string;

  // Evidence & gates
  health: HealthMetrics;
  relatedFiles: RelatedFile[];
  policyGates: PolicyGateState;
  releasePosture: ReleaseGatePosture;
  studioEvidence?: StudioEvidenceSummary;

  // Chat state
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingPhaseHint?: string;

  // UI state
  expandedSources?: Record<string, boolean>;
  expertModeExpanded?: boolean;

  // Cross-session retention
  actionItems: ActionItem[];

  // AI action governance
  aiActionContract?: AIActionContractView | null;
  aiActionRegistry?: AIActionRegistryView | null;
  studioActionStatus?: StudioActionStatus | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase?: IncidentPhase;
  confidence?: number;
  sources?: SourcePill[];
}

export interface SourcePill {
  type: 'git' | 'system' | 'telemetry' | 'analysis';
  label: string;
  freshness?: string;
  confidence?: number;
}

export interface ActionItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface StudioActionStatus {
  actionId: string;
  status: 'started' | 'completed' | 'failed';
  detail?: string;
  result?: StudioActionResult;
  updatedAt: string;
}

export interface StudioActionResult {
  summary: string;
  verdict?: 'ready' | 'needs-attention' | 'blocked';
  score?: number;
  generatedAt?: string;
  evidencePath?: string | null;
  evidenceSha256?: string | null;
  evidenceSizeBytes?: number | null;
  commandCount?: number;
  failedCommandCount?: number;
  failedCommands?: string[];
  findings?: {
    fail: number;
    warn: number;
    info: number;
  };
  registryUpdatedAt?: string;
}

export interface StudioEvidenceFinding {
  severity: 'fail' | 'warn' | 'info';
  target: string;
  title: string;
  remediation?: string;
}

export interface StudioEvidenceSummary {
  generatedAt?: string;
  score?: number;
  verdict?: 'ready' | 'needs-attention' | 'blocked';
  projectCount?: number;
  runtimeCount?: number;
  findings: {
    fail: number;
    warn: number;
    info: number;
  };
  topFindings: StudioEvidenceFinding[];
  ciGateCommand?: string;
  releaseGateCommand?: string;
  evidencePath?: string;
}

export interface AIActionContractView {
  actionId?: string | null;
  contract: {
    schemaVersion: 'workspai.ai-action.v1';
    actionType: 'fix' | 'impact' | 'verify';
    summary: string;
    riskLevel: 'low' | 'medium' | 'high';
    affectedFiles: string[];
    proposedCommands: string[];
    proposedPatches: Array<{
      relativePath: string;
      summary?: string;
      diff?: string;
    }>;
    verificationCommands: string[];
    rollbackPlan: string[];
    confidence: number;
    requiresApproval: true;
  } | null;
  validation: {
    status: 'valid' | 'blocked' | 'needs-review';
    issues: Array<{
      code: string;
      severity: 'error' | 'warning';
      detail: string;
    }>;
    canApply: boolean;
    canVerify: boolean;
    canRollback: boolean;
  };
  parseError?: string;
  rawJson?: string | null;
  provider?: string;
  receivedAt: string;
}

export interface AIActionRegistryView {
  updatedAt: string;
  entries: Array<{
    id: string;
    createdAt: string;
    provider?: string;
    summary: string;
    actionType: 'fix' | 'impact' | 'verify';
    riskLevel: 'low' | 'medium' | 'high';
    validationStatus: 'valid' | 'blocked' | 'needs-review';
    lifecycleStatus:
      | 'proposed'
      | 'verified'
      | 'applied'
      | 'applied-failed-verify'
      | 'rolled-back'
      | 'blocked'
      | 'stale';
    executions: Array<{
      operation: 'apply' | 'verify' | 'rollback';
      ok: boolean;
      summary: string;
      evidencePath?: string | null;
      evidenceSha256?: string | null;
      evidenceSizeBytes?: number | null;
      commandCount?: number;
      failedCommandCount?: number;
      failedCommands?: string[];
      preflight?: {
        stale: boolean;
        issues: string[];
      };
      completedAt: string;
    }>;
  }>;
}

export const PHASE_SEQUENCE: IncidentPhase[] = ['detect', 'diagnose', 'plan', 'verify', 'learn'];

export const PHASE_LABELS: Record<IncidentPhase, string> = {
  detect: 'Detect',
  diagnose: 'Diagnose',
  plan: 'Plan',
  verify: 'Verify',
  learn: 'Learn',
};

/** Compact labels for guided density / narrow stepper */
export const PHASE_SHORT: Record<IncidentPhase, string> = {
  detect: 'Det',
  diagnose: 'Diag',
  plan: 'Plan',
  verify: 'Ver',
  learn: 'Learn',
};

export const USER_MODE_LABELS: Record<UserMode, string> = {
  guided: 'Guided (1 safe route)',
  standard: 'Standard (balanced)',
  expert: 'Expert (deep details)',
};

export const RELEASE_GATE_LABELS: Record<ReleaseGatePosture, string> = {
  go: 'GO - Safe to release',
  'no-go': 'NO-GO - Holds detected',
  pending: 'Pending verification',
};

/**
 * Create initial state for Incident Studio
 */
export function createInitialState(overrides?: Partial<IncidentStudioState>): IncidentStudioState {
  return {
    currentPhase: 'detect',
    isPhaseTransitioning: false,
    userMode: 'standard',
    scopeType: 'workspace',
    health: {
      modulesOk: 0,
      modulesWarning: 0,
      modulesError: 0,
    },
    relatedFiles: [],
    policyGates: {
      flowState: 'pending',
      telemetryState: 'pending',
      releasePosture: 'pending',
    },
    releasePosture: 'pending',
    studioEvidence: undefined,
    messages: [],
    isStreaming: false,
    expandedSources: {},
    expertModeExpanded: false,
    actionItems: [],
    aiActionContract: null,
    aiActionRegistry: null,
    studioActionStatus: null,
    ...overrides,
  };
}

/**
 * Transition to next phase
 */
export function getNextPhase(current: IncidentPhase): IncidentPhase | null {
  const index = PHASE_SEQUENCE.indexOf(current);
  if (index === -1 || index === PHASE_SEQUENCE.length - 1) {
    return null;
  }
  return PHASE_SEQUENCE[index + 1];
}

/**
 * Check if transition is valid
 */
export function canTransitionToPhase(
  from: IncidentPhase,
  to: IncidentPhase,
  gates: PolicyGateState
): boolean {
  // In 'verify' phase, can only move forward if gates are passing
  if (from === 'verify' && gates.flowState === 'blocking') {
    return false;
  }
  // Can only move to next phase or previous phase
  const fromIndex = PHASE_SEQUENCE.indexOf(from);
  const toIndex = PHASE_SEQUENCE.indexOf(to);
  return Math.abs(fromIndex - toIndex) <= 1;
}
