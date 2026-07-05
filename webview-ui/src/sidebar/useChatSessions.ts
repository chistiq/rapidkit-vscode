import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChatSession,
  type ChatSessionEditorIssue,
  type ChatSessionIncident,
  type ChatSessionScopeSnapshot,
  type ChatTurn,
  loadSessions,
  newSessionId,
  persistSessions,
  sessionTitle,
  toHistory,
} from './sidebarSessions';

type StoreKey = 'workspaiImpact' | 'workspaiStudio';

type OpenIncidentSessionInput = {
  title: string;
  mode?: string;
  incident: Omit<ChatSessionIncident, 'firstSeenAt' | 'lastSeenAt'>;
};

type IncidentSessionPatch = Partial<Omit<ChatSessionIncident, 'key' | 'firstSeenAt'>>;

type OpenEditorSessionInput = {
  title: string;
  mode?: string;
  editorIssue: Omit<ChatSessionEditorIssue, 'firstSeenAt' | 'lastSeenAt'>;
};

type OpenScopeSessionInput = {
  title: string;
  mode?: string;
  scope: Omit<ChatSessionScopeSnapshot, 'firstSeenAt' | 'lastSeenAt'>;
};

type StartQueryOptions = {
  forceNew?: boolean;
  scope?: Omit<ChatSessionScopeSnapshot, 'firstSeenAt' | 'lastSeenAt'> | null;
};

/**
 * Session state machine for the Advisor (2.11e) / Studio (2.11f) tabs:
 * create/select/delete sessions, append the user turn + an assistant
 * placeholder on submit, stream chunks, and finalize — persisting to
 * `vscode.getState` so threads survive webview reloads.
 */
export function useChatSessions(key: StoreKey, idPrefix: string) {
  const initial = loadSessions(key);
  const [sessions, setSessions] = useState<ChatSession[]>(initial.sessions);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);

  const stateRef = useRef({ sessions, activeId });
  stateRef.current = { sessions, activeId };

  useEffect(() => {
    persistSessions(key, sessions, activeId);
  }, [key, sessions, activeId]);

  const update = useCallback((sessionId: string, mutate: (session: ChatSession) => ChatSession) => {
    setSessions((prev) =>
      prev.map((session) => (session.sessionId === sessionId ? mutate(session) : session))
    );
  }, []);

  const newSession = useCallback(() => {
    stateRef.current = { ...stateRef.current, activeId: null };
    setActiveId(null);
  }, []);

  const selectSession = useCallback((id: string) => {
    stateRef.current = { ...stateRef.current, activeId: id };
    setActiveId(id);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.sessionId !== id));
    setActiveId((prev) => {
      const next = prev === id ? null : prev;
      stateRef.current = { ...stateRef.current, activeId: next };
      return next;
    });
  }, []);

  const openIncidentSession = useCallback(
    (input: OpenIncidentSessionInput): string => {
      const now = new Date().toISOString();
      const existing = stateRef.current.sessions.find(
        (session) => session.incident?.key === input.incident.key
      );
      const selectedId = existing?.sessionId ?? newSessionId(idPrefix);
      let nextSessionsSnapshot = stateRef.current.sessions;
      setSessions((prev) => {
        const found = prev.find((session) => session.sessionId === selectedId);
        if (found) {
          nextSessionsSnapshot = prev.map((session) =>
            session.sessionId === selectedId
              ? {
                  ...session,
                  title: input.title || session.title,
                  mode: input.mode ?? session.mode,
                  incident: {
                    ...session.incident,
                    ...input.incident,
                    firstSeenAt: session.incident?.firstSeenAt ?? now,
                    lastSeenAt: now,
                  },
                }
              : session
          );
          return nextSessionsSnapshot;
        }
        const created: ChatSession = {
          sessionId: selectedId,
          title: input.title,
          status: 'idle',
          mode: input.mode,
          messages: [],
          incident: {
            ...input.incident,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        };
        nextSessionsSnapshot = [created, ...prev];
        return nextSessionsSnapshot;
      });
      setActiveId(selectedId);
      if (!existing) {
        const created: ChatSession = {
          sessionId: selectedId,
          title: input.title,
          status: 'idle',
          mode: input.mode,
          messages: [],
          incident: {
            ...input.incident,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        };
        nextSessionsSnapshot = [created, ...stateRef.current.sessions];
      }
      stateRef.current = { sessions: nextSessionsSnapshot, activeId: selectedId };
      return selectedId;
    },
    [idPrefix]
  );

  const openEditorSession = useCallback(
    (input: OpenEditorSessionInput): string => {
      const now = new Date().toISOString();
      const existing = stateRef.current.sessions.find(
        (session) => session.editorIssue?.key === input.editorIssue.key
      );
      const selectedId = existing?.sessionId ?? newSessionId(idPrefix);
      let nextSessionsSnapshot = stateRef.current.sessions;
      setSessions((prev) => {
        const found = prev.find((session) => session.sessionId === selectedId);
        if (found) {
          nextSessionsSnapshot = prev.map((session) =>
            session.sessionId === selectedId
              ? {
                  ...session,
                  title: input.title || session.title,
                  mode: input.mode ?? session.mode,
                  editorIssue: {
                    ...session.editorIssue,
                    ...input.editorIssue,
                    firstSeenAt: session.editorIssue?.firstSeenAt ?? now,
                    lastSeenAt: now,
                  },
                }
              : session
          );
          return nextSessionsSnapshot;
        }
        const created: ChatSession = {
          sessionId: selectedId,
          title: input.title,
          status: 'idle',
          mode: input.mode,
          messages: [],
          editorIssue: {
            ...input.editorIssue,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        };
        nextSessionsSnapshot = [created, ...prev];
        return nextSessionsSnapshot;
      });
      setActiveId(selectedId);
      if (!existing) {
        const created: ChatSession = {
          sessionId: selectedId,
          title: input.title,
          status: 'idle',
          mode: input.mode,
          messages: [],
          editorIssue: {
            ...input.editorIssue,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        };
        nextSessionsSnapshot = [created, ...stateRef.current.sessions];
      }
      stateRef.current = { sessions: nextSessionsSnapshot, activeId: selectedId };
      return selectedId;
    },
    [idPrefix]
  );

  const openScopeSession = useCallback(
    (input: OpenScopeSessionInput): string => {
      const now = new Date().toISOString();
      const key = [
        input.scope.workspacePath ?? input.scope.workspaceName ?? 'workspace',
        input.scope.projectPath ?? input.scope.projectName ?? 'workspace',
      ].join('|');
      const existing = stateRef.current.sessions.find((session) => {
        if (session.incident || session.editorIssue || !session.scope) {
          return false;
        }
        return (
          [
            session.scope.workspacePath ?? session.scope.workspaceName ?? 'workspace',
            session.scope.projectPath ?? session.scope.projectName ?? 'workspace',
          ].join('|') === key
        );
      });
      const selectedId = existing?.sessionId ?? newSessionId(idPrefix);
      let nextSessionsSnapshot = stateRef.current.sessions;
      setSessions((prev) => {
        const found = prev.find((session) => session.sessionId === selectedId);
        if (found) {
          nextSessionsSnapshot = prev.map((session) =>
            session.sessionId === selectedId
              ? {
                  ...session,
                  title: input.title || session.title,
                  mode: input.mode ?? session.mode,
                  scope: {
                    ...session.scope,
                    ...input.scope,
                    firstSeenAt: session.scope?.firstSeenAt ?? now,
                    lastSeenAt: now,
                  },
                }
              : session
          );
          return nextSessionsSnapshot;
        }
        const created: ChatSession = {
          sessionId: selectedId,
          title: input.title,
          status: 'idle',
          mode: input.mode,
          messages: [],
          scope: {
            ...input.scope,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        };
        nextSessionsSnapshot = [created, ...prev];
        return nextSessionsSnapshot;
      });
      setActiveId(selectedId);
      if (!existing) {
        const created: ChatSession = {
          sessionId: selectedId,
          title: input.title,
          status: 'idle',
          mode: input.mode,
          messages: [],
          scope: {
            ...input.scope,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        };
        nextSessionsSnapshot = [created, ...stateRef.current.sessions];
      }
      stateRef.current = { sessions: nextSessionsSnapshot, activeId: selectedId };
      return selectedId;
    },
    [idPrefix]
  );

  const updateIncidentByKey = useCallback((key: string, patch: IncidentSessionPatch) => {
    const now = new Date().toISOString();
    setSessions((prev) =>
      prev.map((session) => {
        if (session.incident?.key !== key) {
          return session;
        }
        return {
          ...session,
          incident: {
            ...session.incident,
            ...patch,
            lastSeenAt: patch.lastSeenAt ?? now,
          },
        };
      })
    );
  }, []);

  /**
   * Begin (or continue) a session with a user turn + an empty assistant
   * placeholder. Returns the session id and the prior turns (history).
   */
  const startQuery = useCallback(
    (
      question: string,
      mode?: string,
      options?: StartQueryOptions
    ): { sessionId: string; history: ChatTurn[] } => {
      const current = stateRef.current;
      const now = new Date().toISOString();
      const existing =
        !options?.forceNew && current.activeId
          ? current.sessions.find((s) => s.sessionId === current.activeId)
          : undefined;
      const history = toHistory(existing);
      const sessionId = existing?.sessionId ?? newSessionId(idPrefix);

      setSessions((prev) => {
        const found = prev.find((s) => s.sessionId === sessionId);
        if (found) {
          return prev.map((s) =>
            s.sessionId === sessionId
              ? {
                  ...s,
                  status: 'streaming',
                  error: undefined,
                  mode: mode ?? s.mode,
                  scope:
                    s.incident || s.editorIssue
                      ? s.scope
                      : options?.scope
                        ? {
                            ...s.scope,
                            ...options.scope,
                            firstSeenAt: s.scope?.firstSeenAt ?? now,
                            lastSeenAt: now,
                          }
                        : s.scope,
                  messages: [
                    ...s.messages,
                    { role: 'user', content: question },
                    { role: 'assistant', content: '' },
                  ],
                }
              : s
          );
        }
        const created: ChatSession = {
          sessionId,
          title: sessionTitle(question),
          status: 'streaming',
          mode,
          scope: options?.scope
            ? {
                ...options.scope,
                firstSeenAt: now,
                lastSeenAt: now,
              }
            : undefined,
          messages: [
            { role: 'user', content: question },
            { role: 'assistant', content: '' },
          ],
        };
        return [created, ...prev];
      });
      setActiveId(sessionId);
      stateRef.current = { sessions: stateRef.current.sessions, activeId: sessionId };
      return { sessionId, history };
    },
    [idPrefix]
  );

  const appendChunk = useCallback(
    (sessionId: string, text: string) => {
      if (!text) {
        return;
      }
      update(sessionId, (session) => {
        const messages = [...session.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
          messages[lastIndex] = {
            role: 'assistant',
            content: messages[lastIndex].content + text,
          };
        } else {
          messages.push({ role: 'assistant', content: text });
        }
        return { ...session, status: 'streaming', messages };
      });
    },
    [update]
  );

  const finishStreaming = useCallback(
    (sessionId: string, modelId?: string, finalAnswer?: string) => {
      update(sessionId, (session) => {
        const messages = [...session.messages];
        const lastIndex = messages.length - 1;
        if (finalAnswer && lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
          messages[lastIndex] = { role: 'assistant', content: finalAnswer };
        }
        return { ...session, status: 'done', modelId, messages };
      });
    },
    [update]
  );

  const failSession = useCallback(
    (sessionId: string, error: string) => {
      update(sessionId, (session) => ({ ...session, status: 'error', error }));
    },
    [update]
  );

  return {
    sessions,
    activeId,
    setActiveId,
    newSession,
    openIncidentSession,
    openEditorSession,
    openScopeSession,
    updateIncidentByKey,
    selectSession,
    deleteSession,
    startQuery,
    appendChunk,
    finishStreaming,
    failSession,
  };
}
