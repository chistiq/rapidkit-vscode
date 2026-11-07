import {
  studioActivityReceipt,
  isStudioActivityReceipt,
  correlateStudioActivityReceipts,
} from '../contracts/studioActivity.js';
import {
  StudioRequestHistory,
  studioSessionRequestId,
  type StudioRequestHistoryEntry,
} from './studioRequestHistory.js';
import type { StudioExecutionTarget } from './studioProjectTarget.js';
import type * as vscode from 'vscode';
import * as fs from 'fs-extra';
import path from 'node:path';

import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioAgentSessionStore } from './studioAgentSession.js';
import type { StudioAgentSession } from './studioAgentSession.js';
import { StudioSubagentStore } from './studioSubagentStore.js';
import { StudioAttachmentStore } from './studioAttachmentStore.js';
import { StudioHostToolOutputStore } from './studioHostToolOutputStore.js';
import { deleteStudioNativeSessionCheckpoints } from './studioNativeCheckpointLifecycle.js';
import { deleteStudioIsolatedTaskData } from './studioIsolatedTaskStorage.js';
import {
  isStudioSessionDeleted,
  markStudioSessionDeleted,
  studioDeletedSessionChildren,
} from './studioSessionDeletion.js';

const STORAGE_KEY = 'workspai.studioAgentSessions.v1';
const MAX_SESSIONS = 24;
const MAX_EVENTS_PER_SESSION = 500;
const MAX_SESSION_BYTES = 4 * 1024 * 1024;
const STORE_FILE_NAME = 'studio-agent-sessions.v1.json';

type StoredSessions = {
  schemaVersion: 'workspai.studio-agent-session-store.v1';
  sessions: StudioAgentPersistedSession[];
  deletedSessionIds?: string[];
};

const contextOperations = new WeakMap<object, Promise<void>>();
const storageOperations = new Map<string, Promise<void>>();
const active = new Map<string, Map<string, StudioAgentSession>>();
const historyListeners = new Set<(owner: string) => void>();
export function onStudioSubagentHistoryChanged(listener: (owner: string) => void): () => void {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
}
function historyChanged(owner: string): void {
  for (const listener of historyListeners) {
    try {
      listener(owner);
    } catch {
      /* A view notification must not fail a stored receipt. */
    }
  }
}
function storageRoot(context: vscode.ExtensionContext): string | undefined {
  const root = context.storageUri?.fsPath ?? context.globalStorageUri?.fsPath;
  return root ? path.resolve(root) : undefined;
}
function isChild(session: StudioAgentPersistedSession): boolean {
  return (
    Boolean(session.parent) ||
    ['assistant:subagent', 'assistant:execution-subagent'].includes(session.cardId)
  );
}
function childReferences(
  session: StudioAgentPersistedSession
): Map<string, NonNullable<StudioAgentPersistedSession['parent']>> {
  const children = new Map<string, NonNullable<StudioAgentPersistedSession['parent']>>();
  for (const event of session.events) {
    if (
      !event.requestId ||
      !event.toolCallId ||
      !['tool.progress', 'tool.completed', 'tool.failed'].includes(event.type)
    ) {
      continue;
    }
    const kind =
      event.data.toolName === 'delegate-research'
        ? 'research'
        : ['delegate-task', 'delegate-isolated-tasks'].includes(String(event.data.toolName))
          ? 'execution'
          : undefined;
    if (!kind) {
      continue;
    }
    const output = event.data.output as
      | {
          childSessionId?: unknown;
          results?: Array<{ childSessionId?: unknown; objective?: unknown }>;
          segments?: Array<{ childSessionId?: unknown; objective?: unknown }>;
        }
      | undefined;
    const input = event.data.input as { objective?: unknown } | undefined;
    const candidates = [
      {
        childSessionId: event.data.childSessionId ?? output?.childSessionId,
        objective: input?.objective,
      },
      ...(Array.isArray(output?.results) ? output.results : []),
      ...(Array.isArray(output?.segments) ? output.segments : []),
    ];
    for (const child of candidates) {
      if (
        typeof child.childSessionId === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(child.childSessionId) &&
        child.childSessionId !== session.id
      ) {
        children.set(child.childSessionId, {
          sessionId: session.id,
          requestId: event.requestId,
          toolCallId: event.toolCallId,
          kind,
          objective:
            typeof child.objective === 'string'
              ? child.objective.slice(0, 8_000)
              : 'Previous delegated task',
        });
      }
    }
  }
  return children;
}

function isStoredSessions(value: unknown): value is StoredSessions {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as StoredSessions).schemaVersion === 'workspai.studio-agent-session-store.v1' &&
    ((value as StoredSessions).deletedSessionIds === undefined ||
      (Array.isArray((value as StoredSessions).deletedSessionIds) &&
        (value as StoredSessions).deletedSessionIds!.every((id) => typeof id === 'string'))) &&
    Array.isArray((value as StoredSessions).sessions) &&
    (value as StoredSessions).sessions.every(
      (entry) =>
        entry &&
        typeof entry.id === 'string' &&
        (entry.activityLogOmitted === undefined ||
          (Number.isSafeInteger(entry.activityLogOmitted) && entry.activityLogOmitted >= 0)) &&
        (entry.activityLog === undefined ||
          (Array.isArray(entry.activityLog) &&
            entry.activityLog.every(
              (receipt) => isStudioActivityReceipt(receipt) && receipt.sessionId === entry.id
            ))) &&
        Array.isArray(entry.events) &&
        typeof entry.createdAt === 'string' &&
        typeof entry.updatedAt === 'string' &&
        typeof entry.workspacePath === 'string'
    )
  );
}

function storeFilePath(context: vscode.ExtensionContext): string | undefined {
  const storagePath = context.storageUri?.fsPath;
  return storagePath ? path.join(storagePath, STORE_FILE_NAME) : undefined;
}

async function persistStore(
  context: vscode.ExtensionContext,
  store: StoredSessions
): Promise<void> {
  const filePath = storeFilePath(context);
  if (!filePath) {
    await context.workspaceState.update(STORAGE_KEY, store);
    return;
  }

  await fs.ensureDir(path.dirname(filePath), { mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeJSON(tempPath, store, { mode: 0o600, flag: 'wx' });
    await fs.move(tempPath, filePath, { overwrite: true });
  } finally {
    await fs.remove(tempPath).catch(() => undefined);
  }
  // Migrate legacy state out of VS Code's synchronous workspace memento. Large
  // agent transcripts otherwise inflate extension-host hydration on every load.
  await context.workspaceState.update(STORAGE_KEY, undefined);
}

async function readStore(context: vscode.ExtensionContext): Promise<StoredSessions> {
  const filePath = storeFilePath(context);
  if (filePath && (await fs.pathExists(filePath))) {
    let stored: unknown;
    try {
      stored = await fs.readJSON(filePath);
    } catch {
      throw new Error(
        'Saved Studio sessions are unreadable; storage was not reset. Inspect the saved session file before continuing.'
      );
    }
    if (!isStoredSessions(stored)) {
      throw new Error('Saved Studio sessions have an invalid format; storage was not reset.');
    }
    return stored;
  }

  const stored = context.workspaceState.get<StoredSessions>(STORAGE_KEY);
  if (isStoredSessions(stored)) {
    if (filePath) {
      await persistStore(context, stored);
    }
    return stored;
  }
  return { schemaVersion: 'workspai.studio-agent-session-store.v1', sessions: [] };
}

async function serializeStoreOperation<T>(
  context: vscode.ExtensionContext,
  operation: () => Promise<T>
): Promise<T> {
  const key = storageRoot(context);
  const previous =
    (key ? storageOperations.get(key) : contextOperations.get(context)) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const pending = current.then(
    () => undefined,
    () => undefined
  );
  if (key) {
    storageOperations.set(key, pending);
  } else {
    contextOperations.set(context, pending);
  }
  void pending.then(() => {
    if (key && storageOperations.get(key) === pending) {
      storageOperations.delete(key);
    }
  });
  return current;
}

function boundedSession(
  session: StudioAgentPersistedSession,
  previous?: StudioAgentPersistedSession
): StudioAgentPersistedSession {
  if (previous?.createdAt !== session.createdAt) {
    previous = undefined;
  }
  const floor = previous?.activityLog?.[0]?.sequence ?? 0;
  const receipts = new Map(
    [
      ...(previous?.activityLog ?? []),
      ...(session.activityLog ?? []),
      ...session.events.flatMap((event) => {
        const receipt = studioActivityReceipt(event);
        return receipt && receipt.sequence >= floor ? [receipt] : [];
      }),
    ].map((receipt) => [receipt.eventId, receipt])
  );
  const allReceipts = correlateStudioActivityReceipts(
    [...receipts.values()].sort((a, b) => a.sequence - b.sequence)
  );
  const logLimit = 8000;
  const bounded: StudioAgentPersistedSession = {
    ...structuredClone(session),
    events: session.events.slice(-MAX_EVENTS_PER_SESSION),
    activityLog: allReceipts.slice(-logLimit),
    activityLogOmitted:
      Math.max(
        previous?.activityLogOmitted ?? 0,
        session.activityLogOmitted ?? 0,
        (allReceipts[0]?.sequence ?? 1) - 1
      ) + Math.max(0, allReceipts.length - logLimit),
  };
  // Keep room for current source/evidence and report any metadata retention limit.
  const receiptSizes = bounded.activityLog!.map(
    (receipt) => Buffer.byteLength(JSON.stringify(receipt), 'utf8') + 1
  );
  let logBytes = receiptSizes.reduce((sum, size) => sum + size, 2);
  let skipped = 0;
  while (skipped < receiptSizes.length - 1 && logBytes > 1024 * 1024) {
    logBytes -= receiptSizes[skipped++];
  }
  if (skipped) {
    bounded.activityLog = bounded.activityLog!.slice(skipped);
    bounded.activityLogOmitted! += skipped;
  }
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

function hasRequestEvidence(session: StudioAgentPersistedSession): boolean {
  return session.events.some(
    (event) =>
      Boolean(event.requestId) || !['session.created', 'session.status'].includes(event.type)
  );
}

export class VSCodeStudioAgentSessionStore implements StudioAgentSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private history(): StudioRequestHistory | undefined {
    const root = this.context.storageUri?.fsPath ?? this.context.globalStorageUri?.fsPath;
    return root ? new StudioRequestHistory(root) : undefined;
  }
  private children(): StudioSubagentStore | undefined {
    const root = storageRoot(this.context);
    return root
      ? new StudioSubagentStore(root, (id) => active.get(root)?.has(id) === true)
      : undefined;
  }
  track(session: StudioAgentSession): () => void {
    const root = storageRoot(this.context);
    if (!root) {
      return () => {};
    }
    const sessions = active.get(root) ?? new Map<string, StudioAgentSession>();
    const parent = session.snapshot().parent?.sessionId;
    sessions.set(session.id, session);
    active.set(root, sessions);
    return () => {
      if (sessions.get(session.id) === session) {
        sessions.delete(session.id);
      }
      if (!sessions.size && active.get(root) === sessions) {
        active.delete(root);
      }
      if (parent) {
        historyChanged(parent);
      }
    };
  }
  private async deleted(owner: string, store: StoredSessions): Promise<boolean> {
    const root = storageRoot(this.context);
    return (
      store.deletedSessionIds?.includes(owner) === true ||
      Boolean(root && (await isStudioSessionDeleted(root, owner)))
    );
  }

  async save(session: StudioAgentPersistedSession): Promise<void> {
    await serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      if (
        (await this.deleted(session.id, store)) ||
        (session.parent && (await this.deleted(session.parent.sessionId, store)))
      ) {
        active
          .get(storageRoot(this.context) ?? '')
          ?.get(session.id)
          ?.cancel();
        return;
      }
      if (session.parent) {
        const children = this.children();
        if (!children) {
          throw new Error('Private storage is required for delegated sessions.');
        }
        const previous = await children.load(session.parent.sessionId, session.id);
        await children.save(boundedSession(session, previous));
        historyChanged(session.parent.sessionId);
        return;
      }
      const previous = store.sessions.find((entry) => entry.id === session.id);
      if (
        previous &&
        hasRequestEvidence(previous) &&
        (previous.createdAt !== session.createdAt ||
          studioSessionRequestId(previous) !== studioSessionRequestId(session))
      ) {
        await this.history()?.archive(boundedSession(previous));
      }
      // Current-session eviction must not discard the only durable request snapshot.
      if (!previous && store.sessions.length >= MAX_SESSIONS) {
        const evicted = store.sessions.at(-1)!;
        if (hasRequestEvidence(evicted)) {
          await this.history()?.archive(boundedSession(evicted));
        }
      }
      const sessions = store.sessions.filter((entry) => entry.id !== session.id);
      sessions.unshift(boundedSession(session, previous));
      await persistStore(this.context, {
        ...store,
        schemaVersion: 'workspai.studio-agent-session-store.v1',
        sessions: sessions.slice(0, MAX_SESSIONS),
      } satisfies StoredSessions);
    });
  }

  async load(sessionId: string): Promise<StudioAgentPersistedSession | undefined> {
    return serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      if (await this.deleted(sessionId, store)) {
        return undefined;
      }
      let session = store.sessions.find((entry) => entry.id === sessionId);
      if (!session) {
        const latest = (await this.history()?.list(sessionId))?.[0];
        if (latest) {
          session = await this.history()?.load(sessionId, latest.requestId);
        }
      }
      return session && !isChild(session) ? structuredClone(session) : undefined;
    });
  }

  async listRequests(sessionId: string): Promise<StudioRequestHistoryEntry[]> {
    return serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      if (await this.deleted(sessionId, store)) {
        return [];
      }
      const archived = (await this.history()?.list(sessionId)) ?? [];
      const current = store.sessions.find((entry) => entry.id === sessionId);
      if (!current) {
        return archived;
      }
      const requestId = studioSessionRequestId(current);
      return [
        {
          requestId,
          status: current.status,
          updatedAt: current.updatedAt,
          workspacePath: current.workspacePath,
          bytes: Buffer.byteLength(JSON.stringify(current)),
          ...(current.executionTarget
            ? { executionTarget: structuredClone(current.executionTarget) }
            : {}),
        },
        ...archived.filter((entry) => entry.requestId !== requestId),
      ];
    });
  }

  async loadRequest(
    sessionId: string,
    requestId: string
  ): Promise<StudioAgentPersistedSession | undefined> {
    return serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      if (await this.deleted(sessionId, store)) {
        return undefined;
      }
      const current = store.sessions.find((entry) => entry.id === sessionId);
      if (current && studioSessionRequestId(current) === requestId) {
        return structuredClone(current);
      }
      return this.history()?.load(sessionId, requestId);
    });
  }

  async resolveExecutionTarget(
    sessionId: string,
    ref: string
  ): Promise<StudioExecutionTarget | undefined> {
    const entries = await this.listRequests(sessionId);
    return entries.find((entry) => entry.executionTarget?.ref === ref)?.executionTarget;
  }

  async delete(sessionId: string): Promise<void> {
    await serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      const root = storageRoot(this.context);
      const references = await this.references(sessionId, store);
      const family = new Set([
        sessionId,
        ...references.keys(),
        ...((await this.children()?.ids(sessionId)) ?? []),
        ...(root ? await studioDeletedSessionChildren(root, sessionId) : []),
      ]);
      if (root) {
        for (const session of active.get(root)?.values() ?? []) {
          if (session.snapshot().parent?.sessionId === sessionId) {
            family.add(session.id);
          }
        }
      }
      if (root) {
        await markStudioSessionDeleted(
          root,
          sessionId,
          [...family].filter((id) => id !== sessionId)
        );
        historyChanged(sessionId);
        for (const id of family) {
          if (id !== sessionId) {
            await markStudioSessionDeleted(root, id);
          }
          active.get(root)?.get(id)?.cancel();
        }
      }
      await this.children()?.delete(sessionId);
      await persistStore(this.context, {
        ...store,
        deletedSessionIds: [...new Set([...family, ...(store.deletedSessionIds ?? [])])].slice(
          0,
          256
        ),
        sessions: store.sessions.filter(
          (entry) => !family.has(entry.id) && entry.parent?.sessionId !== sessionId
        ),
      });
      for (const id of family) {
        await this.history()?.delete(id);
        if (root) {
          await new StudioHostToolOutputStore(root).delete(id);
          await new StudioAttachmentStore(root).delete(id);
          await deleteStudioNativeSessionCheckpoints(root, id);
          await deleteStudioIsolatedTaskData(root, id);
        }
      }
    });
  }

  async list(workspacePath?: string): Promise<StudioAgentPersistedSession[]> {
    return serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      const sessions = store.sessions;
      const retained: StudioAgentPersistedSession[] = [];
      for (const session of sessions) {
        if (
          !isChild(session) &&
          (!workspacePath || session.workspacePath === workspacePath) &&
          !(await this.deleted(session.id, store))
        ) {
          retained.push(structuredClone(session));
        }
      }
      return retained;
    });
  }
  private async references(owner: string, store: StoredSessions) {
    const snapshots = store.sessions.filter((session) => session.id === owner);
    for (const entry of (await this.history()?.list(owner)) ?? []) {
      const archived = await this.history()?.load(owner, entry.requestId);
      if (archived) {
        snapshots.push(archived);
      }
    }
    return new Map(snapshots.flatMap((snapshot) => [...childReferences(snapshot)]));
  }
  private async migrateChildren(owner: string, store: StoredSessions): Promise<void> {
    const children = this.children();
    if (!children) {
      return;
    }
    const moved = new Set<string>();
    for (const [id, parent] of await this.references(owner, store)) {
      if (await children.load(owner, id)) {
        continue;
      }
      let saved = store.sessions.find((session) => session.id === id);
      if (!saved) {
        const latest = (await this.history()?.list(id))?.[0];
        if (latest) {
          saved = await this.history()?.load(id, latest.requestId);
        }
      }
      if (!saved || !isChild(saved) || (saved.parent && saved.parent.sessionId !== owner)) {
        continue;
      }
      await children.save(boundedSession({ ...saved, parent }));
      moved.add(id);
    }
    if (moved.size) {
      store.sessions = store.sessions.filter((session) => !moved.has(session.id));
      await persistStore(this.context, store);
    }
  }
  async listChildren(owner: string) {
    return serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      if (await this.deleted(owner, store)) {
        return [];
      }
      await this.migrateChildren(owner, store);
      return ((await this.children()?.list(owner)) ?? []).map((entry) => ({
        ...entry,
        active: active.get(storageRoot(this.context) ?? '')?.has(entry.childSessionId) === true,
      }));
    });
  }
  async loadChild(owner: string, childId: string) {
    return serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      if (await this.deleted(owner, store)) {
        return undefined;
      }
      await this.migrateChildren(owner, store);
      const session = await this.children()?.load(owner, childId);
      if (!session) {
        return undefined;
      }
      return {
        session,
        active: active.get(storageRoot(this.context) ?? '')?.has(childId) === true,
      };
    });
  }
}
