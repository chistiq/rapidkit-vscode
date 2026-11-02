import {
  appendChatResponseText,
  finalizeChatResponseText,
  chatResponseParts,
  chatResponseActivityId,
} from './chatResponseParts';
import { settleStudioTimeline } from '@/lib/studioSessionLifecycle';
import { appendStudioRepairTimelineEntry } from '@/lib/studioRepairTimeline';
import type { SidebarStudioActionProgressView } from '@/lib/sidebarStudioActionProgress';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChatSession,
  type ChatAssistantMode,
  type ChatModeSuggestion,
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
type SessionScope = Omit<ChatSessionScopeSnapshot, 'firstSeenAt' | 'lastSeenAt'>;

type OpenIncidentSessionInput = {
  title: string;
  mode?: string;
  incident: Omit<ChatSessionIncident, 'firstSeenAt' | 'lastSeenAt'>;
};

type IncidentSessionPatch = Partial<Omit<ChatSessionIncident, 'key' | 'firstSeenAt'>>;

type OpenEditorSessionInput = {
  title: string;
  mode?: string;
  assistantMode?: ChatAssistantMode;
  editorIssue: Omit<ChatSessionEditorIssue, 'firstSeenAt' | 'lastSeenAt'>;
};

type OpenScopeSessionInput = {
  title: string;
  mode?: string;
  scope: SessionScope;
};

type StartQueryOptions = {
  images?: Array<{ mimeType: string; base64: string }>;
  forceNew?: boolean;
  assistantMode?: ChatAssistantMode;
  scope?: SessionScope | null;
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
          nextSessionsSnapshot = prev.map((session) => {
            if (session.sessionId !== selectedId) {
              return session;
            }
            const previousIncident = session.incident;
            return {
              ...session,
              title: input.title || session.title,
              mode: input.mode ?? session.mode,
              incident: {
                ...previousIncident,
                ...input.incident,
                repairStatus:
                  input.incident.repairStatus === 'ready' &&
                  previousIncident?.blockerSignature === input.incident.blockerSignature
                    ? (previousIncident?.repairStatus ?? input.incident.repairStatus)
                    : input.incident.repairStatus,
                firstSeenAt: previousIncident?.firstSeenAt ?? now,
                lastSeenAt: now,
              },
            };
          });
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
        (session) =>
          session.editorIssue?.key === input.editorIssue.key &&
          (!input.assistantMode || session.assistantMode === input.assistantMode)
      );
      const selectedId = existing?.sessionId ?? newSessionId(idPrefix);
      const session: ChatSession = existing
        ? {
            ...existing,
            title: input.title || existing.title,
            mode: input.mode ?? existing.mode,
            assistantMode: input.assistantMode ?? existing.assistantMode,
            editorIssue: {
              ...existing.editorIssue,
              ...input.editorIssue,
              firstSeenAt: existing.editorIssue?.firstSeenAt ?? now,
              lastSeenAt: now,
            },
          }
        : {
            sessionId: selectedId,
            title: input.title,
            status: 'idle',
            mode: input.mode,
            assistantMode: input.assistantMode,
            messages: [],
            editorIssue: {
              ...input.editorIssue,
              firstSeenAt: now,
              lastSeenAt: now,
            },
          };
      const nextSessionsSnapshot = existing
        ? stateRef.current.sessions.map((entry) =>
            entry.sessionId === selectedId ? session : entry
          )
        : [session, ...stateRef.current.sessions];
      stateRef.current = { sessions: nextSessionsSnapshot, activeId: selectedId };
      setSessions(nextSessionsSnapshot);
      setActiveId(selectedId);
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
      const session: ChatSession = existing
        ? {
            ...existing,
            title: input.title || existing.title,
            mode: input.mode ?? existing.mode,
            scope: {
              ...existing.scope,
              ...input.scope,
              firstSeenAt: existing.scope?.firstSeenAt ?? now,
              lastSeenAt: now,
            },
          }
        : {
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
      const nextSessionsSnapshot = existing
        ? stateRef.current.sessions.map((entry) =>
            entry.sessionId === selectedId ? session : entry
          )
        : [session, ...stateRef.current.sessions];
      stateRef.current = { sessions: nextSessionsSnapshot, activeId: selectedId };
      setSessions(nextSessionsSnapshot);
      setActiveId(selectedId);
      return selectedId;
    },
    [idPrefix]
  );

  const setSessionScope = useCallback((sessionId: string, scope: SessionScope) => {
    const now = new Date().toISOString();
    const session = stateRef.current.sessions.find((entry) => entry.sessionId === sessionId);
    if (!session || session.editorIssue || session.incident) {
      return;
    }
    const snapshot = {
      workspaceName: session.scope?.workspaceName ?? scope.workspaceName,
      workspacePath: session.scope?.workspacePath ?? scope.workspacePath,
      projectName: session.scope?.projectName ?? scope.projectName,
      projectPath: session.scope?.projectPath ?? scope.projectPath,
    };
    if (
      snapshot.workspaceName === session.scope?.workspaceName &&
      snapshot.workspacePath === session.scope?.workspacePath &&
      snapshot.projectName === session.scope?.projectName &&
      snapshot.projectPath === session.scope?.projectPath
    ) {
      return;
    }
    const nextSession: ChatSession = {
      ...session,
      scope: {
        ...session.scope,
        ...snapshot,
        firstSeenAt: session.scope?.firstSeenAt ?? now,
        lastSeenAt: now,
      },
    };
    const sessions = stateRef.current.sessions.map((entry) =>
      entry.sessionId === sessionId ? nextSession : entry
    );
    stateRef.current = { ...stateRef.current, sessions };
    setSessions(sessions);
  }, []);

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
    ): { sessionId: string; history: ChatTurn[]; session: ChatSession } => {
      const current = stateRef.current;
      const now = new Date().toISOString();
      const existing =
        !options?.forceNew && current.activeId
          ? current.sessions.find(
              (s) =>
                s.sessionId === current.activeId &&
                (!options?.assistantMode ||
                  !s.assistantMode ||
                  s.assistantMode === options.assistantMode)
            )
          : undefined;
      const history = toHistory(existing);
      const sessionId = existing?.sessionId ?? newSessionId(idPrefix);
      const session: ChatSession = existing
        ? {
            ...existing,
            status: 'streaming',
            waitingForInput: false,
            error: undefined,
            terminalReason: undefined,
            mode: mode ?? existing.mode,
            assistantMode: options?.assistantMode ?? existing.assistantMode,
            modeSuggestion: undefined,
            scope:
              existing.incident || existing.editorIssue || existing.scope
                ? existing.scope
                : options?.scope
                  ? {
                      ...options.scope,
                      firstSeenAt: now,
                      lastSeenAt: now,
                    }
                  : existing.scope,
            messages: [
              ...existing.messages,
              {
                id: newSessionId('turn'),
                role: 'user',
                content: question,
                images: options?.images,
              },
              { role: 'assistant', content: '' },
            ],
          }
        : {
            sessionId,
            title: sessionTitle(question),
            status: 'streaming',
            mode,
            assistantMode: options?.assistantMode,
            scope: options?.scope
              ? {
                  ...options.scope,
                  firstSeenAt: now,
                  lastSeenAt: now,
                }
              : undefined,
            messages: [
              {
                id: newSessionId('turn'),
                role: 'user',
                content: question,
                images: options?.images,
              },
              { role: 'assistant', content: '' },
            ],
          };
      const sessions = existing
        ? current.sessions.map((entry) => (entry.sessionId === sessionId ? session : entry))
        : [session, ...current.sessions];
      stateRef.current = { sessions, activeId: sessionId };
      setSessions(sessions);
      setActiveId(sessionId);
      return { sessionId, history, session };
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
          messages[lastIndex] = appendChatResponseText(messages[lastIndex], text);
        } else {
          messages.push({ role: 'assistant', content: text });
        }
        return {
          ...session,
          status: 'streaming',
          waitingForInput: false,
          activityLabel: undefined,
          messages,
        };
      });
    },
    [update]
  );

  const bindRequest = useCallback(
    (sessionId: string, requestId: string, replay = false) => {
      update(sessionId, (session) => {
        if (!requestId || session.messages.some((turn) => turn.requestIds?.includes(requestId))) {
          return session;
        }
        const messages = [...session.messages];
        const hasAssistant = messages.some((turn) => turn.role === 'assistant');
        // Historical replay must never claim a newer response. Legacy incident
        // sessions with no response at all still need an owner for their receipts.
        if (replay && hasAssistant) {
          return session;
        }
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role !== 'assistant') {
          index--;
        }
        if (index < 0 || messages[index].requestIds?.length || messages[index].content.trim()) {
          messages.push({
            id: newSessionId('turn'),
            role: 'assistant',
            content: '',
            requestIds: [requestId],
          });
        } else {
          messages[index] = { ...messages[index], requestIds: [requestId] };
        }
        return {
          ...session,
          messages,
          ...(replay
            ? {}
            : {
                status: 'streaming' as const,
                waitingForInput: false,
                error: undefined,
                terminalReason: undefined,
              }),
        };
      });
    },
    [update]
  );

  const setExecutionTarget = useCallback(
    (sessionId: string, target?: { ref: string; name: string }) => {
      update(sessionId, (session) => {
        const messages = [...session.messages];
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role !== 'assistant') {
          index -= 1;
        }
        if (index >= 0) {
          messages[index] = { ...messages[index], executionTarget: target };
        }
        return { ...session, executionTarget: target, messages };
      });
    },
    [update]
  );

  const recordActivity = useCallback(
    (sessionId: string, progress: SidebarStudioActionProgressView, historical = false) => {
      update(sessionId, (session) => {
        const messages = [...session.messages];
        let index = progress.invocationId
          ? messages
              .map(
                (turn) =>
                  turn.role === 'assistant' &&
                  turn.activity?.some(
                    (entry) =>
                      entry.invocationId === progress.invocationId &&
                      entry.requestId === progress.requestId
                  )
              )
              .lastIndexOf(true)
          : -1;
        if (index < 0) {
          index = messages.length - 1;
        }
        while (index >= 0) {
          const turn = messages[index];
          if (
            turn.role === 'assistant' &&
            (progress.requestId
              ? turn.requestIds?.includes(progress.requestId)
              : session.status === 'streaming')
          ) {
            break;
          }
          index--;
        }
        if (
          index < 0 &&
          !historical &&
          progress.requestId &&
          !messages.some((turn) => turn.role === 'assistant')
        ) {
          messages.push({
            id: newSessionId('turn'),
            role: 'assistant',
            content: '',
            requestIds: [progress.requestId],
          });
          index = messages.length - 1;
        }
        // Never move uncorrelated historical activity onto a newer response.
        if (index < 0) {
          return session;
        }
        const turn = messages[index];
        const parts = chatResponseParts(turn);
        const previous = (turn.activity ?? []).map((entry, at) => ({
          ...entry,
          transcriptId: chatResponseActivityId(entry, at),
        }));
        const activity = appendStudioRepairTimelineEntry(
          previous,
          {
            ...progress,
            transcriptId: newSessionId('activity'),
          },
          // Chat renders a paged transcript: keep separate tool invocations.
          false,
          8000
        );
        const ids = new Set(activity.map((entry) => entry.transcriptId!));
        const ordered = parts.filter((part) => part.kind !== 'activity' || ids.has(part.id));
        const byId = new Map(activity.map((entry) => [entry.transcriptId, entry]));
        const presentIds = new Set(
          ordered.flatMap((part) => (part.kind === 'activity' ? [part.id] : []))
        );
        for (const entry of activity) {
          if (!presentIds.has(entry.transcriptId!)) {
            const part = { kind: 'activity' as const, id: entry.transcriptId! };
            if (historical) {
              const sequence = entry.phaseHistory?.[0]?.sequence ?? entry.eventSequence ?? 0;
              let insertAt = ordered.findIndex(
                (part) =>
                  part.kind === 'activity' &&
                  (byId.get(part.id)?.phaseHistory?.[0]?.sequence ??
                    byId.get(part.id)?.eventSequence ??
                    0) > sequence
              );
              if (insertAt < 0) {
                const lastActivity = ordered
                  .map((part) => part.kind === 'activity')
                  .lastIndexOf(true);
                insertAt =
                  lastActivity >= 0
                    ? lastActivity + 1
                    : ordered.length && ordered.at(-1)?.kind === 'text'
                      ? ordered.length - 1
                      : ordered.length;
              }
              ordered.splice(insertAt, 0, part);
            } else {
              ordered.push(part);
            }
            presentIds.add(entry.transcriptId!);
          }
        }
        // Replay can arrive after a later result was already rendered. Sort only
        // adjacent activity parts; narration remains anchored between segments.
        for (let start = 0; historical && start < ordered.length; ) {
          if (ordered[start].kind !== 'activity') {
            start++;
            continue;
          }
          let end = start + 1;
          while (end < ordered.length && ordered[end].kind === 'activity') {
            end++;
          }
          const sorted = ordered
            .slice(start, end)
            .sort(
              (a, b) =>
                (a.kind === 'activity'
                  ? (byId.get(a.id)?.phaseHistory?.[0]?.sequence ??
                    byId.get(a.id)?.eventSequence ??
                    0)
                  : 0) -
                (b.kind === 'activity'
                  ? (byId.get(b.id)?.phaseHistory?.[0]?.sequence ??
                    byId.get(b.id)?.eventSequence ??
                    0)
                  : 0)
            );
          ordered.splice(start, end - start, ...sorted);
          start = end;
        }
        messages[index] = { ...turn, activity, parts: ordered };
        return { ...session, messages };
      });
    },
    [update]
  );

  const appendToolImages = useCallback(
    (sessionId: string, images: NonNullable<ChatTurn['images']>) => {
      update(sessionId, (session) => {
        const messages = [...session.messages];
        const last = messages.at(-1);
        if (last?.role === 'assistant') {
          messages[messages.length - 1] = {
            ...last,
            images: [...(last.images ?? []), ...images].slice(-4),
          };
        } else {
          messages.push({ role: 'assistant', content: '', images: images.slice(-4) });
        }
        return { ...session, messages };
      });
    },
    [update]
  );

  const restoreAttachments = useCallback(
    (
      sessionId: string,
      turnId: string,
      stored: boolean,
      images?: ChatTurn['images'],
      text?: string,
      error?: string
    ) => {
      update(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((turn) =>
          turn.id === turnId && turn.role === 'user'
            ? {
                ...turn,
                attachmentStored: stored,
                attachmentError: error,
                ...(images?.length ? { images, hasImage: true } : {}),
                ...(text ? { content: text } : {}),
              }
            : turn
        ),
      }));
    },
    [update]
  );

  const reviewCheckpoint = useCallback(
    (
      sessionId: string,
      requestIds: string[],
      transactionIds: string[],
      state?: 'kept' | 'restored' | 'reapplied',
      error?: string
    ) => {
      update(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((turn) => {
          if (!turn.requestIds?.some((id) => requestIds.includes(id))) {
            return turn;
          }
          return {
            ...turn,
            checkpointReview: state ?? turn.checkpointReview,
            checkpointError: error,
            activity:
              state === 'restored' || state === 'reapplied'
                ? turn.activity?.map((entry) =>
                    transactionIds.includes(entry.transactionId ?? '')
                      ? {
                          ...entry,
                          transactionState: state === 'restored' ? 'rolled-back' : 'applied',
                          canUndo: state === 'reapplied',
                        }
                      : entry
                  )
                : turn.activity,
          };
        }),
      }));
    },
    [update]
  );

  const setActivity = useCallback(
    (sessionId: string, activityLabel: string) => {
      const normalized = activityLabel.trim();
      if (!sessionId || !normalized) {
        return;
      }
      update(sessionId, (session) => ({
        ...session,
        status: 'streaming',
        activityLabel: normalized,
        waitingForInput: false,
      }));
    },
    [update]
  );

  const setWaitingForInput = useCallback(
    (sessionId: string, waitingForInput: boolean) => {
      update(sessionId, (session) => ({
        ...session,
        waitingForInput,
        activityLabel: waitingForInput ? 'Waiting for your input…' : undefined,
      }));
    },
    [update]
  );

  const setModeSuggestion = useCallback(
    (sessionId: string, suggestion: ChatModeSuggestion | undefined) => {
      update(sessionId, (session) => ({ ...session, modeSuggestion: suggestion }));
    },
    [update]
  );

  const finishStreaming = useCallback(
    (sessionId: string, modelId?: string, finalAnswer?: string, requestId?: string) => {
      update(sessionId, (session) => {
        const messages = [...session.messages];
        if (requestId && !messages.some((turn) => turn.role === 'assistant')) {
          messages.push({
            id: newSessionId('turn'),
            role: 'assistant',
            content: '',
            requestIds: [requestId],
          });
        }
        const lastIndex = requestId
          ? messages
              .map(
                (turn) => turn.role === 'assistant' && Boolean(turn.requestIds?.includes(requestId))
              )
              .lastIndexOf(true)
          : messages.length - 1;
        if (lastIndex < 0 && requestId) {
          return session;
        }
        if (finalAnswer) {
          if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
            messages[lastIndex] = finalizeChatResponseText(messages[lastIndex], finalAnswer);
          } else {
            messages.push({ role: 'assistant', content: finalAnswer });
          }
        }
        if (requestId && lastIndex !== messages.length - 1) {
          return { ...session, messages };
        }
        return {
          ...session,
          status: 'done',
          waitingForInput: false,
          activityLabel: undefined,
          modelId,
          messages: messages.map((turn) =>
            turn.activity ? { ...turn, activity: settleStudioTimeline(turn.activity) } : turn
          ),
        };
      });
    },
    [update]
  );

  const failSession = useCallback(
    (
      sessionId: string,
      error: string,
      finalAnswer?: string,
      requestId?: string,
      terminalReason?: string
    ) => {
      update(sessionId, (session) => {
        const messages = [...session.messages];
        if (requestId && !messages.some((turn) => turn.role === 'assistant')) {
          messages.push({
            id: newSessionId('turn'),
            role: 'assistant',
            content: '',
            requestIds: [requestId],
          });
        }
        const index = requestId
          ? messages
              .map(
                (turn) => turn.role === 'assistant' && Boolean(turn.requestIds?.includes(requestId))
              )
              .lastIndexOf(true)
          : messages.length - 1;
        if (index < 0 && requestId) {
          return session;
        }
        const last = messages[index];
        const answer =
          finalAnswer?.trim() ||
          (last?.role === 'assistant' && last.content.trim()
            ? undefined
            : `I could not finish this request. ${error}\n\nReview the retained work, then retry or provide the missing information. No verified completion is claimed.`);
        if (answer) {
          if (last?.role === 'assistant') {
            messages[index] = finalizeChatResponseText(last, answer);
          } else {
            messages.push({ role: 'assistant', content: answer });
          }
        }
        if (requestId && index !== messages.length - 1) {
          return { ...session, messages };
        }
        return {
          ...session,
          messages: messages.map((turn) =>
            turn.activity ? { ...turn, activity: settleStudioTimeline(turn.activity) } : turn
          ),
          status: 'error',
          waitingForInput: false,
          activityLabel: undefined,
          error,
          terminalReason,
        };
      });
    },
    [update]
  );

  const steerSession = useCallback(
    (sessionId: string, message: string, images?: ChatTurn['images']) => {
      const normalized = message.trim();
      if (!normalized) {
        return;
      }
      const turnId = newSessionId('turn');
      update(sessionId, (session) => ({
        ...session,
        waitingForInput: false,
        activityLabel: undefined,
        messages: [
          ...session.messages,
          {
            id: turnId,
            role: 'user',
            content: normalized,
            ...(images?.length ? { images, hasImage: true } : {}),
          },
          {
            role: 'assistant',
            content: '',
            requestIds: [...session.messages].reverse().find((turn) => turn.role === 'assistant')
              ?.requestIds,
          },
        ],
      }));
      return turnId;
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
    setSessionScope,
    updateIncidentByKey,
    selectSession,
    deleteSession,
    startQuery,
    setActivity,
    setWaitingForInput,
    appendChunk,
    bindRequest,
    recordActivity,
    setExecutionTarget,
    appendToolImages,
    restoreAttachments,
    reviewCheckpoint,
    finishStreaming,
    setModeSuggestion,
    failSession,
    steerSession,
  };
}
