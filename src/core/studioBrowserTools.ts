import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
} from './studioAgentToolRegistry.js';

type RecordValue = Record<string, unknown>;
function value(raw: unknown): RecordValue {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as RecordValue) : {};
}
export class StudioBrowserTools {
  private readonly browsers = new Map<
    string,
    {
      owner: string;
      scope: string;
      root: string;
      child: ChildProcess;
      profile: string;
      socket: WebSocket;
      nextId: number;
      events: RecordValue[];
      listeners: Set<() => void>;
      pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
    }
  >();
  private async navigationReady(
    id: string,
    context: StudioAgentToolContext,
    loaderId: string
  ): Promise<boolean> {
    const browser = this.owned(id, context);
    const ready = () =>
      browser.events.some(
        (event) =>
          event.method === 'Page.lifecycleEvent' &&
          value(event.params).loaderId === loaderId &&
          ['DOMContentLoaded', 'load'].includes(String(value(event.params).name))
      );
    if (ready()) {
      return true;
    }
    return new Promise((resolve) => {
      const finish = (result: boolean) => {
        clearTimeout(timer);
        browser.listeners.delete(wake);
        context.signal.removeEventListener('abort', abort);
        resolve(result);
      };
      const wake = () => {
        if (ready()) {
          finish(true);
        } else if (!this.browsers.has(id) || browser.socket.readyState > 1) {
          finish(false);
        }
      };
      const abort = () => finish(false);
      const timer = setTimeout(() => finish(false), 10_000);
      browser.listeners.add(wake);
      context.signal.addEventListener('abort', abort, { once: true });
      wake();
      if (context.signal.aborted) {
        abort();
      }
    });
  }
  private async executable(): Promise<string> {
    const candidates =
      process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : process.platform === 'win32'
          ? [
              path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
              path.join(
                process.env['PROGRAMFILES(X86)'] ?? '',
                'Microsoft/Edge/Application/msedge.exe'
              ),
            ]
          : [
              '/usr/bin/chromium',
              '/usr/bin/chromium-browser',
              '/usr/bin/google-chrome',
              '/opt/google/chrome/chrome',
              '/usr/bin/microsoft-edge',
            ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        /* Try the next installed browser. */
      }
    }
    throw new Error(
      'No supported local Chromium/Chrome/Edge installation was found. Install a browser or use an available browser/MCP host tool.'
    );
  }
  private owned(id: string, context: StudioAgentToolContext) {
    const browser = this.browsers.get(id);
    if (
      !browser ||
      browser.owner !== context.sessionId ||
      browser.scope !== path.resolve(context.projectPath ?? context.workspacePath) ||
      browser.root !== path.resolve(context.workspacePath)
    ) {
      throw new Error('Browser is not owned by this session.');
    }
    return browser;
  }
  private async call(
    id: string,
    context: StudioAgentToolContext,
    method: string,
    params: RecordValue = {}
  ): Promise<unknown> {
    const browser = this.owned(id, context);
    const requestId = ++browser.nextId;
    if (context.signal.aborted) {
      throw new Error('Browser request was cancelled.');
    }
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, result?: unknown) => {
        clearTimeout(timer);
        context.signal.removeEventListener('abort', abort);
        browser.pending.delete(requestId);
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
      const abort = () => finish(new Error('Browser request was cancelled.'));
      const timer = setTimeout(
        () =>
          finish(
            new Error('Browser request timed out. Inspect the page or try a different route.')
          ),
        30_000
      );
      browser.pending.set(requestId, {
        resolve: (result) => finish(undefined, result),
        reject: (error) => finish(error),
      });
      context.signal.addEventListener('abort', abort, { once: true });
      try {
        browser.socket.send(JSON.stringify({ id: requestId, method, params }));
      } catch (error) {
        finish(error as Error);
      }
    });
  }
  private async close(id: string): Promise<void> {
    const browser = this.browsers.get(id);
    if (!browser) {
      return;
    }
    this.browsers.delete(id);
    for (const listener of browser.listeners) {
      listener();
    }
    for (const pending of browser.pending.values()) {
      pending.reject(new Error('Browser closed.'));
    }
    browser.socket.close();
    browser.child.kill();
    // Never remove a live profile while the browser is still flushing it.
    if (browser.child.exitCode === null && browser.child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          browser.child.kill('SIGKILL');
          resolve();
        }, 2_000);
        browser.child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await fs.rm(browser.profile, { recursive: true, force: true }).catch(() => undefined);
  }
  cancelSession(owner: string): void {
    for (const [id, browser] of this.browsers) {
      if (browser.owner === owner) {
        void this.close(id);
      }
    }
  }
  dispose(): void {
    for (const id of this.browsers.keys()) {
      void this.close(id);
    }
  }
  tools(readOnly: boolean): StudioAgentToolDefinition[] {
    const fingerprint = (input: unknown, root: string) =>
      crypto.createHash('sha256').update(JSON.stringify({ input, root })).digest('hex');
    return [
      {
        name: 'browser-page',
        title: 'Inspect and interact with a local browser',
        description:
          'Independent Chromium/Chrome/Edge browser automation, without Copilot or MCP. Open a new session, navigate HTTP(S), read page text, capture a screenshot, click a CSS selector, type into an input, or close the owned session. Use id returned by open. Navigation/interactions require exact approval; read/screenshot operate on the session’s already approved page. External effects require observing the resulting page. Browser installation is required.',
        inputSchema: {
          type: 'object',
          required: ['operation'],
          additionalProperties: false,
          properties: {
            operation: {
              type: 'string',
              enum: readOnly
                ? ['read', 'screenshot', 'close']
                : ['open', 'navigate', 'read', 'screenshot', 'click', 'type', 'close'],
            },
            id: { type: 'string' },
            url: { type: 'string' },
            selector: { type: 'string' },
            text: { type: 'string', maxLength: 10_000 },
            width: { type: 'integer', minimum: 200, maximum: 3840 },
            height: { type: 'integer', minimum: 200, maximum: 2160 },
          },
        },
        activity: 'inspect',
        risk: 'read',
        authorize: (raw, context) => {
          const input = value(raw);
          if (['read', 'screenshot', 'close'].includes(String(input.operation))) {
            this.owned(String(input.id), context);
            return { risk: 'read' };
          }
          if (readOnly) {
            throw new Error('Use Agent or Goal to open or interact with a browser.');
          }
          return {
            risk: 'invasive',
            approval: {
              fingerprint: fingerprint(input, context.workspacePath),
              title: `Browser ${String(input.operation)}`,
              summary: JSON.stringify(input),
              scope: 'workspace',
              reasons: [
                'Navigation and page interactions can send requests and change remote application state.',
              ],
              execution: 'once',
              allowedExecutions: ['once'],
            },
          };
        },
        execute: async (raw, context) => {
          const input = value(raw);
          const operation = String(input.operation);
          if (
            !['open', 'navigate', 'read', 'screenshot', 'click', 'type', 'close'].includes(
              operation
            )
          ) {
            throw new Error('Unknown browser operation.');
          }
          if (
            !['read', 'screenshot', 'close'].includes(operation) &&
            context.approval?.fingerprint !== fingerprint(input, context.workspacePath)
          ) {
            throw new Error('Exact browser action approval is required.');
          }
          if (context.signal.aborted) {
            return { ok: false, error: 'Browser request was cancelled.' };
          }
          if (readOnly && !['read', 'screenshot', 'close'].includes(operation)) {
            throw new Error('This browser operation requires Agent or Goal mode.');
          }
          let navigationUrl: URL | undefined;
          if (operation === 'open' || operation === 'navigate') {
            navigationUrl = new URL(String(input.url));
            if (
              !['http:', 'https:'].includes(navigationUrl.protocol) ||
              navigationUrl.username ||
              navigationUrl.password
            ) {
              throw new Error('Use an HTTP(S) URL without credentials.');
            }
          }
          let id = String(input.id);
          if (operation === 'open') {
            const executable = await this.executable();
            if (typeof WebSocket === 'undefined') {
              throw new Error(
                'This VS Code runtime has no WebSocket support. Update VS Code or use a browser host tool.'
              );
            }
            const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-browser-'));
            const child = spawn(
              executable,
              [
                '--headless=new',
                '--remote-debugging-port=0',
                '--remote-debugging-address=127.0.0.1',
                `--user-data-dir=${profile}`,
                '--no-first-run',
                '--no-default-browser-check',
                'about:blank',
              ],
              { stdio: ['ignore', 'ignore', 'pipe'] }
            );
            try {
              const endpoint = await new Promise<string>((resolve, reject) => {
                let output = '';
                const cleanup = () => {
                  clearTimeout(timer);
                  child.stderr?.off('data', data);
                  child.off('error', error);
                  child.off('exit', exit);
                  context.signal.removeEventListener('abort', abort);
                };
                const error = (error: Error) => {
                  cleanup();
                  reject(error);
                };
                const exit = () =>
                  error(new Error('Browser exited before its automation endpoint became ready.'));
                const abort = () => error(new Error('Browser startup was cancelled.'));
                const timer = setTimeout(
                  () => error(new Error('Browser startup timed out.')),
                  15_000
                );
                const data = (chunk: Buffer) => {
                  output = (output + chunk.toString()).slice(-8_000);
                  const match = output.match(
                    /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/
                  );
                  if (match) {
                    cleanup();
                    resolve(match[1]);
                  }
                };
                child.stderr?.on('data', data);
                child.once('error', error);
                child.once('exit', exit);
                context.signal.addEventListener('abort', abort, { once: true });
                if (context.signal.aborted) {
                  abort();
                }
              });
              const base = new URL(endpoint);
              const response = await fetch(`http://127.0.0.1:${base.port}/json/list`, {
                signal: context.signal,
              });
              const pages = (await response.json()) as Array<{
                type: string;
                webSocketDebuggerUrl: string;
              }>;
              const page = pages.find((entry) => entry.type === 'page');
              if (!page) {
                throw new Error('Browser has no page automation target.');
              }
              const socket = new WebSocket(page.webSocketDebuggerUrl);
              await new Promise<void>((resolve, reject) => {
                const abort = () => {
                  socket.close();
                  reject(new Error('Browser startup was cancelled.'));
                };
                const timer = setTimeout(abort, 10_000);
                const finish = () => {
                  clearTimeout(timer);
                  context.signal.removeEventListener('abort', abort);
                };
                socket.addEventListener(
                  'open',
                  () => {
                    finish();
                    resolve();
                  },
                  { once: true }
                );
                socket.addEventListener(
                  'error',
                  () => {
                    finish();
                    reject(new Error('Browser connection failed.'));
                  },
                  { once: true }
                );
                context.signal.addEventListener('abort', abort, { once: true });
              });
              id = crypto.randomUUID();
              const browser = {
                owner: context.sessionId,
                scope: path.resolve(context.projectPath ?? context.workspacePath),
                root: path.resolve(context.workspacePath),
                child,
                profile,
                socket,
                nextId: 0,
                events: [] as RecordValue[],
                listeners: new Set<() => void>(),
                pending: new Map<
                  number,
                  { resolve: (value: unknown) => void; reject: (error: Error) => void }
                >(),
              };
              this.browsers.set(id, browser);
              socket.addEventListener('message', (event) => {
                let result: {
                  id?: number;
                  method?: string;
                  params?: unknown;
                  result?: unknown;
                  error?: { message: string };
                };
                try {
                  result = JSON.parse(String(event.data));
                } catch {
                  for (const pending of browser.pending.values()) {
                    pending.reject(new Error('Browser returned malformed automation data.'));
                  }
                  return;
                }
                if (result.method) {
                  browser.events.push({ method: result.method, params: result.params });
                  if (browser.events.length > 100) {
                    browser.events.shift();
                  }
                  for (const listener of browser.listeners) {
                    listener();
                  }
                }
                const pending = result.id ? browser.pending.get(result.id) : undefined;
                if (pending) {
                  if (result.error) {
                    pending.reject(new Error(result.error.message));
                  } else {
                    pending.resolve(result.result);
                  }
                }
              });
              socket.addEventListener('close', () => {
                for (const listener of browser.listeners) {
                  listener();
                }
                for (const pending of browser.pending.values()) {
                  pending.reject(new Error('Browser disconnected.'));
                }
              });
              child.once('exit', () => {
                void this.close(id);
              });
            } catch (error) {
              child.kill();
              await fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);
              throw error;
            }
          }
          if (operation === 'open' || operation === 'navigate') {
            await this.call(id, context, 'Page.enable');
            await this.call(id, context, 'Page.setLifecycleEventsEnabled', { enabled: true });
            const result = value(
              await this.call(id, context, 'Page.navigate', { url: navigationUrl!.toString() })
            );
            if (result.errorText) {
              return { ok: false, error: String(result.errorText), output: { id } };
            }
            const ready =
              typeof result.loaderId !== 'string' ||
              (await this.navigationReady(id, context, result.loaderId));
            return {
              ok: true,
              output: {
                id,
                state: ready ? 'document-ready' : 'navigation-pending',
                effects: { verificationScopes: [`browser:${id}`] },
              },
            };
          }
          if (operation === 'close') {
            this.owned(id, context);
            await this.close(id);
            return {
              ok: true,
              output: { id, state: 'closed', observationScopes: [`browser:${id}`] },
            };
          }
          if (operation === 'screenshot') {
            if (input.width !== undefined || input.height !== undefined) {
              const width = Number(input.width ?? 800);
              const height = Number(input.height ?? 600);
              if (
                !Number.isInteger(width) ||
                width < 200 ||
                width > 3840 ||
                !Number.isInteger(height) ||
                height < 200 ||
                height > 2160
              ) {
                throw new Error('Invalid browser viewport size.');
              }
              await this.call(id, context, 'Emulation.setDeviceMetricsOverride', {
                width,
                height,
                deviceScaleFactor: 1,
                mobile: false,
              });
            }

            const result = value(
              await this.call(id, context, 'Page.captureScreenshot', { format: 'png' })
            );
            const data = String(result.data ?? '');
            if (data.length > 7_000_000) {
              throw new Error('Screenshot exceeds the image budget. Reduce viewport size.');
            }
            return {
              ok: true,
              images: [{ mimeType: 'image/png', base64: data }],
              output: { id, observationScopes: [`browser:${id}`] },
            };
          }
          let expression =
            'JSON.stringify({url:location.href,title:document.title,readyState:document.readyState,text:document.body?.innerText.slice(0,18000),links:[...document.querySelectorAll("a[href]")].slice(0,50).map(a=>({text:a.textContent,href:a.href}))})';
          if (operation === 'click' || operation === 'type') {
            if (typeof input.selector !== 'string' || input.selector.length > 2_000) {
              throw new Error('A CSS selector is required.');
            }
            expression = `(()=>{const element=document.querySelector(${JSON.stringify(input.selector)});if(!element)throw Error('Element not found');${operation === 'click' ? 'element.click();' : `element.focus();const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value')?.set;if(setter)setter.call(element,${JSON.stringify(String(input.text ?? ''))});else element.value=${JSON.stringify(String(input.text ?? ''))};element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));`}return 'interaction-requested'})()`;
          }
          const result = value(
            await this.call(id, context, 'Runtime.evaluate', {
              expression,
              returnByValue: true,
              awaitPromise: true,
            })
          );
          if (result.exceptionDetails) {
            return { ok: false, error: JSON.stringify(result.exceptionDetails) };
          }
          return {
            ok: true,
            output: {
              id,
              result: value(result.result).value,
              ...(operation === 'read'
                ? { observationScopes: [`browser:${id}`] }
                : { effects: { verificationScopes: [`browser:${id}`] } }),
            },
          };
        },
      },
    ];
  }
}
