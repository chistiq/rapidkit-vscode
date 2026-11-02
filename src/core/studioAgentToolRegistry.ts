import type { AIImageContent } from './aiImageContent.js';
export type StudioAgentToolRisk = 'read' | 'safe-write' | 'guarded-write' | 'invasive';
export type StudioAgentPermissionLevel = 'default' | 'autopilot';
export type StudioAgentApprovalExecution = 'once' | 'session' | 'project';

export type StudioAgentToolContext = {
  sessionId: string;
  requestId: string;
  toolCallId: string;
  workspacePath: string;
  projectPath?: string;
  /** Genuine user locators, supplied by the session host, never by tool arguments. */
  userRequestedPaths?: readonly string[];
  declinedProjectOnboarding?: readonly string[];
  evidenceGeneration?: string;
  approval?: StudioAgentToolApprovalGrant;
  signal: AbortSignal;
  /** Host-only delegation bridge. Never supplied by model arguments or passed to an external tool. */
  delegate?: {
    tools: ReadonlyArray<
      Pick<StudioAgentToolDefinition, 'name' | 'title' | 'description' | 'inputSchema'>
    >;
    remainingProviderRequests: number;
    remainingTokens: number;
    parentContext: string;
    subscribeToSteering?(
      listener: (message: string, images?: AIImageContent[]) => void
    ): () => void;
    invoke(name: string, input: unknown, reason: string): Promise<StudioAgentToolResult>;
  };
  reportProgress?(data: Record<string, unknown>): Promise<void>;
};

export type StudioAgentToolApprovalDescriptor = {
  fingerprint: string;
  title: string;
  summary: string;
  displayCommand?: string;
  cwd?: string;
  scope: 'workspace' | 'project';
  reasons: string[];
  execution: StudioAgentApprovalExecution;
  allowedExecutions?: StudioAgentApprovalExecution[];
  /** Optional onboarding may be declined while the original task continues unchanged. */
  optionalProjectOnboarding?: { projectPath: string };
};

export type StudioAgentToolApprovalRequest = StudioAgentToolApprovalDescriptor & {
  sessionId: string;
  requestId: string;
  toolCallId: string;
  toolName: string;
  modelReason: string;
};

export type StudioAgentToolApprovalDecision = {
  approved: boolean;
  fingerprint: string;
  approvedBy?: string;
  execution?: StudioAgentApprovalExecution;
};

export type StudioAgentToolApprovalGrant = {
  fingerprint: string;
  approvedBy: string;
  approvedAt: string;
  execution?: StudioAgentApprovalExecution;
};

export type StudioAgentToolAuthorization = {
  risk: StudioAgentToolRisk;
  approval?: StudioAgentToolApprovalDescriptor;
};

export type StudioAgentToolResult<T = unknown> = {
  ok: boolean;
  /** Host-validated execution directory, separate from optional canonical Workspai ownership. */
  executionTarget?: import('./studioProjectTarget.js').StudioExecutionTarget;
  /** Transient multimodal observations; never persist image bytes in session events. */
  images?: AIImageContent[];
  output?: T;
  error?: string;
  changed?: boolean;
  intelligencePhase?: string;
  evidenceGeneration?: string;
  blockerSignature?: string;
  cardBlocking?: boolean;
  terminalReason?: string;
  requiresUserDecision?: boolean;
};

export type StudioAgentToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  activity: 'inspect' | 'change' | 'verify' | 'complete';
  risk: StudioAgentToolRisk;
  /** Can run without validating the current execution target, e.g. selecting a replacement. */
  scopeIndependent?: boolean;
  /** Reject before authorization/execution if a governed Goal pins a different scope. */
  selectsExecutionTarget?: boolean;
  authorize?(
    input: TInput,
    context: Omit<StudioAgentToolContext, 'approval' | 'reportProgress'>
  ): Promise<StudioAgentToolAuthorization> | StudioAgentToolAuthorization;
  execute(input: TInput, context: StudioAgentToolContext): Promise<StudioAgentToolResult<TOutput>>;
};

export type StudioAgentPermissionDecision = {
  allowed: boolean;
  reason: string;
  requiresUserConfirmation: boolean;
};

export function resolveStudioAgentToolPermission(input: {
  level: StudioAgentPermissionLevel;
  risk: StudioAgentToolRisk;
  workspaceTrusted: boolean;
}): StudioAgentPermissionDecision {
  if (!input.workspaceTrusted) {
    return {
      allowed: false,
      reason: 'Studio Agent is disabled in an untrusted workspace.',
      requiresUserConfirmation: false,
    };
  }
  if (input.risk === 'read' || input.risk === 'safe-write') {
    return {
      allowed: true,
      reason: 'Workspace-scoped operation.',
      requiresUserConfirmation: false,
    };
  }
  if (input.level === 'autopilot' && input.risk === 'guarded-write') {
    return {
      allowed: true,
      reason: 'Autopilot permits governed reversible workspace changes.',
      requiresUserConfirmation: false,
    };
  }
  if (input.risk === 'invasive') {
    return {
      allowed: false,
      reason: 'Invasive operations require an explicit product-specific escalation path.',
      requiresUserConfirmation: true,
    };
  }
  return {
    allowed: false,
    reason: 'Guarded operation requires confirmation in default permission mode.',
    requiresUserConfirmation: true,
  };
}

export class StudioAgentToolRegistry {
  private readonly tools = new Map<string, StudioAgentToolDefinition>();

  register<TInput, TOutput>(tool: StudioAgentToolDefinition<TInput, TOutput>): void {
    if (!tool.name.trim() || this.tools.has(tool.name)) {
      throw new Error(`Studio Agent tool is missing a unique name: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as StudioAgentToolDefinition);
  }

  get(name: string): StudioAgentToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): StudioAgentToolDefinition[] {
    return [...this.tools.values()];
  }
}
