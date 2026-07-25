import type * as vscode from 'vscode';

import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioAgentSessionStore } from './studioAgentSession.js';

const STORAGE_KEY = 'workspai.studioAgentSessions.v1';
const MAX_SESSIONS = 24;
const MAX_EVENTS_PER_SESSION = 500;
const MAX_SESSION_BYTES = 4 * 1024 * 1024;

type StoredSessions = {
  schemaVersion: 'workspai.studio-agent-session-store.v1';
  sessions: StudioAgentPersistedSession[];
};

function readStore(context: vscode.ExtensionContext): StoredSessions {
  const stored = context.workspaceState.get<StoredSessions>(STORAGE_KEY);
  if (stored?.schemaVersion !== 'workspai.studio-agent-session-store.v1') {
    return { schemaVersion: 'workspai.studio-agent-session-store.v1', sessions: [] };
  }
  return stored;
}

function boundedSession(session: StudioAgentPersistedSession): StudioAgentPersistedSession {
  const bounded: StudioAgentPersistedSession = {
    ...structuredClone(session),
    events: session.events.slice(-MAX_EVENTS_PER_SESSION),
  };
  while (
    bounded.events.length > 1 &&
    Buffer.byteLength(JSON.stringify(bounded), 'utf8') > MAX_SESSION_BYTES
  ) {
    bounded.events.shift();
  }
  if (Buffer.byteLength(JSON.stringify(bounded), 'utf8') > MAX_SESSION_BYTES) {
    const latest = bounded.events.at(-1);
    bounded.events = latest
      ? [
          {
            ...latest,
            data: {
              truncated: true,
              summary: 'The latest Studio Agent event exceeded the durable storage budget.',
            },
          },
        ]
      : [];
  }
  return bounded;
}

export class VSCodeStudioAgentSessionStore implements StudioAgentSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async save(session: StudioAgentPersistedSession): Promise<void> {
    const store = readStore(this.context);
    const sessions = store.sessions.filter((entry) => entry.id !== session.id);
    sessions.unshift(boundedSession(session));
    await this.context.workspaceState.update(STORAGE_KEY, {
      schemaVersion: 'workspai.studio-agent-session-store.v1',
      sessions: sessions.slice(0, MAX_SESSIONS),
    } satisfies StoredSessions);
  }

  async load(sessionId: string): Promise<StudioAgentPersistedSession | undefined> {
    const session = readStore(this.context).sessions.find((entry) => entry.id === sessionId);
    return session ? structuredClone(session) : undefined;
  }
}
