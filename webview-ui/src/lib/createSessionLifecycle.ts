import type { CreateMessage, CreateSession } from '../sidebar/createTypes';

export const INTERRUPTED_CREATE_MESSAGE =
  'Creation was interrupted before completion. Review the last completed step, then start a new creation when ready.';

function interruptionMessage(session: CreateSession): CreateMessage {
  return {
    id: `interrupted-${session.sessionId}`,
    role: 'ai',
    kind: 'error',
    error: INTERRUPTED_CREATE_MESSAGE,
  };
}

/**
 * A persisted Create session is history, not proof that a subprocess is still
 * alive. The webview cannot safely resume an operation after rehydration, so
 * unfinished sessions become explicit, removable terminal records.
 */
export function settleInterruptedCreateSessions(
  sessions: CreateSession[],
  now = new Date().toISOString()
): CreateSession[] {
  return sessions.map((session) => {
    if (session.status !== 'planning' && session.status !== 'running') {
      return session;
    }
    const alreadyExplained = session.messages.some(
      (message) => message.kind === 'error' && message.id === `interrupted-${session.sessionId}`
    );
    return {
      ...session,
      status: 'error',
      updatedAt: now,
      messages: alreadyExplained
        ? session.messages
        : [...session.messages, interruptionMessage(session)],
    };
  });
}
