import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';
import type { StudioAgentSession } from '../core/studioAgentSession.js';
const { register, open, show, render, fire, documents } = vi.hoisted(() => ({
  register: vi.fn(() => ({ dispose: vi.fn() })),
  open: vi.fn(async (uri) => ({ uri })),
  show: vi.fn(),
  render: vi.fn(async () => 'Recorded child evidence'),
  fire: vi.fn(),
  documents: [] as Array<{ uri: unknown }>,
}));
vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = fire;
    dispose() {}
  },
  workspace: {
    textDocuments: documents,
    registerTextDocumentContentProvider: register,
    openTextDocument: open,
  },
  window: { showTextDocument: show },
  Uri: { from: (value: unknown) => value },
}));
vi.mock('../core/studioSubagentHistory.js', () => ({ renderStudioSubagentHistory: render }));
import {
  registerStudioSubagentDocuments,
  showStudioSubagentActivity,
} from '../core/studioSubagentDocuments.js';
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  documents.length = 0;
  vi.useRealTimers();
});
describe('Read-only delegated activity documents', () => {
  it('registers durable identity resolution on activation and reopens the matching request without filesystem paths', async () => {
    const context = {} as vscode.ExtensionContext;
    const registration = registerStudioSubagentDocuments(context);
    const [scheme, provider] = register.mock.calls[0];
    expect(scheme).toBe('workspai-subagent');
    const target = { sessionId: 'parent', requestId: 'request-2', toolCallId: 'delegate-1' };
    await showStudioSubagentActivity(target);
    const uri = open.mock.calls[0][0];
    expect(uri).toMatchObject({ scheme, path: '/Subagent activity.log' });
    expect(await provider.provideTextDocumentContent(uri)).toBe('Recorded child evidence');
    expect(render).toHaveBeenCalledWith(context, target);
    expect(show).toHaveBeenCalledWith({ uri }, { preview: true });
    // A new activation resolves the stored identity instead of requiring an in-memory child object.
    const reloaded = registerStudioSubagentDocuments(context);
    await register.mock.calls[1][1].provideTextDocumentContent(uri);
    expect(render).toHaveBeenCalledTimes(2);
    await expect(showStudioSubagentActivity({ ...target, requestId: '' })).rejects.toThrow(
      'identity'
    );
    expect(open).toHaveBeenCalledOnce();
    registration.dispose();
    reloaded.dispose();
  });

  it('coalesces stored child updates, refreshes an open trace on deletion and stops notifications on disposal', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'subagent-documents-'));
    const context = {
      storageUri: { fsPath: root },
      workspaceState: { get: () => undefined, update: async () => {} },
    } as unknown as vscode.ExtensionContext;
    const registration = registerStudioSubagentDocuments(context);
    const uri = {
      scheme: 'workspai-subagent',
      query: 'session=parent&request=request&tool=tool',
      toString: () => 'trace:parent',
    };
    documents.push({ uri });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = new VSCodeStudioAgentSessionStore(context);
    const snapshot = {
      schemaVersion: 'workspai.studio-agent-session.v1' as const,
      id: 'child',
      workspacePath: '/workspace',
      cardId: 'assistant:subagent',
      status: 'running' as const,
      parent: {
        sessionId: 'parent',
        requestId: 'request',
        toolCallId: 'tool',
        kind: 'research' as const,
        objective: 'Inspect source',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sequence: 0,
      events: [],
    };
    try {
      await store.save(snapshot);
      await store.save({ ...snapshot, status: 'completed' });
      expect(fire).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(150);
      expect(fire).toHaveBeenCalledExactlyOnceWith(uri);
      const stopTracking = store.track({
        id: snapshot.id,
        snapshot: () => snapshot,
      } as StudioAgentSession);
      stopTracking();
      await vi.advanceTimersByTimeAsync(150);
      expect(fire).toHaveBeenCalledTimes(2);
      await store.delete('parent');
      await vi.advanceTimersByTimeAsync(150);
      expect(fire).toHaveBeenCalledTimes(3);
      registration.dispose();
      await store.save({
        ...snapshot,
        id: 'other-child',
        parent: { ...snapshot.parent, sessionId: 'other' },
      });
      await vi.advanceTimersByTimeAsync(150);
      expect(fire).toHaveBeenCalledTimes(3);
    } finally {
      registration.dispose();
      await fs.remove(root);
    }
  });
});
