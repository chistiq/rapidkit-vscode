import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/vscode', () => ({
  vscode: { getState: () => ({}), setState: vi.fn(), postMessage: vi.fn() },
}));
import { ChatTab } from '../../webview-ui/src/sidebar/ChatTab';
import { ComposerShell } from '../../webview-ui/src/sidebar/composer/ComposerShell';
import type { ChatSession } from '../../webview-ui/src/sidebar/sidebarSessions';

describe('Accessible streaming and steering attachments', () => {
  let dom: JSDOM;
  let root: Root;
  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://workspai.test/' });
    dom.window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(dom.window.document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
  it('announces state separately from streamed tokens and keeps history keyboard-navigable', async () => {
    const session: ChatSession = {
      sessionId: 's',
      title: 'Chat',
      status: 'streaming',
      createdAt: '',
      updatedAt: '',
      messages: [
        { role: 'user', content: 'Explain' },
        { role: 'assistant', content: 'Partial' },
      ],
    };
    const props = {
      panelId: 'chat',
      active: true,
      contextLabel: 'Assistant',
      placeholder: 'Message',
      scope: {},
      sessions: [session],
      activeSessionId: 's',
      onNewSession: vi.fn(),
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
      suggestions: [],
      onSubmit: vi.fn(),
      models: [],
      selectedModelId: null,
      onSelectModel: vi.fn(),
    };
    await act(async () => root.render(createElement(ChatTab, props)));
    const log = dom.window.document.querySelector<HTMLElement>('[role="log"]')!;
    expect(log.getAttribute('aria-live')).toBe('off');
    expect(log.getAttribute('aria-busy')).toBe('true');
    expect(log.tabIndex).toBe(0);
    expect(dom.window.document.querySelectorAll('article[aria-label]')).toHaveLength(2);
    expect(
      [...dom.window.document.querySelectorAll('article .ws-sidebar__bubble')].every(
        (bubble) => bubble.getAttribute('dir') === 'auto'
      )
    ).toBe(true);
    expect(dom.window.document.querySelector('.ws-sidebar__sr-only')?.textContent).toBe(
      'Assistant is working.'
    );
    await act(async () =>
      root.render(
        createElement(ChatTab, {
          ...props,
          sessions: [
            {
              ...session,
              messages: [
                session.messages[0],
                { role: 'assistant', content: 'More streamed tokens' },
              ],
            },
          ],
        })
      )
    );
    expect(dom.window.document.querySelector('.ws-sidebar__sr-only')?.textContent).toBe(
      'Assistant is working.'
    );
    await act(async () =>
      root.render(createElement(ChatTab, { ...props, sessions: [{ ...session, status: 'done' }] }))
    );
    expect(log.getAttribute('aria-busy')).toBe('false');
    expect(dom.window.document.querySelector('.ws-sidebar__sr-only')?.textContent).toBe(
      'Response ready.'
    );
    expect(dom.window.document.querySelector('textarea')?.getAttribute('aria-label')).toBeTruthy();
    log.focus();
    expect(dom.window.document.activeElement).toBe(log);
  });
  it('accepts pasted and dropped files during steering and respects disabled input', async () => {
    const attach = vi.fn();
    const props = {
      value: '',
      running: true,
      disabled: false,
      onAttach: attach,
      onCancel: vi.fn(),
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      placeholder: 'Message',
      models: [],
      selectedModelId: null,
      onSelectModel: vi.fn(),
    };
    await act(async () => root.render(createElement(ComposerShell, props)));
    const file = new dom.window.File(['context'], 'context.txt', { type: 'text/plain' });
    const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file] } });
    await act(async () => dom.window.document.querySelector('textarea')!.dispatchEvent(paste));
    expect(attach).toHaveBeenCalledWith([file]);
    const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
    await act(async () =>
      dom.window.document.querySelector('.ws-composer__surface')!.dispatchEvent(drop)
    );
    expect(attach).toHaveBeenCalledTimes(2);
    await act(async () => root.render(createElement(ComposerShell, { ...props, disabled: true })));
    await act(async () =>
      dom.window.document.querySelector('.ws-composer__surface')!.dispatchEvent(drop)
    );
    expect(attach).toHaveBeenCalledTimes(2);
  });
});
