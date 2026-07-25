import * as vscode from 'vscode';

/**
 * Shared React-webview HTML shell (roadmap item 2.11).
 *
 * Both the dashboard `WebviewPanel` and the AI sidebar `WebviewView` load the
 * same esbuild-built React bundles from `dist/`. Historically each surface
 * hand-rolled its own `<!DOCTYPE html>` shell (nonce, CSP, `asWebviewUri`,
 * bootstrap globals) which drifted over time. This helper is the single code
 * path for producing that shell so the AI sidebar can drop its ~4.6k-line raw
 * HTML monolith and render React with the same `ws-*` design tokens.
 *
 * Pure-ish: the only side effects are `webview.asWebviewUri` / `webview.cspSource`
 * reads, so it is straightforward to unit-test with a fake webview.
 */

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateWebviewNonce(length = 32): string {
  let nonce = '';
  for (let i = 0; i < length; i++) {
    nonce += NONCE_ALPHABET.charAt(Math.floor(Math.random() * NONCE_ALPHABET.length));
  }
  return nonce;
}

export interface ReactWebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  /** Bundle base name in `dist/` (e.g. `webview`, `sidebar`). Loads `<name>.js` + `<name>.css`. */
  bundleName: string;
  title: string;
  /** Optional nonce override (mainly for tests); a fresh one is generated otherwise. */
  nonce?: string;
  /** Extra <head> markup (e.g. @font-face / :root icon variables). */
  headExtras?: string;
  /**
   * Bootstrap globals injected before the bundle loads, e.g.
   * `{ WORKSPAI_SIDEBAR_VARIANT: 'activitybar' }` → `window.WORKSPAI_SIDEBAR_VARIANT = "activitybar";`.
   * Values are JSON-encoded, so only serializable values are allowed.
   */
  bootstrapGlobals?: Record<string, unknown>;
}

function serializeBootstrapGlobals(globals: Record<string, unknown> | undefined): string {
  if (!globals) {
    return '';
  }
  const lines = Object.entries(globals).map(
    ([key, value]) => `window[${JSON.stringify(key)}] = ${JSON.stringify(value)};`
  );
  return lines.join('\n        ');
}

/**
 * Build the standard CSP for a React webview that loads a bundled stylesheet and
 * a nonce-guarded script. Styles allow `unsafe-inline` (required by the bundled
 * CSS + injected token variables); scripts are nonce-only.
 */
export function buildReactWebviewCsp(webview: vscode.Webview, nonce: string): string {
  const source = webview.cspSource;
  return [
    "default-src 'none'",
    `connect-src ${source}`,
    "frame-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    `style-src ${source} 'unsafe-inline'`,
    `font-src ${source}`,
    `img-src ${source} https: data:`,
    `worker-src ${source} blob:`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

export function buildReactWebviewHtml(options: ReactWebviewHtmlOptions): string {
  const { webview, extensionUri, bundleName, title } = options;
  const nonce = options.nonce ?? generateWebviewNonce();

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', `${bundleName}.js`)
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', `${bundleName}.css`)
  );

  const csp = buildReactWebviewCsp(webview, nonce);
  const headExtras = options.headExtras ? `\n    ${options.headExtras}` : '';
  const bootstrap = serializeBootstrapGlobals(options.bootstrapGlobals);
  const bootstrapScript = bootstrap
    ? `\n    <script nonce="${nonce}">\n        ${bootstrap}\n    </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>${title}</title>
    <link rel="stylesheet" type="text/css" href="${cssUri}">${headExtras}
</head>
<body>
    <div id="root"></div>${bootstrapScript}
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
