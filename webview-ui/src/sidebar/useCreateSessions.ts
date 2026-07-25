import { useCallback, useEffect, useRef, useState } from 'react';
import { vscode } from '@/vscode';
import type { CreateMessage, CreateSession, CreateSessionStatus } from './createTypes';

type PersistedCreateState = {
  workspaiCreate?: { sessions: CreateSession[]; activeId: string | null };
};

const MAX_SESSIONS = 24;
const MAX_MESSAGES = 48;

function loadCreateSessions(): { sessions: CreateSession[]; activeId: string | null } {
  const stored = (vscode.getState() ?? {}) as PersistedCreateState;
  const slice = stored.workspaiCreate;
  return slice && Array.isArray(slice.sessions)
    ? { sessions: slice.sessions, activeId: slice.activeId ?? null }
    : { sessions: [], activeId: null };
}

function persistCreateSessions(sessions: CreateSession[], activeId: string | null): void {
  const current = (vscode.getState() ?? {}) as PersistedCreateState;
  vscode.setState({
    ...current,
    workspaiCreate: {
      sessions: sessions.slice(0, MAX_SESSIONS).map((session) => ({
        ...session,
        messages: session.messages.slice(-MAX_MESSAGES),
      })),
      activeId,
    },
  });
}

function createSessionId(): string {
  return `create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createTitle(input: {
  target: 'workspace' | 'project';
  method: 'ai' | 'manual';
  request: string;
}): string {
  const normalized = input.request.trim().replace(/\s+/g, ' ');
  if (normalized) {
    return normalized.length > 52 ? `${normalized.slice(0, 51)}…` : normalized;
  }
  return `${input.method === 'ai' ? 'AI' : 'Manual'} ${input.target} creation`;
}

/** Durable, operation-scoped sessions for every Create flow. */
export function useCreateSessions() {
  const initial = loadCreateSessions();
  const [sessions, setSessions] = useState<CreateSession[]>(initial.sessions);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  const stateRef = useRef({ sessions, activeId });
  stateRef.current = { sessions, activeId };

  useEffect(() => {
    persistCreateSessions(sessions, activeId);
  }, [sessions, activeId]);

  const commit = useCallback((next: CreateSession[], nextActiveId = stateRef.current.activeId) => {
    stateRef.current = { sessions: next, activeId: nextActiveId };
    setSessions(next);
    setActiveId(nextActiveId);
  }, []);

  const startSession = useCallback(
    (input: {
      target: 'workspace' | 'project';
      method: 'ai' | 'manual';
      request: string;
      initialMessage: CreateMessage;
    }): string => {
      const now = new Date().toISOString();
      const session: CreateSession = {
        sessionId: createSessionId(),
        title: createTitle(input),
        target: input.target,
        method: input.method,
        status: input.method === 'ai' ? 'planning' : 'running',
        messages: [input.initialMessage],
        createdAt: now,
        updatedAt: now,
      };
      commit([session, ...stateRef.current.sessions], session.sessionId);
      return session.sessionId;
    },
    [commit]
  );

  const updateSession = useCallback(
    (sessionId: string, mutate: (session: CreateSession) => CreateSession) => {
      if (!sessionId) {
        return;
      }
      const next = stateRef.current.sessions.map((session) =>
        session.sessionId === sessionId
          ? { ...mutate(session), updatedAt: new Date().toISOString() }
          : session
      );
      commit(next);
    },
    [commit]
  );

  const appendMessage = useCallback(
    (sessionId: string, message: CreateMessage) => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: [...session.messages, message],
      }));
    },
    [updateSession]
  );

  const replaceMessages = useCallback(
    (sessionId: string, mutate: (messages: CreateMessage[]) => CreateMessage[]) => {
      updateSession(sessionId, (session) => ({ ...session, messages: mutate(session.messages) }));
    },
    [updateSession]
  );

  const setStatus = useCallback(
    (sessionId: string, status: CreateSessionStatus) => {
      updateSession(sessionId, (session) => ({ ...session, status }));
    },
    [updateSession]
  );

  const selectSession = useCallback((sessionId: string) => {
    stateRef.current = { ...stateRef.current, activeId: sessionId };
    setActiveId(sessionId);
  }, []);

  const deleteSession = useCallback(
    (sessionId: string) => {
      const next = stateRef.current.sessions.filter((session) => session.sessionId !== sessionId);
      const nextActiveId =
        stateRef.current.activeId === sessionId
          ? (next[0]?.sessionId ?? null)
          : stateRef.current.activeId;
      commit(next, nextActiveId);
    },
    [commit]
  );

  const newSession = useCallback(() => {
    stateRef.current = { ...stateRef.current, activeId: null };
    setActiveId(null);
  }, []);

  return {
    sessions,
    activeId,
    activeSession: sessions.find((session) => session.sessionId === activeId) ?? null,
    startSession,
    appendMessage,
    replaceMessages,
    setStatus,
    selectSession,
    deleteSession,
    newSession,
  };
}
