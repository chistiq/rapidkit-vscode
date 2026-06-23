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

export interface ChatSession {
  sessionId: string;
  title: string;
  messages: ChatTurn[];
  status: ChatSessionStatus;
  modelId?: string;
  error?: string;
  /** Studio-only: the active mode for the session. */
  mode?: string;
}

export interface SidebarPersistedState {
  workspaiImpact?: { sessions: ChatSession[]; activeId: string | null };
  workspaiStudio?: { sessions: ChatSession[]; activeId: string | null };
}

export function newSessionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sessionTitle(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, ' ');
  return trimmed.length > 48 ? `${trimmed.slice(0, 47)}…` : trimmed || 'New question';
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
  state[key] = { sessions, activeId };
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
