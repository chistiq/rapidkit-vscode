import { vscode } from '@/vscode';
import { truncateChatResponse, type ChatResponsePart } from './chatResponseParts';

/**
 * Chat session model shared by the Advisor (2.11e) and Studio (2.11f) tabs,
 * with persistence via `vscode.getState/setState` — mirroring the raw-HTML
 * sidebar's `workspaiImpact` / `workspaiStudio` session stores.
 */

export interface ChatTurn {
  executionTarget?: { ref: string; name: string };
  id?: string;
  attachmentStored?: boolean;
  attachmentError?: string;
  checkpointReview?: 'kept' | 'restored' | 'reapplied';
  checkpointError?: string;
  /** Arrival order of public text and tool activity for this response. */
  parts?: ChatResponsePart[];
  role: 'user' | 'assistant';
  content: string;
  /** In-memory previews; image bytes are omitted from synchronous webview persistence. */
  images?: Array<{ mimeType: string; base64: string }>;
  hasImage?: boolean;
  /** Host request identities and public tool activity owned by this assistant response. */
  requestIds?: string[];
  activity?: import('@/lib/sidebarStudioActionProgress').SidebarStudioActionProgressView[];
}

export type ChatSessionStatus = 'idle' | 'streaming' | 'done' | 'error';
export type ChatAssistantMode = 'agent' | 'ask' | 'plan' | 'goal';
export type ChatSessionKind = 'global' | 'scope' | 'artifact' | 'editor-issue';
export type ChatSessionIncidentRepairStatus = 'ready' | 'running' | 'review' | 'done' | 'blocked';

export interface ChatSessionScopeSnapshot {
  workspaceName?: string;
  workspacePath?: string;
  projectName?: string;
  projectPath?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ChatSessionIncident {
  key: string;
  workspaceName?: string;
  workspacePath?: string;
  projectName?: string;
  projectPath?: string;
  cardId: string;
  cardLabel?: string;
  cardStatus?: 'pass' | 'warn' | 'fail' | 'missing';
  scope?: 'workspace' | 'project';
  blockers?: string[];
  affectedProjectNames?: string[];
  doctorFindings?: import('@/lib/studioBlockerHandoff').StudioDoctorFindingView[];
  blockerSignature?: string;
  commandRunCount?: number;
  resolutionClass?: string;
  resolutionHints?: unknown[];
  studioMode?: string;
  sourceCommand?: string;
  artifactPath?: string;
  verifyCommand?: string;
  verifyArtifact?: string;
  incidentSummary?: {
    title: string;
    phase: 'detect' | 'diagnose' | 'fix' | 'verify' | 'audit';
    primaryAction: string;
    verifyRequired: boolean;
    auditStatus: 'not-started' | 'pending' | 'saved' | 'failed' | 'unknown';
  };
  repairStatus?: ChatSessionIncidentRepairStatus;
  lastActionTitle?: string;
  lastActionSummary?: string;
  lastActionAt?: string;
  terminalReason?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ChatSessionEditorIssue {
  key: string;
  filePath?: string;
  fileName?: string;
  languageId?: string;
  diagnosticSignature?: string;
  source?: string;
  trigger?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ChatModeSuggestion {
  fromMode: ChatAssistantMode;
  toMode: ChatAssistantMode;
  label: string;
  description: string;
  request: string;
}

export interface ChatSession {
  executionTarget?: { ref: string; name: string };
  sessionId: string;
  title: string;
  messages: ChatTurn[];
  status: ChatSessionStatus;
  /** Short host-authored description of the current model operation. */
  activityLabel?: string;
  /** The live host session is suspended until the user replies; no model work is running. */
  waitingForInput?: boolean;
  modelId?: string;
  error?: string;
  terminalReason?: string;
  /** Studio-only: the active mode for the session. */
  mode?: string;
  /** Immutable Assistant capability boundary for this conversation. */
  assistantMode?: ChatAssistantMode;
  /** Explicit user-confirmed transition offered by the intent execution policy. */
  modeSuggestion?: ChatModeSuggestion;
  /** Advisor/Studio: active workspace/project snapshot for ordinary scoped chats. */
  scope?: ChatSessionScopeSnapshot;
  /** Studio-only: card/artifact identity for dashboard-origin repair sessions. */
  incident?: ChatSessionIncident;
  /** Advisor/Studio: standalone editor diagnostic sessions, independent from workspace/project scope. */
  editorIssue?: ChatSessionEditorIssue;
}

/** Approval ownership follows the running request across steering turns. */
export function pendingChatApprovals(session: ChatSession | null) {
  if (session?.status !== 'streaming') {
    return [];
  }
  const currentRequests = new Set(
    session.messages.filter((turn) => turn.role === 'assistant').at(-1)?.requestIds ?? []
  );
  const latest = new Map<
    string,
    import('@/lib/sidebarStudioActionProgress').SidebarStudioActionProgressView
  >();
  for (const turn of session.messages) {
    for (const entry of turn.role === 'assistant' ? (turn.activity ?? []) : []) {
      if (entry.requestId && currentRequests.size && !currentRequests.has(entry.requestId)) {
        continue;
      }
      const key = `${entry.requestId ?? ''}:${entry.invocationId ?? entry.approvalRequest?.toolCallId ?? ''}`;
      if (!entry.invocationId && !entry.approvalRequest) {
        continue;
      }
      const previous = latest.get(key);
      if (
        previous &&
        (previous.eventSequence ?? 0) > (entry.eventSequence ?? Number.MAX_SAFE_INTEGER)
      ) {
        continue;
      }
      latest.set(key, entry);
    }
  }
  return [...latest.values()].filter(
    (entry) => entry.status === 'review' && entry.approvalRequest?.sessionId === session.sessionId
  );
}

export interface SidebarPersistedState {
  workspaiImpact?: { sessions: ChatSession[]; activeId: string | null };
  workspaiStudio?: { sessions: ChatSession[]; activeId: string | null };
}

export function chatSessionFailureLabel(session: ChatSession): string {
  return session.terminalReason === 'cancelled'
    ? 'Stopped'
    : session.terminalReason === 'ai-provider-timeout'
      ? 'Model request timed out'
      : session.terminalReason === 'ai-provider-unavailable'
        ? 'AI connection needed'
        : 'Needs attention';
}

const MAX_PERSISTED_SESSIONS = 24;
const MAX_PERSISTED_MESSAGES_PER_SESSION = 24;
const MAX_PERSISTED_MESSAGE_CHARS = 24_000;
const RESTORED_TRUNCATION_NOTE =
  '[Earlier text was truncated in this restored chat. Request the missing context if needed.]\n';

function compactPersistedSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.slice(0, MAX_PERSISTED_SESSIONS).map((session) => ({
    ...session,
    messages: session.messages.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION).map((original) => {
      const message = truncateChatResponse(
        original,
        MAX_PERSISTED_MESSAGE_CHARS,
        RESTORED_TRUNCATION_NOTE
      );
      return {
        ...message,
        images: undefined,
        activity: message.activity?.map((entry) => ({
          ...entry,
          outputText: entry.outputText
            ? '[Output is available in the durable host session; not retained in restored chat.]'
            : undefined,
          technicalDetail: undefined,
          summary: entry.summary?.slice(0, 1000),
          fileChanges: entry.fileChanges?.map((file) => ({ ...file, diffLines: undefined })),
        })),
        ...(message.hasImage || message.images?.length ? { hasImage: true } : {}),
        content: message.content,
      };
    }),
  }));
}

export function newSessionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sessionTitle(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, ' ');
  return trimmed.length > 48 ? `${trimmed.slice(0, 47)}…` : trimmed || 'New question';
}

export function basenameFromPath(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.split(/[\\/]/).filter(Boolean).pop();
}

export function chatSessionKind(session: ChatSession): ChatSessionKind {
  if (session.editorIssue) {
    return 'editor-issue';
  }
  if (session.incident) {
    return 'artifact';
  }
  if (
    session.scope?.workspaceName ||
    session.scope?.workspacePath ||
    session.scope?.projectName ||
    session.scope?.projectPath
  ) {
    return 'scope';
  }
  return 'global';
}

export function chatSessionGroupLabel(kind: ChatSessionKind): string {
  switch (kind) {
    case 'editor-issue':
      return 'Editor issues';
    case 'artifact':
      return 'Card fixes';
    case 'scope':
      return 'Workspace chats';
    case 'global':
    default:
      return 'Global chats';
  }
}

export function chatSessionWorkspaceLabel(session: ChatSession): string {
  if (session.executionTarget) {
    return session.executionTarget.name;
  }
  if (session.incident) {
    return (
      session.incident.workspaceName ||
      basenameFromPath(session.incident.workspacePath) ||
      'Unscoped workspace'
    );
  }
  if (session.scope) {
    return (
      session.scope.workspaceName ||
      basenameFromPath(session.scope.workspacePath) ||
      'Unscoped workspace'
    );
  }
  return session.editorIssue ? 'Editor' : 'Global';
}

export function chatSessionWorkspaceKey(session: ChatSession): string {
  if (session.executionTarget) {
    return `created:${session.executionTarget.ref}`;
  }
  if (session.incident?.workspacePath) {
    return `workspace:${session.incident.workspacePath}`;
  }
  if (session.scope?.workspacePath) {
    return `workspace:${session.scope.workspacePath}`;
  }
  return `${chatSessionKind(session)}:${chatSessionWorkspaceLabel(session)}`;
}

export function chatSessionProjectLabel(session: ChatSession): string | undefined {
  if (session.executionTarget) {
    return undefined;
  }
  if (session.incident) {
    return session.incident.projectName || basenameFromPath(session.incident.projectPath);
  }
  if (session.scope) {
    return session.scope.projectName || basenameFromPath(session.scope.projectPath);
  }
  return undefined;
}

export function chatSessionContextLabel(session: ChatSession): string {
  if (session.executionTarget) {
    return `${session.executionTarget.name} / workspace`;
  }
  if (session.editorIssue) {
    const file =
      session.editorIssue.fileName ||
      basenameFromPath(session.editorIssue.filePath) ||
      'editor issue';
    return session.editorIssue.languageId ? `${file} · ${session.editorIssue.languageId}` : file;
  }
  if (session.incident) {
    const workspace = chatSessionWorkspaceLabel(session);
    const project = chatSessionProjectLabel(session);
    return project ? `${workspace} / ${project}` : `${workspace} / workspace`;
  }
  if (session.scope) {
    const workspace = session.scope.workspaceName || basenameFromPath(session.scope.workspacePath);
    if (!workspace) {
      return 'No workspace selected';
    }
    const project = session.scope.projectName || basenameFromPath(session.scope.projectPath);
    return project ? `${workspace} / ${project}` : `${workspace} / workspace`;
  }
  return 'No workspace selected';
}

/** Last 8 turns, in the {role, content} shape the host expects for history. */
export function toHistory(session: ChatSession | undefined): ChatTurn[] {
  if (!session) {
    return [];
  }
  const turns = session.messages.filter((m) => m.content.trim().length > 0).slice(-8);
  let latestImage = -1;
  turns.forEach((turn, index) => {
    if (turn.images?.length) {
      latestImage = index;
    }
  });
  return turns.map((turn, index) => ({
    role: turn.role,
    ...(turn.id ? { id: turn.id } : {}),
    ...(turn.attachmentStored ? { attachmentStored: true } : {}),
    content:
      turn.hasImage && !turn.images?.length && !turn.attachmentStored
        ? `${turn.content}\n[Earlier image bytes were not retained after reload. Request reattachment if visual inspection is needed.]`
        : turn.content,
    ...(index === latestImage ? { images: turn.images } : {}),
  }));
}

function readState(): SidebarPersistedState {
  const state = vscode.getState<SidebarPersistedState>();
  return state && typeof state === 'object' ? state : {};
}

export function persistSessions(
  key: 'workspaiImpact' | 'workspaiStudio',
  sessions: ChatSession[],
  activeId: string | null
): void {
  const state = readState();
  state[key] = { sessions: compactPersistedSessions(sessions), activeId };
  vscode.setState(state);
}

export function loadSessions(key: 'workspaiImpact' | 'workspaiStudio'): {
  sessions: ChatSession[];
  activeId: string | null;
} {
  const state = readState();
  const slice = state[key] ?? (key === 'workspaiStudio' ? state.workspaiImpact : undefined);
  if (slice && Array.isArray(slice.sessions)) {
    return { sessions: slice.sessions, activeId: slice.activeId ?? null };
  }
  return { sessions: [], activeId: null };
}
