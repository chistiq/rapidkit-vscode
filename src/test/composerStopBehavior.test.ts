import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/vscode', () => ({
  vscode: { getState: () => ({}), setState: vi.fn(), postMessage: vi.fn() },
}));
import { ComposerShell } from '../../webview-ui/src/sidebar/composer/ComposerShell';
import { ChatTab } from '../../webview-ui/src/sidebar/ChatTab';

describe('Composer cancellation', () => {
  it.each(['', 'npx workspai create'])(
    'keeps Stop accessible with draft %j and preserves sending steering text',
    async (value) => {
      const dom = new JSDOM('<div id="root"></div>');
      vi.stubGlobal('window', dom.window);
      vi.stubGlobal('document', dom.window.document);
      vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
        callback();
        return 0;
      });
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const container = dom.window.document.getElementById('root')!;
      const root = createRoot(container);
      const cancel = vi.fn();
      const submit = vi.fn();
      try {
        await act(async () =>
          root.render(
            createElement(ComposerShell, {
              value,
              running: true,
              disabled: true,
              onCancel: cancel,
              onChange: vi.fn(),
              onSubmit: submit,
              placeholder: 'Task',
              models: [],
              selectedModelId: null,
              onSelectModel: vi.fn(),
            })
          )
        );
        const stop = container.querySelector<HTMLButtonElement>('button[aria-label="Stop"]')!;
        expect(stop).not.toBeNull();
        expect(stop.disabled).toBe(false);
        await act(async () => stop.click());
        expect(cancel).toHaveBeenCalledOnce();
        expect(submit).not.toHaveBeenCalled();
        if (value) expect(container.querySelector('button[aria-label="Send"]')).not.toBeNull();
      } finally {
        await act(async () => root.unmount());
        dom.window.close();
        vi.unstubAllGlobals();
      }
    }
  );
  it('shows Stop while host activity is running even if the chat status is no longer streaming', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    dom.window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const cancel = vi.fn();
    const steer = vi.fn();
    const submit = vi.fn();
    try {
      await act(async () =>
        root.render(
          createElement(ChatTab, {
            panelId: 'chat',
            active: true,
            contextLabel: 'Assistant',
            placeholder: 'Task',
            scope: {},
            sessions: [{ sessionId: 's', title: 'Task', status: 'done', messages: [] }],
            activeSessionId: 's',
            onNewSession: vi.fn(),
            onSelectSession: vi.fn(),
            onDeleteSession: vi.fn(),
            suggestions: [],
            onSubmit: submit,
            onSteer: steer,
            models: [],
            selectedModelId: null,
            onSelectModel: vi.fn(),
            onCancel: cancel,
            activityActive: true,
            composerPrefill: 'npx workspai create',
            composerPrefillKey: 1,
          })
        )
      );
      const stop = container.querySelector<HTMLButtonElement>('button[aria-label="Stop"]')!;
      expect(stop).not.toBeNull();
      await act(async () =>
        container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.click()
      );
      expect(steer).toHaveBeenCalledWith('npx workspai create', []);
      expect(submit).not.toHaveBeenCalled();
      await act(async () => stop.click());
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});
