import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioBrowserTools, studioBrowserObservation } from '../core/studioBrowserTools.js';
import type { StudioAgentToolContext } from '../core/studioAgentToolRegistry.js';

let manager: StudioBrowserTools;
let browser: any;
let calls: Array<{ method: string; params: Record<string, unknown> }>;
const context = (): StudioAgentToolContext => ({
  sessionId: 'owner',
  requestId: 'r',
  toolCallId: 't',
  workspacePath: '/workspace',
  projectPath: '/workspace/project',
  signal: new AbortController().signal,
});
beforeEach(() => {
  manager = new StudioBrowserTools();
  calls = [];
  browser = {
    owner: 'owner',
    scope: '/workspace/project',
    root: '/workspace',
    nextId: 0,
    events: [],
    pending: new Map(),
    listeners: new Set(),
    socket: {
      send: vi.fn((raw: string) => {
        const request = JSON.parse(raw);
        calls.push(request);
        browser.pending
          .get(request.id)
          .resolve(
            request.method === 'Runtime.evaluate' ? { result: { value: { x: 12, y: 34 } } } : {}
          );
      }),
    },
  };
  (manager as unknown as { browsers: Map<string, unknown> }).browsers.set('browser', browser);
});
const tool = (readOnly = false) => manager.tools(readOnly)[0];
async function approved(input: Record<string, unknown>) {
  const request = { ...input, id: 'browser' };
  const authorization = await tool().authorize!(request, context());
  return tool().execute(request, {
    ...context(),
    approval: {
      fingerprint: authorization.approval!.fingerprint,
      approvedBy: 'user',
      approvedAt: new Date().toISOString(),
    },
  });
}

describe('Owned browser diagnostic and interaction adapters', () => {
  it('projects bounded observations before retaining event history and preserves navigation lifecycle identity', () => {
    const observation = studioBrowserObservation('Network.requestWillBeSent', {
      requestId: 'id',
      request: {
        url: 'https://user:password@example.test/api?token=secret#fragment',
        method: 'POST',
        headers: { Authorization: 'secret' },
        postData: 'secret',
      },
      initiator: { stack: 'unbounded' },
    });
    expect(observation).toMatchObject({
      params: { requestId: 'id', request: { url: 'https://example.test/api', method: 'POST' } },
    });
    expect(JSON.stringify(observation)).not.toMatch(/password|secret|headers|postData|initiator/);
    expect(
      studioBrowserObservation('Network.webSocketFrameReceived', {
        response: { payloadData: 'unbounded' },
      })
    ).toBeUndefined();
    expect(
      studioBrowserObservation('Page.lifecycleEvent', { loaderId: 'loader', name: 'load' })
    ).toMatchObject({ params: { loaderId: 'loader', name: 'load' } });
    const consoleEvent = studioBrowserObservation('Runtime.consoleAPICalled', {
      args: Array.from({ length: 100 }, () => ({ description: 'x'.repeat(9000) })),
    });
    expect(JSON.stringify(consoleEvent).length).toBeLessThan(10_000);
  });
  it('returns bounded network observations without request headers, bodies, queries or credentials', async () => {
    browser.events.push({
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'r1',
        request: {
          url: 'https://user:password@example.test/api?token=private#secret',
          method: 'POST',
          headers: { Authorization: 'private' },
          postData: 'private-body',
        },
      },
    });
    browser.events.push({
      method: 'Network.responseReceived',
      params: {
        requestId: 'r1',
        type: 'Fetch',
        response: {
          url: 'https://example.test/api?token=private',
          status: 201,
          mimeType: 'application/json',
          headers: { 'set-cookie': 'private' },
        },
      },
    });
    const output = await tool(true).execute({ operation: 'network', id: 'browser' }, context());
    expect(output).toMatchObject({
      ok: true,
      output: {
        entries: [
          { url: 'https://example.test/api', method: 'POST' },
          { url: 'https://example.test/api', status: 201 },
        ],
        coverage: { boundedHistory: true },
      },
    });
    expect(JSON.stringify(output)).not.toMatch(/password|private|Authorization|postData|token=/);
    expect(calls).toEqual([]);
  });

  it('exposes console observations without evaluating arbitrary page code or claiming task completion', async () => {
    browser.events.push({
      method: 'Runtime.consoleAPICalled',
      params: { type: 'error', timestamp: 123, args: [{ value: 'Request failed' }] },
    });
    expect(
      await tool(true).execute({ operation: 'console', id: 'browser' }, context())
    ).toMatchObject({
      ok: true,
      output: { entries: [{ type: 'error', message: 'Request failed' }] },
    });
    expect(calls).toEqual([]);
    await expect(
      tool(true).execute(
        { operation: 'console', id: 'browser' },
        { ...context(), sessionId: 'other' }
      )
    ).rejects.toThrow('owned');
    await expect(
      tool(true).execute(
        { operation: 'network', id: 'browser' },
        { ...context(), projectPath: '/workspace/sibling' }
      )
    ).rejects.toThrow('owned');
  });

  it('keeps hover, keyboard and dialog actions behind exact approval and emits pending effect scopes', async () => {
    await expect(
      tool().execute({ operation: 'press-key', key: 'Enter', id: 'browser' }, context())
    ).rejects.toThrow('approval');
    expect(() =>
      tool(true).authorize!({ operation: 'dialog', accept: true, id: 'browser' }, context())
    ).toThrow('Agent');
    expect(await approved({ operation: 'hover', selector: '#submit' })).toMatchObject({
      ok: true,
      output: { state: 'hover-dispatched', effects: { verificationScopes: ['browser:browser'] } },
    });
    expect(calls.at(-1)).toMatchObject({
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mouseMoved', x: 12, y: 34 },
    });
    expect(await approved({ operation: 'press-key', key: 'Enter' })).toMatchObject({
      ok: true,
      output: { state: 'key-dispatched' },
    });
    expect(calls.slice(-2).map((call) => call.params.type)).toEqual(['keyDown', 'keyUp']);
    expect(await approved({ operation: 'dialog', accept: false })).toMatchObject({
      ok: true,
      output: { state: 'dialog-handled' },
    });
    expect(calls.at(-1)).toMatchObject({
      method: 'Page.handleJavaScriptDialog',
      params: { accept: false },
    });
  });

  it('does not dispatch invalid keys, unknown actions or cancelled requests', async () => {
    await expect(approved({ operation: 'press-key', key: 'not-a-key' })).rejects.toThrow(
      'supported browser key'
    );
    expect(() => tool().authorize!({ operation: 'invented' }, context())).toThrow('Unknown');
    const controller = new AbortController();
    controller.abort();
    expect(
      await tool(true).execute(
        { operation: 'network', id: 'browser' },
        { ...context(), signal: controller.signal }
      )
    ).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });
});
