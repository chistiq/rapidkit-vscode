import { describe, expect, it, vi } from 'vitest';

import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';

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
    await store.save(session('session-1', 520));
    const loaded = await store.load('session-1');

    expect(loaded?.events).toHaveLength(500);
    expect(loaded?.events[0]?.sequence).toBe(21);
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
});
