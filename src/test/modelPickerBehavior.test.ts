import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('@/vscode', () => ({
  vscode: { postMessage: mockPostMessage },
}));

import { ModelPicker } from '../../webview-ui/src/sidebar/ModelPicker';

describe('ModelPicker keyboard focus', () => {
  let dom: JSDOM | undefined;
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    dom?.window.close();
    dom = undefined;
    vi.unstubAllGlobals();
    mockPostMessage.mockReset();
  });

  it('preserves the keyboard-focused option when scrolling repositions the menu', async () => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    const container = dom.window.document.getElementById('root');
    if (!container) {
      throw new Error('Model picker test root element was not created.');
    }
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(ModelPicker, {
          models: [
            { id: 'model-a', name: 'Model A' },
            { id: 'model-b', name: 'Model B' },
          ],
          selectedId: null,
          onSelect: vi.fn(),
        })
      );
    });

    let triggerTop = 500;
    const trigger = container.querySelector('button.ws-sidebar__model-trigger');
    if (!(trigger instanceof dom.window.HTMLButtonElement)) {
      throw new Error('Model picker trigger was not rendered.');
    }
    trigger.getBoundingClientRect = () =>
      ({
        left: 10,
        right: 230,
        top: triggerTop,
        bottom: triggerTop + 28,
        width: 220,
        height: 28,
        x: 10,
        y: triggerTop,
        toJSON: () => ({}),
      }) as DOMRect;

    await act(async () => {
      trigger.dispatchEvent(new dom!.window.MouseEvent('click', { bubbles: true }));
      await new Promise<void>((resolve) => dom!.window.requestAnimationFrame(() => resolve()));
    });

    const options = Array.from(dom.window.document.querySelectorAll('[role="option"]'));
    expect(options).toHaveLength(3);
    await act(async () => {
      options[0].dispatchEvent(
        new dom!.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      );
    });
    expect(dom.window.document.activeElement).toBe(options[1]);

    const originalMenuTop = (
      dom.window.document.querySelector('[role="listbox"]') as HTMLDivElement
    ).style.top;
    await act(async () => {
      triggerTop = 400;
      dom!.window.document.dispatchEvent(new dom!.window.Event('scroll'));
    });

    const menu = dom.window.document.querySelector('[role="listbox"]') as HTMLDivElement;
    expect(menu.style.top).not.toBe(originalMenuTop);
    expect(dom.window.document.activeElement).toBe(options[1]);
  });
});
