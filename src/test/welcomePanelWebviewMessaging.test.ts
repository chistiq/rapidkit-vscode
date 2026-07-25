import { describe, expect, it, vi } from 'vitest';

import { postWelcomePanelWebviewMessage } from '../ui/panels/welcomePanelWebviewMessaging.js';

describe('welcome panel webview messaging', () => {
  it('swallows asynchronous delivery rejection when the renderer disposes the webview', async () => {
    const postMessage = vi.fn(() => Promise.reject(new Error('Webview is disposed')));

    expect(() =>
      postWelcomePanelWebviewMessage({ postMessage } as never, 'test-command', { ok: true })
    ).not.toThrow();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledOnce();
  });

  it('swallows a synchronous disposed-webview race', () => {
    const postMessage = vi.fn(() => {
      throw new Error('Webview is disposed');
    });

    expect(() =>
      postWelcomePanelWebviewMessage({ postMessage } as never, 'test-command')
    ).not.toThrow();
  });
});
