import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path?: string }, ...segments: string[]) => ({
      path: `${base.path ?? ''}/${segments.join('/')}`,
    }),
  },
}));

import {
  buildReactWebviewCsp,
  buildReactWebviewHtml,
  generateWebviewNonce,
} from '../ui/webviews/buildReactWebviewHtml';

function createFakeWebview() {
  return {
    cspSource: 'vscode-resource://fake',
    asWebviewUri: (uri: { path?: string; toString: () => string }) => ({
      toString: () => `https://webview.test${(uri as { path?: string }).path ?? ''}`,
    }),
  } as unknown as import('vscode').Webview;
}

const fakeExtensionUri = {
  path: '/ext',
} as unknown as import('vscode').Uri;

describe('generateWebviewNonce', () => {
  it('produces an alphanumeric nonce of the requested length', () => {
    const nonce = generateWebviewNonce(32);
    expect(nonce).toHaveLength(32);
    expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe('buildReactWebviewCsp', () => {
  it('locks scripts to the nonce and allows bundled styles', () => {
    const csp = buildReactWebviewCsp(createFakeWebview(), 'NONCE123');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-NONCE123'");
    expect(csp).toContain("style-src vscode-resource://fake 'unsafe-inline'");
    expect(csp).toContain('img-src vscode-resource://fake https: data:');
  });
});

describe('buildReactWebviewHtml', () => {
  it('emits a single #root, the bundle script with nonce, and the stylesheet link', () => {
    const html = buildReactWebviewHtml({
      webview: createFakeWebview(),
      extensionUri: fakeExtensionUri,
      bundleName: 'sidebar',
      title: 'Workspai Sidebar',
      nonce: 'TESTNONCE',
    });

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<title>Workspai Sidebar</title>');
    expect(html).toContain('href="https://webview.test/ext/dist/sidebar.css"');
    expect(html).toContain(
      '<script nonce="TESTNONCE" src="https://webview.test/ext/dist/sidebar.js"></script>'
    );
    // exactly one root mount node
    expect(html.match(/id="root"/g)).toHaveLength(1);
  });

  it('injects bootstrap globals as JSON-encoded window assignments', () => {
    const html = buildReactWebviewHtml({
      webview: createFakeWebview(),
      extensionUri: fakeExtensionUri,
      bundleName: 'sidebar',
      title: 'T',
      nonce: 'N',
      bootstrapGlobals: { WORKSPAI_SIDEBAR_VARIANT: 'activitybar', COUNT: 3 },
    });

    expect(html).toContain('window["WORKSPAI_SIDEBAR_VARIANT"] = "activitybar";');
    expect(html).toContain('window["COUNT"] = 3;');
  });

  it('omits the bootstrap script block when no globals are provided', () => {
    const html = buildReactWebviewHtml({
      webview: createFakeWebview(),
      extensionUri: fakeExtensionUri,
      bundleName: 'webview',
      title: 'T',
      nonce: 'N',
    });
    // Only the bundle script should carry the nonce (no inline bootstrap script).
    expect(html.match(/<script nonce="N"/g)).toHaveLength(1);
  });

  it('places headExtras inside the document head', () => {
    const html = buildReactWebviewHtml({
      webview: createFakeWebview(),
      extensionUri: fakeExtensionUri,
      bundleName: 'webview',
      title: 'T',
      nonce: 'N',
      headExtras: '<style>:root{--x:1}</style>',
    });
    const headBlock = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(headBlock).toContain('<style>:root{--x:1}</style>');
  });
});
