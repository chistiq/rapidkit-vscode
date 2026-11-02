import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/vscode', () => ({
  vscode: { getState: () => ({}), setState: vi.fn(), postMessage: vi.fn() },
}));
import { ChatToolsDrawer } from '../../webview-ui/src/sidebar/drawers/ChatToolsDrawer';
import type { ChatSession } from '../../webview-ui/src/sidebar/sidebarSessions';

describe('Header chat history', () => {
  let dom: JSDOM;
  let root: Root;
  beforeEach(() => {
    dom = new JSDOM('<button id="trigger">History</button><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
  it('keeps scoped and global chats accessible and separates deletion from selection', async () => {
    const sessions: ChatSession[] = [
      {
        sessionId: 'workspace',
        title: '\u0641\u0631\u0648\u0634\u06af\u0627\u0647',
        status: 'error',
        terminalReason: 'ai-provider-timeout',
        messages: [],
        scope: { workspacePath: '/work/shop', workspaceName: 'Shop' },
      },
      { sessionId: 'global', title: 'General help', status: 'done', messages: [] },
    ];
    const select = vi.fn(),
      remove = vi.fn(),
      close = vi.fn(),
      create = vi.fn();
    const props = {
      open: true,
      sessions,
      activeSessionId: 'workspace',
      onSelectSession: select,
      onDeleteSession: remove,
      onClose: close,
      onNewSession: create,
    };
    document.getElementById('trigger')!.focus();
    await act(async () => root.render(createElement(ChatToolsDrawer, props)));
    const search = document.querySelector<HTMLInputElement>('input')!;
    expect(document.activeElement).toBe(search);
    expect(document.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain(
      'Model request timed out'
    );
    await act(async () =>
      search.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      )
    );
    expect(document.activeElement?.textContent).toContain(
      '\u0641\u0631\u0648\u0634\u06af\u0627\u0647'
    );
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      )
    );
    expect(document.activeElement?.textContent).toContain('General help');
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(select).toHaveBeenCalledExactlyOnceWith('global');
    expect(close).toHaveBeenCalledOnce();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Delete chat: \u0641\u0631\u0648\u0634\u06af\u0627\u0647"]'
        )!
        .click()
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith('workspace');
    expect(select).toHaveBeenCalledOnce();
    await act(async () =>
      search.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => root.render(createElement(ChatToolsDrawer, { ...props, open: false })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.getElementById('trigger')).toBe(document.activeElement);
  });
});
