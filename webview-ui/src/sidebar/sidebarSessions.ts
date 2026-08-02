import { vscode } from '@/vscode';

/**
 * Chat session model shared by the Advisor (2.11e) and Studio (2.11f) tabs,
 * with persistence via `vscode.getState/setState` — mirroring the raw-HTML
 * sidebar's `workspaiImpact` / `workspaiStudio` session stores.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatSessionStatus = 'idle' | 'streaming' | 'done' | 'error';
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

export interface ChatSession {
  sessionId: string;
  title: string;
  messages: ChatTurn[];
  status: ChatSessionStatus;
  /** Short host-authored description of the current model operation. */
  activityLabel?: string;
  modelId?: string;
  error?: string;
  /** Studio-only: the active mode for the session. */
  mode?: string;
  /** Advisor/Studio: active workspace/project snapshot for ordinary scoped chats. */
  scope?: ChatSessionScopeSnapshot;
  /** Studio-only: card/artifact identity for dashboard-origin repair sessions. */
  incident?: ChatSessionIncident;
  /** Advisor/Studio: standalone editor diagnostic sessions, independent from workspace/project scope. */
  editorIssue?: ChatSessionEditorIssue;
}

export interface SidebarPersistedState {
  workspaiImpact?: { sessions: ChatSession[]; activeId: string | null };
  workspaiStudio?: { sessions: ChatSession[]; activeId: string | null };
}

const MAX_PERSISTED_SESSIONS = 24;
const MAX_PERSISTED_MESSAGES_PER_SESSION = 24;
const MAX_PERSISTED_MESSAGE_CHARS = 24_000;

function compactPersistedSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.slice(0, MAX_PERSISTED_SESSIONS).map((session) => ({
    ...session,
    messages: session.messages.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION).map((message) => ({
      ...message,
      content:
        message.content.length > MAX_PERSISTED_MESSAGE_CHARS
          ? message.content.slice(-MAX_PERSISTED_MESSAGE_CHARS)
          : message.content,
    })),
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

export function chatSessionContextLabel(session: ChatSession): string {
  if (session.editorIssue) {
    const file =
      session.editorIssue.fileName ||
      basenameFromPath(session.editorIssue.filePath) ||
      'editor issue';
    return session.editorIssue.languageId ? `${file} · ${session.editorIssue.languageId}` : file;
  }
  if (session.incident) {
    const scope =
      session.incident.projectName ||
      session.incident.workspaceName ||
      basenameFromPath(session.incident.projectPath) ||
      basenameFromPath(session.incident.workspacePath) ||
      'workspace';
    return `${scope} · ${session.incident.cardLabel ?? session.incident.cardId}`;
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
  return session.messages
    .filter((m) => m.content.trim().length > 0)
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content }));
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
  const slice = state[key];
  if (slice && Array.isArray(slice.sessions)) {
    return { sessions: slice.sessions, activeId: slice.activeId ?? null };
  }
  return { sessions: [], activeId: null };
}
