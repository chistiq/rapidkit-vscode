import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';
import { studioSessionHistoryTool } from '../core/studioSessionHistoryTool.js';
import { resolveStudioReviewWorkspace } from '../core/studioReviewWorkspace.js';
import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';

describe('Request history across chat continuations', () => {
  let root: string;
  const context = () =>
    ({
      storageUri: { fsPath: root },
      workspaceState: { get: () => undefined, update: async () => {} },
    }) as never;
  const snapshot = (owner: string, requestId: string, at = 0): StudioAgentPersistedSession => ({
    schemaVersion: 'workspai.studio-agent-session.v1',
    id: owner,
    workspacePath: '/original',
    cardId: 'assistant:agent',
    assistantMode: 'agent',
    status: 'completed',
    sequence: 1,
    createdAt: new Date(Date.now() + at).toISOString(),
    updatedAt: new Date(Date.now() + at).toISOString(),
    events: [
      {
        schemaVersion: 'workspai.studio-agent-event.v1',
        id: requestId,
        sessionId: owner,
        requestId,
        sequence: 1,
        timestamp: new Date().toISOString(),
        type: 'session.completed',
        data: { summary: `Delivered ${requestId}` },
      },
    ],
  });
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'request-history-'));
  });
  afterEach(async () => {
    await fs.remove(root);
  });

  it('retains prior evidence and resolves its historical destination after reload', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    const first = snapshot('chat', 'first');
    first.executionTarget = { ref: 'workspace-old', name: 'old', workspacePath: '/managed/old' };
    await store.save(first);
    const second = snapshot('chat', 'second', 1);
    second.executionTarget = { ref: 'workspace-new', name: 'new', workspacePath: '/managed/new' };
    await store.save(second);
    const reloaded = new VSCodeStudioAgentSessionStore(context());
    expect((await reloaded.load('chat'))?.executionTarget).toEqual(second.executionTarget);
    expect((await reloaded.loadRequest('chat', 'first'))?.events[0].data.summary).toBe(
      'Delivered first'
    );
    expect((await reloaded.listRequests('chat')).map((entry) => entry.requestId)).toEqual([
      'second',
      'first',
    ]);
    const validated: string[] = [];
    expect(
      await resolveStudioReviewWorkspace({
        record: { sessionId: 'chat', targetRef: 'workspace-old', workspacePath: '/original' },
        loadTarget: (owner, ref) => reloaded.resolveExecutionTarget(owner, ref),
        validateTarget: async (target) => {
          validated.push(target.ref);
        },
        fallback: async () => '/wrong',
      })
    ).toBe('/managed/old');
    expect(validated).toEqual(['workspace-old']);
  });
  it('archives two real controller runs without creating empty constructor-history entries', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    const options = {
      id: 'chat',
      workspacePath: '/original',
      cardId: 'assistant:ask',
      assistantMode: 'ask' as const,
      requiresVerifiedCompletion: false,
      permissionLevel: 'default' as const,
      workspaceTrusted: true,
      executionPolicy: {
        schemaVersion: 'workspai.assistant-execution-policy.v1' as const,
        selectedMode: 'ask' as const,
        requestIntent: 'question' as const,
        routeConfidence: 'high' as const,
        profile: 'evidence-answer' as const,
        toolMode: 'ask' as const,
      },
    };
    const first = await new StudioAgentSession(
      options,
      { next: async () => ({ type: 'complete', summary: 'Original findings remain available.' }) },
      new StudioAgentToolRegistry(),
      store
    ).run('Explain a concept');
    const firstRequest = first.events.find((event) => event.type === 'request.started')!.requestId!;
    const registry = new StudioAgentToolRegistry();
    registry.register(studioSessionHistoryTool(context()));
    const actions: StudioAgentModelAction[] = [
      {
        type: 'tool',
        toolName: 'inspect-assistant-history',
        input: { requestId: firstRequest },
        reason: 'Recover previous findings',
      },
      { type: 'complete', summary: 'Recovered prior findings as historical evidence.' },
    ];
    const second = await new StudioAgentSession(
      options,
      { next: async () => actions.shift()! },
      registry,
      store
    ).run('What did you find earlier?');
    expect(second.status).toBe('completed');
    expect(JSON.stringify(second.events)).toContain('Original findings remain available.');
    const history = await store.listRequests('chat');
    expect(history).toHaveLength(2);
    expect(history.some((entry) => entry.requestId.startsWith('legacy-'))).toBe(false);
  });

  it('exposes only the owning chat through the paged history tool', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    await store.save(snapshot('chat', 'first'));
    await store.save(snapshot('chat', 'second', 1));
    const tool = studioSessionHistoryTool(context());
    const owner = {
      sessionId: 'chat',
      requestId: 'current',
      toolCallId: 'inspect',
      workspacePath: '/original',
      signal: new AbortController().signal,
    };
    expect(await tool.execute({ limit: 1 }, owner)).toMatchObject({
      ok: true,
      output: { total: 2, nextOffset: 1 },
    });
    expect(await tool.execute({ requestId: 'first' }, owner)).toMatchObject({
      ok: true,
      output: {
        instruction: expect.stringContaining('Historical'),
        entries: [{ data: { summary: 'Delivered first' } }],
      },
    });
    expect(
      await tool.execute({ requestId: 'first' }, { ...owner, sessionId: 'other' })
    ).toMatchObject({ ok: false });
    await expect(tool.execute({ limit: 1000 }, owner)).rejects.toThrow('pagination');
  });
  it('archives resume boundaries and preserves the previous terminal outcome', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    const previous = snapshot('chat', 'first');
    previous.status = 'running'; // Resume has set running before emitting the new request identity.
    previous.events[0].type = 'session.failed';
    await store.save(previous);
    const next = snapshot('chat', 'second');
    next.createdAt = previous.createdAt;
    await store.save(next);
    expect((await store.loadRequest('chat', 'first'))?.status).toBe('failed');
  });
  it('bounds retained requests and archives current-session eviction', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    for (let at = 0; at < 35; at++) await store.save(snapshot('chat', `request-${at}`, at));
    expect(await store.listRequests('chat')).toHaveLength(33); // current plus 32 archives
    expect(await store.loadRequest('chat', 'request-0')).toBeUndefined();
    for (let at = 0; at < 24; at++)
      await store.save(snapshot(`other-${at}`, `other-request-${at}`, at));
    expect((await store.load('chat'))?.events[0].requestId).toBe('request-34');
    expect(await store.list()).toHaveLength(24);
    expect((await store.loadRequest('chat', 'request-34'))?.id).toBe('chat');
  });
  it('keeps its own history index readable when scope metadata is unusually long', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    for (let at = 0; at < 25; at++) {
      const entry = snapshot('chat', `request-${at}`, at);
      entry.workspacePath = '/' + 'nested-'.repeat(1800);
      await store.save(entry);
    }
    const directory = crypto.createHash('sha256').update('chat').digest('hex');
    expect(
      (await fs.stat(path.join(root, 'studio-request-history', directory, 'index.json'))).size
    ).toBeLessThan(256 * 1024);
    expect((await store.listRequests('chat')).length).toBeGreaterThan(1);
  });

  it('serializes simultaneous continuations and deletes current and archived data together', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    await Promise.all(
      Array.from({ length: 8 }, (_, at) => store.save(snapshot('chat', `request-${at}`, at)))
    );
    expect(await store.listRequests('chat')).toHaveLength(8);
    await store.save(snapshot('other', 'unrelated'));
    await store.delete('chat');
    await store.save(snapshot('chat', 'late-result')); // A finishing controller must not resurrect a deleted chat.
    expect(await store.load('chat')).toBeUndefined();
    expect(await store.listRequests('chat')).toEqual([]);
    expect((await store.load('other'))?.id).toBe('other');
    expect(
      await fs.pathExists(
        path.join(
          root,
          'studio-request-history',
          crypto.createHash('sha256').update('chat').digest('hex')
        )
      )
    ).toBe(false);
  });
  it('rejects a tampered archive instead of treating altered evidence as valid', async () => {
    const store = new VSCodeStudioAgentSessionStore(context());
    await store.save(snapshot('chat', 'first'));
    await store.save(snapshot('chat', 'second', 1));
    const hash = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
    const file = path.join(root, 'studio-request-history', hash('chat'), `${hash('first')}.json`);
    const archive = await fs.readJSON(file);
    archive.session.events[0].data.summary = 'Tampered claim';
    await fs.writeJSON(file, archive);
    await expect(store.loadRequest('chat', 'first')).rejects.toThrow('identity');
    expect((await store.load('chat'))?.events[0].data.summary).toBe('Delivered second');
  });

  it('does not replace an unreadable current store with an empty session list', async () => {
    const file = path.join(root, 'studio-agent-sessions.v1.json');
    await fs.writeFile(file, '{invalid');
    const store = new VSCodeStudioAgentSessionStore(context());
    await expect(store.save(snapshot('chat', 'first'))).rejects.toThrow('not reset');
    expect(await fs.readFile(file, 'utf8')).toBe('{invalid');
  });
});
