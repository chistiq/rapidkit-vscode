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
  assistantMode: 'agent' | 'ask' | 'plan';
  selectedModelId?: string;
  blockerSignature?: string;
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
