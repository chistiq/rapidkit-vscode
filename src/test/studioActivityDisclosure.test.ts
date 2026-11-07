import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/vscode', () => ({
  vscode: { getState: () => ({}), setState: vi.fn(), postMessage: vi.fn() },
}));
import { StudioActivityTranscript } from '../../webview-ui/src/sidebar/StudioActivityTranscript';
import { ChatTab } from '../../webview-ui/src/sidebar/ChatTab';
import { StudioChangedFilesSummary } from '../../webview-ui/src/sidebar/StudioChangedFilesSummary';
import { buildStudioChangedFilesSummary } from '../../webview-ui/src/lib/studioChangedFilesSummary';
import type { SidebarStudioActionProgressView } from '../../webview-ui/src/lib/sidebarStudioActionProgress';
import { studioEventProgress } from '../../webview-ui/src/lib/studioActivityView';
import { appendStudioRepairTimelineEntry } from '../../webview-ui/src/lib/studioRepairTimeline';

const entries = Array.from({ length: 45 }, (_, index) => ({
  transcriptId: `activity-${index}`,
  invocationId: `call-${index}`,
  requestId: 'r',
  action: 'inspect-source',
  status: 'done' as const,
  title: `Read ${index}`,
  summary: 'Inspected source',
  activityPaths: [`src/file-${index}.ts`],
  outputText: `Output ${index}`,
}));

describe('Stable activity disclosure', () => {
  let dom: JSDOM, root: Root;
  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
  const summary = () => document.querySelector<HTMLButtonElement>('.ws-activity__group-summary')!;
  it('labels workspace evidence as response readiness rather than full workflow verification', async () => {
    const outcome = studioEventProgress({
      id: 'end',
      sessionId: 's',
      requestId: 'r',
      sequence: 100,
      timestamp: '2026-11-06T19:00:00Z',
      type: 'session.completed',
      data: {
        verificationAuthority: 'workspace-evidence',
        summary: 'Static checks passed; setup was not rerun.',
      },
    })!;
    await act(async () =>
      root.render(
        createElement(StudioActivityTranscript, { entries: [...entries.slice(0, 9), outcome] })
      )
    );
    expect(summary().textContent).toContain('Response ready');
    expect(summary().textContent).not.toContain('Completed');
  });
  it('coalesces streamed model progress into its decision and never revives a spinner after a late update', async () => {
    const event = (sequence: number, type: string, data: object = {}) =>
      studioEventProgress({
        id: `stream:${sequence}`,
        sessionId: 's',
        requestId: 'r',
        sequence,
        timestamp: '2026-11-04T18:00:00Z',
        type,
        data: { decisionId: 'decision', ...data },
      })!;
    const started = event(1, 'model.request.started');
    const progress = event(2, 'model.request.progress', {
      receivedBytes: 300,
      summary: 'Receiving response',
    });
    const stopped = event(3, 'model.request.finished', { outcome: 'cancelled' });
    let timeline: SidebarStudioActionProgressView[] = [];
    for (const entry of [started, progress, stopped, progress]) {
      timeline = appendStudioRepairTimelineEntry(timeline, entry);
    }
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      title: 'Model request cancelled',
      status: 'review',
      eventSequence: 3,
    });
    expect(timeline[0].phaseHistory).toHaveLength(3);
    await act(async () =>
      root.render(createElement(StudioActivityTranscript, { entries: timeline, active: false }))
    );
    expect(document.querySelector('.ws-activity__spinner')).toBeNull();
    expect(document.body.textContent).toContain('Model request cancelled');
  });
  it('counts work operations separately from lifecycle telemetry and a repeated failure outcome', async () => {
    const types = [
      'request.started',
      'session.status',
      'model.checkpoint',
      'tool.completed',
      'tool.completed',
      'tool.completed',
      'tool.completed',
      'tool.completed',
      'model.request.finished',
      'session.failed',
    ];
    const progress = types.map(
      (type, sequence) =>
        studioEventProgress({
          id: `s:${sequence}`,
          sessionId: 's',
          requestId: 'r',
          sequence,
          timestamp: '2026-11-04T18:00:00Z',
          type,
          ...(type.startsWith('tool.') ? { toolCallId: `call-${sequence}` } : {}),
          data: type.startsWith('tool.')
            ? { toolName: 'inspect-source' }
            : type.startsWith('model.')
              ? { decisionId: 'failed-model', outcome: 'failed' }
              : {},
        })!
    );
    await act(async () =>
      root.render(createElement(StudioActivityTranscript, { entries: progress }))
    );
    expect(summary().textContent).toContain('5 steps');
    expect(summary().textContent).toContain('1 failed');
    expect(summary().textContent).not.toContain('2 failed');
    expect(summary().textContent).toContain('Needs attention');
  });
  it('labels inspected diffs as observations rather than newly authored edits', async () => {
    await act(async () =>
      root.render(
        createElement(StudioActivityTranscript, {
          entries: [
            {
              action: 'inspect-workspace-changes',
              status: 'done',
              title: 'Changed 1 file',
              summary: '',
              fileChanges: [
                {
                  relativePath: 'poetry.lock',
                  status: 'modified',
                  addedLines: 66,
                  removedLines: 68,
                },
              ],
            },
          ],
        })
      )
    );
    const row = document.querySelector<HTMLDetailsElement>('.ws-activity__step')!;
    expect(row.querySelector('summary')!.textContent).toContain('Reviewed changes in 1 file');
    await act(async () => {
      row.open = true;
      row.dispatchEvent(new dom.window.Event('toggle'));
    });
    expect(row.querySelector('.ws-activity__file')!.textContent).toContain('Observed');
    expect(row.querySelector('.ws-activity__file')!.textContent).not.toContain('Edited');
  });
  it('counts owned changes consistently with the dock and retains recovered failures without marking completion blocked', async () => {
    const owned: SidebarStudioActionProgressView[] = [
      ...entries.slice(0, 5),
      {
        action: 'inspect-workspace-changes',
        title: 'Review existing changes',
        summary: '',
        status: 'done',
        fileChanges: Array.from({ length: 42 }, (_, i) => ({
          relativePath: `preexisting-${i}.ts`,
          status: 'modified',
          addedLines: 100,
        })),
      },
      {
        action: 'apply-workspace-patch',
        title: 'Apply edit',
        summary: '',
        status: 'done',
        transactionId: 'native-source',
        transactionState: 'applied',
        fileChanges: [
          { relativePath: 'todo/main.py', status: 'added', addedLines: 80, removedLines: 0 },
          { relativePath: 'todo/test_main.py', status: 'added', addedLines: 53, removedLines: 0 },
        ],
      },
      {
        action: 'run-workspace-command',
        title: 'Failed first attempt',
        summary: 'Missing executable',
        status: 'failed',
      },
      {
        action: 'run-workspace-command',
        title: 'Run tests',
        summary: '',
        status: 'done',
        transactionId: 'native-cache',
        transactionState: 'applied',
        fileChanges: [
          { relativePath: 'todo/__pycache__/main.pyc', status: 'added', binary: true },
          { relativePath: 'todo/__pycache__/test_main.pyc', status: 'added', binary: true },
        ],
      },
      {
        action: 'assistant-session',
        title: 'Completed',
        summary: 'Done',
        status: 'done',
        eventType: 'session.completed',
        eventSequence: 20,
      },
    ];
    await act(async () =>
      root.render(
        createElement(
          'div',
          {},
          createElement(StudioActivityTranscript, { entries: owned }),
          createElement(StudioChangedFilesSummary, {
            summary: buildStudioChangedFilesSummary(owned),
          })
        )
      )
    );
    expect(summary().textContent).toContain('Completed');
    expect(summary().textContent).toContain('4 files changed');
    expect(summary().textContent).not.toContain('46 files changed');
    expect(summary().querySelector('.ws-activity__added')?.textContent).toBe('+133');
    expect(summary().querySelector('.ws-activity__removed')?.textContent).toBe('\u22120');
    expect(summary().textContent).toContain('1 failed attempt');
    const fileRows = document.querySelectorAll('.ws-sidebar__studio-changeset-files li');
    expect(fileRows[0].textContent).toContain('todo/main.py');
    expect(fileRows[1].textContent).toContain('todo/test_main.py');
    expect(document.querySelector('.ws-sidebar__studio-changeset-title')?.textContent).toContain(
      'Created 4 files'
    );
    expect(document.querySelector('.ws-sidebar__studio-changeset-title')?.textContent).toContain(
      '2 binary files'
    );
    expect(
      document.querySelector('.ws-sidebar__studio-changeset-title')?.textContent
    ).not.toContain('uncounted');
    await act(async () =>
      root.render(
        createElement(StudioActivityTranscript, {
          entries: [
            ...owned,
            {
              action: 'assistant-session',
              title: 'New request',
              summary: '',
              status: 'done',
              eventType: 'request.started',
              eventSequence: 21,
            },
          ],
        })
      )
    );
    expect(summary().textContent).toContain('Needs attention');
  });

  it('keeps live steps visible and preserves explicit expansion choices through completion and resume', async () => {
    const render = async (active: boolean) =>
      act(async () => root.render(createElement(StudioActivityTranscript, { entries, active })));
    await render(true);
    expect(
      [...document.querySelectorAll<HTMLElement>('.ws-activity__step')].every((row) => !row.hidden)
    ).toBe(true);
    await act(async () => summary().click());
    expect(summary().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.ws-activity__live-preview')?.textContent).toContain(
      'Choosing next action'
    );
    await render(false);
    await render(true);
    expect(summary().getAttribute('aria-expanded')).toBe('false');
    await act(async () => summary().click());
    await render(false);
    expect(summary().getAttribute('aria-expanded')).toBe('true');
  });
  it('does not recreate an expanded transcript when the first retained activity changes', async () => {
    const props = {
      panelId: 'chat',
      active: true,
      contextLabel: 'Assistant',
      placeholder: 'Message',
      scope: {},
      activeSessionId: 's',
      onNewSession: vi.fn(),
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
      suggestions: [],
      onSubmit: vi.fn(),
      models: [],
      selectedModelId: null,
      onSelectModel: vi.fn(),
      renderTurnActivity: (turn: { activity?: typeof entries }) =>
        createElement(StudioActivityTranscript, { entries: turn.activity ?? [] }),
    };
    const render = async (start: number, sessionId = 's') =>
      act(async () =>
        root.render(
          createElement(ChatTab, {
            ...props,
            activeSessionId: sessionId,
            sessions: [
              {
                sessionId,
                title: 'Review',
                status: 'done',
                messages: [
                  { role: 'assistant', content: '', activity: entries.slice(start, start + 40) },
                ],
              },
            ],
          })
        )
      );
    await render(0);
    await act(async () => summary().click());
    const group = document.querySelector('.ws-activity')!;
    const row = document.querySelectorAll<HTMLDetailsElement>('.ws-activity__step')[10];
    await act(async () => {
      row.open = true;
      row.dispatchEvent(new dom.window.Event('toggle'));
    });
    await render(1);
    expect(document.querySelector('.ws-activity')).toBe(group);
    expect(summary().getAttribute('aria-expanded')).toBe('true');
    expect(row.isConnected).toBe(true);
    expect(row.open).toBe(true);
    expect(row.textContent).toContain('Output 10');
    await render(0, 'other-session');
    expect(document.querySelector('.ws-activity')).not.toBe(group);
    expect(summary().getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps an inspected short transcript open when a later update adds the group disclosure', async () => {
    await act(async () =>
      root.render(createElement(StudioActivityTranscript, { entries: entries.slice(0, 7) }))
    );
    const row = document.querySelector<HTMLDetailsElement>('details')!;
    await act(async () => {
      row.open = true;
      row.dispatchEvent(new dom.window.Event('toggle'));
    });
    await act(async () =>
      root.render(createElement(StudioActivityTranscript, { entries: entries.slice(0, 8) }))
    );
    expect(summary().getAttribute('aria-expanded')).toBe('true');
    expect(row.open).toBe(true);
    expect(document.querySelector<HTMLElement>('.ws-activity__entries')!.hidden).toBe(false);
  });
  it('opens a file directly from the compact row without expanding or flashing its output', async () => {
    const open = vi.fn();
    await act(async () =>
      root.render(
        createElement(StudioActivityTranscript, {
          entries: entries.slice(0, 1),
          active: true,
          onOpenFile: open,
        })
      )
    );
    const row = document.querySelector<HTMLDetailsElement>('details')!;
    expect(row.open).toBe(false);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.ws-activity__preview button')!.click()
    );
    expect(open).toHaveBeenCalledExactlyOnceWith('src/file-0.ts');
    expect(row.open).toBe(false);
    expect(document.querySelector('.ws-activity__output')).toBeNull();
  });
});
