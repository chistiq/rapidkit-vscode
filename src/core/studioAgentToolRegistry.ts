export type StudioAgentToolRisk = 'read' | 'safe-write' | 'guarded-write' | 'invasive';
export type StudioAgentPermissionLevel = 'default' | 'autopilot';

export type StudioAgentToolContext = {
  sessionId: string;
  requestId: string;
  toolCallId: string;
  workspacePath: string;
  projectPath?: string;
  evidenceGeneration?: string;
  signal: AbortSignal;
  reportProgress?(data: Record<string, unknown>): Promise<void>;
};

export type StudioAgentToolResult<T = unknown> = {
  ok: boolean;
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
