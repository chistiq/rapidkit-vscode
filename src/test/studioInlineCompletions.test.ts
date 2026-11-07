import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  ask: vi.fn(),
  instructions: vi.fn(),
  commands: new Map<string, (...args: any[]) => unknown>(),
  root: '',
  trusted: true,
  automatic: false,
  enabled: true,
  provider: undefined as any,
  change: undefined as any,
  configuration: undefined as any,
  fileChange: undefined as any,
}));
vi.mock('../core/aiProviderService.js', () => ({ askConfiguredAIProviderForToolAction: mock.ask }));
vi.mock('../core/studioAgentInstructions.js', () => ({
  studioAgentInstructionsTool: { execute: mock.instructions },
}));
vi.mock('vscode', () => {
  class CancellationTokenSource {
    private readonly listeners = new Set<() => void>();
    private cancelled = false;
    readonly token: {
      readonly isCancellationRequested: boolean;
      onCancellationRequested(listener: () => void): { dispose(): void };
    };
    cancel() {
      if (!this.cancelled) {
        this.cancelled = true;
        this.listeners.forEach((listener) => listener());
      }
    }
    dispose() {
      this.listeners.clear();
    }
    constructor() {
      const owner = this;
      this.token = {
        get isCancellationRequested() {
          return owner.cancelled;
        },
        onCancellationRequested: (listener: () => void) => {
          this.listeners.add(listener);
          return { dispose: () => this.listeners.delete(listener) };
        },
      };
    }
  }
  const disposable = () => ({ dispose() {} });
  return {
    CancellationTokenSource,
    InlineCompletionTriggerKind: { Invoke: 0, Automatic: 1 },
    Range: class {
      constructor(
        readonly start: unknown,
        readonly end: unknown
      ) {}
    },
    InlineCompletionItem: class {
      constructor(
        readonly insertText: string,
        readonly range: unknown,
        readonly command: unknown
      ) {}
    },
    languages: {
      registerInlineCompletionItemProvider: (_selector: unknown, provider: unknown) => {
        mock.provider = provider;
        return disposable();
      },
    },
    commands: {
      registerCommand: (name: string, handler: (...args: any[]) => unknown) => {
        mock.commands.set(name, handler);
        return disposable();
      },
    },
    workspace: {
      get isTrusted() {
        return mock.trusted;
      },
      getWorkspaceFolder: () => ({ uri: { fsPath: mock.root } }),
      getConfiguration: () => ({
        get: (name: string) =>
          name === 'inlineCompletions.enabled' ? mock.enabled : mock.automatic,
      }),
      onDidChangeTextDocument: (listener: unknown) => {
        mock.change = listener;
        return disposable();
      },
      onDidChangeConfiguration: (listener: unknown) => {
        mock.configuration = listener;
        return disposable();
      },
      createFileSystemWatcher: () => ({
        ...disposable(),
        onDidChange: (listener: unknown) => {
          mock.fileChange = listener;
          return disposable();
        },
        onDidCreate: disposable,
        onDidDelete: disposable,
      }),
    },
  };
});
import * as vscode from 'vscode';
import { StudioInlineCompletions } from '../core/studioInlineCompletions.js';
let manager: StudioInlineCompletions;
let document: any;
const position = { line: 0, character: 14 } as vscode.Position;
beforeEach(async () => {
  vi.clearAllMocks();
  mock.commands.clear();
  mock.automatic = false;
  mock.enabled = true;
  mock.trusted = true;
  mock.root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-inline-completions-'));
  const file = path.join(mock.root, 'src.ts');
  await fs.writeFile(file, 'const value = ');
  document = {
    uri: { scheme: 'file', fsPath: file, toString: () => file },
    version: 1,
    isClosed: false,
    languageId: 'typescript',
    getText: () => 'const value = ',
    offsetAt: () => 14,
    positionAt: (offset: number) => ({ line: 0, character: offset }),
  };
  mock.instructions.mockResolvedValue({
    ok: true,
    output: { documents: [], warnings: [], nextReads: [] },
  });
  mock.ask.mockResolvedValue({
    type: 'tool',
    toolName: 'propose-inline-completion',
    input: { text: '42;' },
  });
  manager = new StudioInlineCompletions({} as never);
});
afterEach(async () => {
  manager.dispose();
  await fs.remove(mock.root);
});
const invoke = (kind = 0, token = new vscode.CancellationTokenSource().token) =>
  manager.provideInlineCompletionItems(
    document,
    position,
    { triggerKind: kind } as vscode.InlineCompletionContext,
    token
  );

describe('Public editor ghost-text provider', () => {
  it('returns a preview insertion, caches identical requests and counts only an actual acceptance command', async () => {
    expect(mock.provider).toBe(manager);
    const result = await invoke();
    expect(result).toMatchObject([
      { insertText: '42;', range: { start: position, end: position } },
    ]);
    expect(await fs.readFile(document.uri.fsPath, 'utf8')).toBe('const value = ');
    expect(await invoke()).toHaveLength(1);
    expect(mock.ask).toHaveBeenCalledOnce();
    const command = result[0].command!;
    mock.commands.get(command.command)!(...(command.arguments ?? []));
    mock.commands.get(command.command)!(...(command.arguments ?? []));
    expect(manager.statistics()).toEqual({ requests: 1, offered: 2, accepted: 1, cacheHits: 1 });
  });

  it('sends no requests for automatic suggestions unless enabled, untrusted workspaces, or sensitive sources', async () => {
    expect(await invoke(1)).toEqual([]);
    mock.trusted = false;
    expect(await invoke()).toEqual([]);
    mock.trusted = true;
    document.uri.fsPath = path.join(mock.root, '.env.local');
    await fs.writeFile(document.uri.fsPath, 'SECRET=value');
    expect(await invoke()).toEqual([]);
    expect(mock.ask).not.toHaveBeenCalled();
  });

  it('keeps an insertion preview while the user types its exact prefix without spending another request', async () => {
    await invoke();
    document.version++;
    document.getText = () => 'const value = 4';
    document.offsetAt = () => 15;
    mock.change({ document });
    expect(await invoke()).toMatchObject([
      { insertText: '2;', range: { start: { line: 0, character: 15 } } },
    ]);
    expect(mock.ask).toHaveBeenCalledOnce();
  });

  it('discards a response if the user typed after the request and invalidates cached proposals on instruction changes', async () => {
    let finish!: (value: unknown) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    mock.ask.mockImplementationOnce(() => {
      began();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = invoke();
    await started;
    document.version++;
    finish({ type: 'tool', toolName: 'propose-inline-completion', input: { text: 'stale' } });
    expect(await pending).toEqual([]);
    await invoke();
    mock.fileChange();
    await invoke();
    expect(mock.ask).toHaveBeenCalledTimes(3);
  });

  it('releases cancellation even when the model ignores its token and prevents late suggestions', async () => {
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    mock.ask.mockImplementationOnce(() => {
      began();
      return new Promise<never>(() => {});
    });
    const controller = new vscode.CancellationTokenSource();
    const pending = invoke(0, controller.token);
    await started;
    controller.cancel();
    expect(await pending).toEqual([]);
    expect(manager.statistics().offered).toBe(0);
  });

  it('debounces automatic requests and respects incomplete repository instructions', async () => {
    mock.automatic = true;
    const controller = new vscode.CancellationTokenSource();
    const cancelled = invoke(1, controller.token);
    controller.cancel();
    expect(await cancelled).toEqual([]);
    expect(mock.ask).not.toHaveBeenCalled();
    mock.instructions.mockResolvedValue({ ok: true, output: { nextReads: [{ offset: 4000 }] } });
    expect(await invoke()).toEqual([]);
    expect(mock.ask).not.toHaveBeenCalled();
  });

  it('pages applicable instructions before requesting a completion', async () => {
    mock.instructions
      .mockResolvedValueOnce({
        ok: true,
        output: {
          documents: [{ locator: 'workspace:AGENTS.md', content: 'First rule.\n' }],
          nextReads: [{ input: { path: 'src.ts', document: 'workspace:AGENTS.md', offset: 12 } }],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        output: {
          documents: [{ locator: 'workspace:AGENTS.md', content: 'Second rule.' }],
          nextReads: [],
        },
      });
    expect(await invoke()).toHaveLength(1);
    expect(mock.ask.mock.calls[0][1][0].content).toContain('First rule.\\nSecond rule.');
    expect(mock.instructions).toHaveBeenNthCalledWith(
      2,
      { path: 'src.ts', document: 'workspace:AGENTS.md', offset: 12 },
      expect.anything()
    );
  });
});
