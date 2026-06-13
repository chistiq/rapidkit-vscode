import * as vscode from 'vscode';

export const INCIDENT_STUDIO_SESSION_KEY_PREFIX = 'rapidkit.incidentStudio.session.';

export const MAX_INCIDENT_STUDIO_APPROVAL_AUDIT_EVENTS = 50;
export const MAX_INCIDENT_STUDIO_CHAT_MESSAGES = 100;

export type IncidentStudioSessionPhase = 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';

export type IncidentStudioApprovalAuditOperation =
  | 'approval-confirmed'
  | 'approval-revoked'
  | 'apply-requested'
  | 'verify-requested'
  | 'rollback-requested';

export type IncidentStudioApprovalAuditEvent = {
  id: string;
  actionId: string;
  operation: IncidentStudioApprovalAuditOperation;
  title: string;
  summary?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  detail?: string;
  provider?: string;
  happenedAt: string;
};

export type IncidentStudioChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase?: IncidentStudioSessionPhase;
  confidence?: number;
  sources?: Array<{
    type?: string;
    label?: string;
    freshness?: string;
    confidence?: number;
  }>;
};

export type IncidentStudioSession = {
  workspacePath: string;
  phase: IncidentStudioSessionPhase;
  approvalAuditEvents: IncidentStudioApprovalAuditEvent[];
  chatMessages: IncidentStudioChatMessage[];
  updatedAt: string;
};

function buildIncidentStudioSessionKey(workspacePath: string): string {
  return `${INCIDENT_STUDIO_SESSION_KEY_PREFIX}${workspacePath.trim()}`;
}

function normalizePhase(value: unknown): IncidentStudioSessionPhase {
  if (
    value === 'detect' ||
    value === 'diagnose' ||
    value === 'plan' ||
    value === 'verify' ||
    value === 'learn'
  ) {
    return value;
  }
  return 'detect';
}

function normalizeApprovalOperation(value: unknown): IncidentStudioApprovalAuditOperation {
  if (
    value === 'approval-confirmed' ||
    value === 'approval-revoked' ||
    value === 'apply-requested' ||
    value === 'verify-requested' ||
    value === 'rollback-requested'
  ) {
    return value;
  }
  return 'approval-confirmed';
}

function normalizeApprovalAuditEvent(
  value: unknown,
  index: number
): IncidentStudioApprovalAuditEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const event = value as Record<string, unknown>;
  const actionId = typeof event.actionId === 'string' ? event.actionId.trim() : '';
  const title = typeof event.title === 'string' ? event.title.trim() : '';
  if (!actionId || !title) {
    return null;
  }

  return {
    id:
      typeof event.id === 'string' && event.id.trim()
        ? event.id.trim()
        : `approval-${Date.now()}-${index}`,
    actionId,
    operation: normalizeApprovalOperation(event.operation),
    title,
    summary: typeof event.summary === 'string' ? event.summary : undefined,
    riskLevel:
      event.riskLevel === 'low' || event.riskLevel === 'medium' || event.riskLevel === 'high'
        ? event.riskLevel
        : undefined,
    detail: typeof event.detail === 'string' ? event.detail : undefined,
    provider: typeof event.provider === 'string' ? event.provider : undefined,
    happenedAt:
      typeof event.happenedAt === 'string' && event.happenedAt.trim()
        ? event.happenedAt
        : new Date().toISOString(),
  };
}

function normalizeChatMessage(value: unknown, index: number): IncidentStudioChatMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const message = value as Record<string, unknown>;
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (!content) {
    return null;
  }

  const role = message.role === 'assistant' ? 'assistant' : 'user';

  return {
    id:
      typeof message.id === 'string' && message.id.trim()
        ? message.id.trim()
        : `message-${Date.now()}-${index}`,
    role,
    content,
    timestamp:
      typeof message.timestamp === 'string' && message.timestamp.trim()
        ? message.timestamp
        : new Date().toISOString(),
    phase: message.phase ? normalizePhase(message.phase) : undefined,
    confidence:
      typeof message.confidence === 'number' && Number.isFinite(message.confidence)
        ? message.confidence
        : undefined,
    sources: Array.isArray(message.sources)
      ? message.sources
          .filter(
            (source): source is Record<string, unknown> => !!source && typeof source === 'object'
          )
          .map((source) => ({
            type: typeof source.type === 'string' ? source.type : undefined,
            label: typeof source.label === 'string' ? source.label : undefined,
            freshness: typeof source.freshness === 'string' ? source.freshness : undefined,
            confidence:
              typeof source.confidence === 'number' && Number.isFinite(source.confidence)
                ? source.confidence
                : undefined,
          }))
      : undefined,
  };
}

function createEmptyIncidentStudioSession(workspacePath: string): IncidentStudioSession {
  return {
    workspacePath: workspacePath.trim(),
    phase: 'detect',
    approvalAuditEvents: [],
    chatMessages: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeIncidentStudioSession(
  workspacePath: string,
  value: unknown
): IncidentStudioSession {
  if (!value || typeof value !== 'object') {
    return createEmptyIncidentStudioSession(workspacePath);
  }

  const session = value as Record<string, unknown>;
  const approvalAuditEvents = Array.isArray(session.approvalAuditEvents)
    ? session.approvalAuditEvents
        .map((event, index) => normalizeApprovalAuditEvent(event, index))
        .filter((event): event is IncidentStudioApprovalAuditEvent => event !== null)
        .slice(0, MAX_INCIDENT_STUDIO_APPROVAL_AUDIT_EVENTS)
    : [];
  const chatMessages = Array.isArray(session.chatMessages)
    ? session.chatMessages
        .map((message, index) => normalizeChatMessage(message, index))
        .filter((message): message is IncidentStudioChatMessage => message !== null)
        .slice(-MAX_INCIDENT_STUDIO_CHAT_MESSAGES)
    : [];

  return {
    workspacePath: workspacePath.trim(),
    phase: normalizePhase(session.phase),
    approvalAuditEvents,
    chatMessages,
    updatedAt:
      typeof session.updatedAt === 'string' && session.updatedAt.trim()
        ? session.updatedAt
        : new Date().toISOString(),
  };
}

export function readIncidentStudioSession(
  context: vscode.ExtensionContext,
  workspacePath: string
): IncidentStudioSession {
  const trimmedWorkspacePath = workspacePath.trim();
  if (!trimmedWorkspacePath) {
    return createEmptyIncidentStudioSession('');
  }

  const stored = context.globalState.get<unknown>(
    buildIncidentStudioSessionKey(trimmedWorkspacePath)
  );
  return normalizeIncidentStudioSession(trimmedWorkspacePath, stored);
}

export async function writeIncidentStudioSession(
  context: vscode.ExtensionContext,
  workspacePath: string,
  session: IncidentStudioSession
): Promise<IncidentStudioSession> {
  const trimmedWorkspacePath = workspacePath.trim();
  if (!trimmedWorkspacePath) {
    return createEmptyIncidentStudioSession('');
  }

  const normalized = normalizeIncidentStudioSession(trimmedWorkspacePath, {
    ...session,
    workspacePath: trimmedWorkspacePath,
    updatedAt: new Date().toISOString(),
  });

  await context.globalState.update(buildIncidentStudioSessionKey(trimmedWorkspacePath), normalized);
  return normalized;
}

export async function appendApprovalAuditEvent(
  context: vscode.ExtensionContext,
  workspacePath: string,
  event: Omit<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'> &
    Partial<Pick<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'>>
): Promise<IncidentStudioSession> {
  const session = readIncidentStudioSession(context, workspacePath);
  const normalizedEvent =
    normalizeApprovalAuditEvent(event, session.approvalAuditEvents.length) ||
    normalizeApprovalAuditEvent(
      {
        ...event,
        title: event.title || 'Approval event',
        actionId: event.actionId || 'unknown-action',
      },
      session.approvalAuditEvents.length
    );

  if (!normalizedEvent) {
    return session;
  }

  return writeIncidentStudioSession(context, workspacePath, {
    ...session,
    approvalAuditEvents: [normalizedEvent, ...session.approvalAuditEvents].slice(
      0,
      MAX_INCIDENT_STUDIO_APPROVAL_AUDIT_EVENTS
    ),
  });
}

export async function replaceChatMessages(
  context: vscode.ExtensionContext,
  workspacePath: string,
  messages: IncidentStudioChatMessage[]
): Promise<IncidentStudioSession> {
  const session = readIncidentStudioSession(context, workspacePath);
  const normalizedMessages = messages
    .map((message, index) => normalizeChatMessage(message, index))
    .filter((message): message is IncidentStudioChatMessage => message !== null)
    .slice(-MAX_INCIDENT_STUDIO_CHAT_MESSAGES);

  return writeIncidentStudioSession(context, workspacePath, {
    ...session,
    chatMessages: normalizedMessages,
  });
}

export async function postSessionToWebview(
  webview: vscode.Webview,
  workspacePath: string,
  context: vscode.ExtensionContext
): Promise<void> {
  const session = readIncidentStudioSession(context, workspacePath);
  webview.postMessage({
    command: 'incidentStudioSessionLoaded',
    data: session,
  });
}
