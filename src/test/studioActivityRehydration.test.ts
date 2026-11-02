import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { STUDIO_ACTIVITY_EVENTS, studioActivityReceipt } from '../contracts/studioActivity';
import type { ChatSession } from '../../webview-ui/src/sidebar/sidebarSessions';

const saved = vi.hoisted(() => ({ value: {} as Record<string, unknown>, post: vi.fn() }));
vi.mock('@/vscode', () => ({
  vscode: {
    getState: () => saved.value,
    setState: (value: Record<string, unknown>) => {
      saved.value = value;
    },
    postMessage: saved.post,
  },
}));
import { SecondarySidebar } from '../../webview-ui/src/sidebar/SecondarySidebar';

describe('Complete activity rehydration in the actual sidebar', () => {
  it('keeps every public event in its owning response without replaying approvals, narration or targets', async () => {
    const owner: ChatSession = {
      sessionId: 'history-owner',
      title: 'Chat',
      status: 'streaming',
      assistantMode: 'agent',
      executionTarget: { ref: 'current-target', name: 'Current workspace' },
      messages: [
        { role: 'user', content: 'Old task' },
        { role: 'assistant', content: 'Old answer', requestIds: ['old-request'] },
        { role: 'user', content: 'Continue with a new task' },
        { role: 'assistant', content: 'New response', requestIds: ['new-request'] },
      ],
    };
    saved.value = { workspaiStudio: { activeId: owner.sessionId, sessions: [owner] } };
    saved.post.mockClear();
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(SecondarySidebar)));
      const types = [...Object.keys(STUDIO_ACTIVITY_EVENTS), 'future.activity'];
      const events = types.map((type, i) => ({
        schemaVersion: 'workspai.studio-agent-event.v1',
        id: `history:${i}`,
        sequence: i + 1,
        sessionId: owner.sessionId,
        requestId: 'old-request',
        type,
        timestamp: '2026-11-02T20:00:00Z',
        ...(type.startsWith('tool.') || type === 'verify.completed'
          ? { toolCallId: 'old-call' }
          : {}),
        data: {
          toolName: 'invoke-host-tool',
          text: 'Do not append this to the new response',
          decisionId:
            type.startsWith('model.request.') || type === 'model.resolved'
              ? 'old-decision'
              : undefined,
          goal: { kind: 'test-coverage', summary: 'Must remain historical' },
          ref: 'old-target',
          name: 'Old workspace',
          executionTarget: { ref: 'old-target', name: 'Old workspace' },
          outcome: 'responded',
          durationMs: 43000,
          ok: true,
          cardBlocking: false,
          output: {
            ...(type === 'tool.completed'
              ? {
                  transactionId: 'native-11111111-1111-1111-1111-111111111111',
                  fileChanges: [
                    { relativePath: 'src/new.ts', status: 'added', addedLines: 3, removedLines: 0 },
                  ],
                }
              : {}),
            text: 'Host text output',
            contentParts: [{ kind: 'data', mimeType: 'application/test', supported: false }],
          },
          approval: { fingerprint: 'a'.repeat(64) },
          status: 'waiting-input',
        },
      }));
      // Mix compact receipts with full raw events, as the bounded durable store does.
      for (const [index, event] of events.entries()) {
        const receipt = studioActivityReceipt(event)!;
        const replayEvent =
          index % 2
            ? { ...event, data: { receiptReplay: receipt, output: event.data.output } }
            : event;
        await act(async () =>
          dom.window.dispatchEvent(
            new dom.window.MessageEvent('message', {
              data: {
                command: 'sidebarStudioAgentEvent',
                data: { event: replayEvent, replay: true },
              },
            })
          )
        );
      }
      const chat = (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0];
      const old = chat.messages[1],
        latest = chat.messages[3];
      const ids = new Set(
        old.activity?.flatMap((row) =>
          [...(row.phaseHistory ?? []), ...(row.receipt ? [row.receipt] : [])].map(
            (receipt) => receipt.eventId
          )
        )
      );
      expect(ids.size).toBe(events.length);
      expect(old.activity?.every((row) => row.status !== 'running' && !row.approvalRequest)).toBe(
        true
      );
      expect(old.activity?.some((row) => row.receipt?.unsupported)).toBe(true);
      expect(
        old.activity?.some((row) =>
          row.fileChanges?.some(
            (file) => file.relativePath === 'src/new.ts' && file.addedLines === 3
          )
        )
      ).toBe(true);
      expect(latest.content).toBe('New response');
      expect(latest.activity).toBeUndefined();
      expect(chat.executionTarget).toEqual(owner.executionTarget);
      expect(chat.status).toBe('streaming');
      expect(
        saved.post.mock.calls.some(([command]) => command === 'sidebarStudioToolApprovalDecision')
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});
