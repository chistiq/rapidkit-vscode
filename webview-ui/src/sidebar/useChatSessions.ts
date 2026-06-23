import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChatSession,
  type ChatTurn,
  loadSessions,
  newSessionId,
  persistSessions,
  sessionTitle,
  toHistory,
} from './sidebarSessions';

type StoreKey = 'workspaiImpact' | 'workspaiStudio';

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

  /**
   * Begin (or continue) a session with a user turn + an empty assistant
   * placeholder. Returns the session id and the prior turns (history).
   */
  const startQuery = useCallback(
    (
      question: string,
      mode?: string,
      options?: { forceNew?: boolean }
    ): { sessionId: string; history: ChatTurn[] } => {
      const current = stateRef.current;
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
    selectSession,
    deleteSession,
    startQuery,
    appendChunk,
    finishStreaming,
    failSession,
  };
}
