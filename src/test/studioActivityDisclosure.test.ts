import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/vscode', () => ({
  vscode: { getState: () => ({}), setState: vi.fn(), postMessage: vi.fn() },
}));
import { StudioActivityTranscript } from '../../webview-ui/src/sidebar/StudioActivityTranscript';
import { ChatTab } from '../../webview-ui/src/sidebar/ChatTab';

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
