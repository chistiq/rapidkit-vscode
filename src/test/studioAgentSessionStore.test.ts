import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((entry) => fs.remove(entry)));
});

function session(id: string, eventCount = 1): StudioAgentPersistedSession {
  return {
    schemaVersion: 'workspai.studio-agent-session.v1',
    id,
    workspacePath: '/workspace',
    cardId: 'readiness',
    assistantMode: 'agent',
    status: 'running',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sequence: eventCount,
    events: Array.from({ length: eventCount }, (_, index) => ({
      schemaVersion: 'workspai.studio-agent-event.v1',
      id: `${id}:${index + 1}`,
      sessionId: id,
      sequence: index + 1,
      timestamp: '2026-07-20T00:00:00.000Z',
      type: 'model.message',
      data: { text: `${index}` },
    })),
  };
}

describe('VS Code Studio Agent session store', () => {
  it('persists bounded event streams and returns defensive copies', async () => {
    let value: unknown;
    const context = {
      workspaceState: {
        get: vi.fn(() => value),
        update: vi.fn(async (_key: string, next: unknown) => {
          value = next;
        }),
      },
    };
    const store = new VSCodeStudioAgentSessionStore(context as never);
    const pending = session('session-1', 520);
    pending.completionObligations = {
      schemaVersion: 'workspai.studio-completion-obligations.v1',
      latestSourceMutationSequence: 12,
      sourceReviewRequiredAfterSequence: 12,
      freshVerificationRequiredAfterSequence: 12,
    };
    await store.save(pending);
    const loaded = await store.load('session-1');

    expect(loaded?.events).toHaveLength(500);
    expect(loaded?.events[0]?.sequence).toBe(21);
    expect(loaded?.completionObligations).toEqual(pending.completionObligations);
    loaded!.status = 'failed';
    expect((await store.load('session-1'))?.status).toBe('running');
  });

  it('compacts oversized event payloads instead of failing the agent session', async () => {
    let value: unknown;
    const context = {
      workspaceState: {
        get: () => value,
        update: async (_key: string, next: unknown) => {
          value = next;
        },
      },
    };
    const store = new VSCodeStudioAgentSessionStore(context as never);
    const oversized = session('oversized', 12);
    oversized.events = oversized.events.map((event) => ({
      ...event,
      data: { output: 'x'.repeat(600_000) },
    }));

    await expect(store.save(oversized)).resolves.toBeUndefined();
    const loaded = await store.load('oversized');
    expect(loaded?.events.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(loaded), 'utf8')).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it('migrates legacy workspaceState payloads into storageUri files', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-store-'));
    tempRoots.push(storageRoot);
    let value: unknown = {
      schemaVersion: 'workspai.studio-agent-session-store.v1',
      sessions: [session('legacy-1', 2)],
    };
    const context = {
      storageUri: { fsPath: storageRoot },
      workspaceState: {
        get: vi.fn(() => value),
        update: vi.fn(async (_key: string, next: unknown) => {
          value = next;
        }),
      },
    };

    const store = new VSCodeStudioAgentSessionStore(context as never);
    const listed = await store.list('/workspace');
    expect(listed.map((entry) => entry.id)).toEqual(['legacy-1']);

    await store.save(session('legacy-2', 1));
    expect(value).toBeUndefined();
    expect(await fs.pathExists(path.join(storageRoot, 'studio-agent-sessions.v1.json'))).toBe(true);

    // Clear memento so subsequent reads prove file-backed persistence.
    value = undefined;
    const reloaded = await store.list('/workspace');
    expect(reloaded.map((entry) => entry.id)).toEqual(['legacy-2', 'legacy-1']);
  });
});
