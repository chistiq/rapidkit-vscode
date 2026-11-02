import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';
import { StudioSubagentStore } from '../core/studioSubagentStore.js';
import { StudioHostToolOutputStore } from '../core/studioHostToolOutputStore.js';
import { StudioAttachmentStore } from '../core/studioAttachmentStore.js';
import { StudioRequestHistory } from '../core/studioRequestHistory.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import {
  studioSubagentHistoryTool,
  renderStudioSubagentHistory,
} from '../core/studioSubagentHistory.js';
import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';

let root: string;
let context: vscode.ExtensionContext;
const snapshot = (id: string, owner?: string): StudioAgentPersistedSession => ({
  schemaVersion: 'workspai.studio-agent-session.v1',
  id,
  workspacePath: '/workspace',
  cardId: owner ? 'assistant:subagent' : 'assistant:agent',
  assistantMode: owner ? 'ask' : 'agent',
  status: 'completed',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sequence: 1,
  ...(owner
    ? {
        parent: {
          sessionId: owner,
          requestId: 'request',
          toolCallId: 'delegation',
          kind: 'research' as const,
          objective: 'Inspect current source',
        },
      }
    : {}),
  events: [
    {
      schemaVersion: 'workspai.studio-agent-event.v1',
      id: `${id}:1`,
      sessionId: id,
      requestId: 'child-request',
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: 'tool.completed',
      data: {
        toolName: 'inspect-source',
        output: { path: 'src/service.ts', contentHash: 'known' },
      },
    },
  ],
});
const toolContext = (owner: string) => ({
  sessionId: owner,
  requestId: 'request',
  toolCallId: 'history',
  workspacePath: '/workspace',
  signal: new AbortController().signal,
});
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'subagent-lifecycle-'));
  context = {
    storageUri: { fsPath: root },
    workspaceState: { get: () => undefined, update: async () => {} },
  } as unknown as vscode.ExtensionContext;
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await fs.remove(root);
});

describe('Owned subagent traces and lifecycle', () => {
  it('keeps children out of the main 24-chat index and bounds the independent child archive', async () => {
    const store = new VSCodeStudioAgentSessionStore(context);
    for (let at = 0; at < 24; at++) {
      await store.save(snapshot(`chat-${at}`));
    }
    for (let at = 0; at < 30; at++) {
      await store.save(snapshot(`child-${at}`, 'chat-0'));
    }
    expect(await store.list()).toHaveLength(24);
    expect((await store.load('chat-0'))?.id).toBe('chat-0');
    const children = await new VSCodeStudioAgentSessionStore(context).listChildren('chat-0');
    expect(children).toHaveLength(24);
    expect(children.every((child) => child.active === false)).toBe(true);
    const child = children[0].childSessionId;
    expect((await store.loadChild('chat-0', child))?.session.parent?.sessionId).toBe('chat-0');
    expect(await store.loadChild('chat-1', child)).toBeUndefined();
    expect(await store.load(child)).toBeUndefined();
  });

  it('migrates legacy children only from an exact parent delegation receipt, including archived parent requests', async () => {
    const parent = snapshot('parent');
    const legacy = snapshot('legacy-child', 'parent');
    delete legacy.parent;
    parent.events[0].toolCallId = 'old-tool';
    parent.events[0].requestId = 'old-request';
    parent.events[0].data = {
      toolName: 'delegate-research',
      output: { results: [{ childSessionId: legacy.id, objective: 'Legacy findings' }] },
    };
    const unrelated = snapshot('unowned-child', 'other');
    delete unrelated.parent;
    await fs.writeJSON(path.join(root, 'studio-agent-sessions.v1.json'), {
      schemaVersion: 'workspai.studio-agent-session-store.v1',
      sessions: [parent, legacy, unrelated],
    });
    const store = new VSCodeStudioAgentSessionStore(context);
    const continued = snapshot('parent');
    continued.events[0].requestId = 'current-request';
    await store.save(continued);
    const migrated = await store.listChildren('parent');
    expect(migrated).toMatchObject([
      {
        childSessionId: 'legacy-child',
        requestId: 'old-request',
        toolCallId: 'old-tool',
        objective: 'Legacy findings',
      },
    ]);
    expect(await store.loadChild('parent', 'unowned-child')).toBeUndefined();
    const persisted = await fs.readJSON(path.join(root, 'studio-agent-sessions.v1.json'));
    expect(
      persisted.sessions.some(
        (session: StudioAgentPersistedSession) => session.id === 'legacy-child'
      )
    ).toBe(false);
    expect(
      persisted.sessions.some(
        (session: StudioAgentPersistedSession) => session.id === 'unowned-child'
      )
    ).toBe(true);
  });

  it('deletes the complete family, keeps other chats and prevents late snapshots, outputs and attachments from returning', async () => {
    const store = new VSCodeStudioAgentSessionStore(context);
    const output = new StudioHostToolOutputStore(root),
      attachments = new StudioAttachmentStore(root);
    const ref = `host-output-${crypto.randomUUID()}`;
    await store.save(snapshot('parent'));
    await store.save(snapshot('child', 'parent'));
    await store.save(snapshot('other'));
    await output.save('child', ref, 'child result', 12, [
      { mimeType: 'image/png', base64: 'YQ==' },
    ]);
    await output.save('parent', ref, 'root result', 11);
    await output.save('other', ref, 'other', 5);
    await attachments.save('child', 'turn-12345678', 'context', []);
    await new StudioRequestHistory(root).archive(snapshot('child', 'parent'));
    await store.delete('parent');
    await store.delete('parent');
    expect(await store.load('parent')).toBeUndefined();
    expect(await store.listChildren('parent')).toEqual([]);
    expect(await output.list('child')).toEqual([]);
    expect(await output.list('parent')).toEqual([]);
    await expect(attachments.read('child', 'turn-12345678')).rejects.toThrow();
    await store.save(snapshot('parent'));
    await store.save(snapshot('child', 'parent'));
    expect(await store.load('parent')).toBeUndefined();
    await expect(output.save('child', ref, 'late', 4)).rejects.toThrow('deleted');
    await expect(attachments.save('child', 'turn-12345678', 'late', [])).rejects.toThrow('deleted');
    expect((await store.load('other'))?.id).toBe('other');
    expect((await output.read('other', ref)).text).toBe('other');
    expect(
      await fs.pathExists(
        path.join(
          root,
          'assistant-subagents',
          crypto.createHash('sha256').update('parent').digest('hex')
        )
      )
    ).toBe(false);
  });

  it('retries a partially failed deletion from its durable family manifest', async () => {
    const parent = snapshot('parent');
    const child = snapshot('legacy-child', 'parent');
    delete child.parent;
    parent.events[0] = {
      ...parent.events[0],
      requestId: 'request',
      toolCallId: 'delegation',
      data: { toolName: 'delegate-task', output: { childSessionId: child.id } },
    };
    await fs.writeJSON(path.join(root, 'studio-agent-sessions.v1.json'), {
      schemaVersion: 'workspai.studio-agent-session-store.v1',
      sessions: [parent, child],
    });
    const ref = `host-output-${crypto.randomUUID()}`;
    const outputs = new StudioHostToolOutputStore(root);
    await outputs.save(child.id, ref, 'pending deletion', 16);
    const original = StudioAttachmentStore.prototype.delete;
    let fail = true;
    vi.spyOn(StudioAttachmentStore.prototype, 'delete').mockImplementation(async function (owner) {
      if (owner === 'parent' && fail) {
        fail = false;
        throw new Error('Temporary deletion failure');
      }
      return original.call(this, owner);
    });
    const store = new VSCodeStudioAgentSessionStore(context);
    await expect(store.delete('parent')).rejects.toThrow('Temporary deletion');
    expect(await store.load('parent')).toBeUndefined();
    expect((await fs.readJSON(path.join(root, 'studio-agent-sessions.v1.json'))).sessions).toEqual(
      []
    );
    await store.delete('parent');
    expect(await outputs.list(child.id)).toEqual([]);
    expect(
      await fs.pathExists(
        path.join(
          root,
          'assistant-tool-outputs',
          crypto.createHash('sha256').update(child.id).digest('hex')
        )
      )
    ).toBe(false);
  });

  it('cancels active children on deletion and reconciles a stopped trace without a historical spinner', async () => {
    const store = new VSCodeStudioAgentSessionStore(context);
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const child = new StudioAgentSession(
      {
        id: 'running-child',
        workspacePath: '/workspace',
        cardId: 'assistant:subagent',
        assistantMode: 'ask',
        parent: snapshot('running-child', 'parent').parent,
        requiresVerifiedCompletion: false,
        workspaceTrusted: true,
        permissionLevel: 'default',
      },
      {
        next: async () => {
          began();
          return new Promise(() => {});
        },
      },
      new StudioAgentToolRegistry(),
      store
    );
    const running = child.run('Research');
    await started;
    expect((await store.listChildren('parent'))[0].active).toBe(true);
    await store.delete('parent');
    expect((await running).status).toBe('cancelled');
    const orphan = snapshot('interrupted', 'other');
    orphan.status = 'running';
    await store.save(orphan);
    const result = await studioSubagentHistoryTool(context).execute({}, toolContext('other'));
    expect(result).toMatchObject({
      ok: true,
      output: { children: [{ status: 'interrupted', recordedStatus: 'running', active: false }] },
    });
  });

  it('recovers scoped public trace pages and child images after reload without exposing other parents', async () => {
    const store = new VSCodeStudioAgentSessionStore(context);
    const child = snapshot('child', 'parent');
    child.events = Array.from({ length: 30 }, (_, at) => ({
      ...child.events[0],
      sequence: at + 1,
      data: { toolName: 'inspect-source', summary: 'x'.repeat(2_000) },
    }));
    child.events.push({
      ...child.events[0],
      type: 'request.started',
      data: { request: 'Internal delegated prompt must not be rendered' },
    });
    await store.save(child);
    const ref = `host-output-${crypto.randomUUID()}`,
      image = { mimeType: 'image/png', base64: 'YQ==' };
    await new StudioHostToolOutputStore(root).save('child', ref, '', 0, [image]);
    const tool = studioSubagentHistoryTool(context);
    const page = await tool.execute({ childSessionId: 'child', limit: 40 }, toolContext('parent'));
    expect(JSON.stringify(page).length).toBeLessThan(15_000);
    expect(page).toMatchObject({
      ok: true,
      output: { nextOffset: expect.any(Number), outputs: [{ outputRef: ref, imageCount: 1 }] },
    });
    const nextOffset = (page.output as { nextOffset: number }).nextOffset;
    const next = await tool.execute(
      { childSessionId: 'child', offset: nextOffset },
      toolContext('parent')
    );
    expect(next.ok).toBe(true);
    expect((next.output as { events: Array<{ sequence: number }> }).events[0].sequence).toBe(
      nextOffset + 1
    );
    expect(
      await tool.execute({ childSessionId: 'child', outputRef: ref }, toolContext('parent'))
    ).toMatchObject({ ok: true, images: [image] });
    expect(
      (await tool.execute({ childSessionId: 'child', outputRef: ref }, toolContext('other'))).ok
    ).toBe(false);
    const text = await renderStudioSubagentHistory(context, {
      sessionId: 'parent',
      requestId: 'request',
      toolCallId: 'delegation',
    });
    expect(text).toContain('inspect-source');
    expect(text).not.toContain('Internal delegated prompt');
  });

  it('rejects tampered, symbolic-link and oversized snapshots and expires old records', async () => {
    const store = new StudioSubagentStore(root);
    await store.save(snapshot('child', 'parent'));
    const file = path.join(
      root,
      'assistant-subagents',
      crypto.createHash('sha256').update('parent').digest('hex'),
      'child-child.json'
    );
    const saved = await fs.readJSON(file);
    saved.session.parent.sessionId = 'different';
    await fs.writeJSON(file, saved);
    await expect(store.load('parent', 'child')).rejects.toThrow('ownership');
    await fs.remove(file);
    const outside = path.join(root, 'outside.json');
    await fs.writeJSON(outside, saved);
    await fs.symlink(outside, file);
    await expect(store.load('parent', 'child')).rejects.toThrow('snapshot');
    await fs.remove(file);
    const huge = snapshot('huge', 'parent');
    huge.events[0].data.output = 'x'.repeat(5 * 1024 * 1024);
    await expect(store.save(huge)).rejects.toThrow('budget');
    await store.save(snapshot('child', 'parent'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31 * 24 * 3600 * 1000);
    expect(await store.load('parent', 'child')).toBeUndefined();
  });

  it('protects active children when the snapshot quota is full', async () => {
    const store = new StudioSubagentStore(root, () => true);
    for (let at = 0; at < 24; at++) {
      const child = snapshot(`active-${at}`, 'parent');
      child.status = 'running';
      await store.save(child);
    }
    await expect(store.save(snapshot('extra', 'parent'))).rejects.toThrow('active snapshots');
    expect(await store.list('parent')).toHaveLength(24);
  });
});
