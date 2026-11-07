import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ execute: vi.fn(), documents: [] as unknown[] }));
vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ scheme: 'file', fsPath, toString: () => fsPath }) },
  Position: class {
    constructor(
      readonly line: number,
      readonly character: number
    ) {}
  },
  commands: { executeCommand: provider.execute },
  workspace: {
    get textDocuments() {
      return provider.documents;
    },
    openTextDocument: async (uri: { fsPath: string }) => {
      const found = provider.documents.find(
        (document) => (document as { uri: { fsPath: string } }).uri.fsPath === uri.fsPath
      );
      if (found) {
        return found;
      }
      throw new Error('Missing mock document');
    },
  },
}));
import { prepareStudioSymbolRename } from '../core/studioSymbolRename.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import type { FilePatch } from '../core/patchApplyEngine.js';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  reviewStudioNativeCheckpoint,
} from '../core/studioNativeWorkspace.js';
import { inspectStudioAgentFiles } from '../core/sidebarStudioAgentRuntime.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rename-'));
  provider.documents = [];
  provider.execute.mockReset();
});
afterEach(async () => {
  await fs.remove(root);
});
async function document(file: string, text: string) {
  const fsPath = path.join(root, file);
  await fs.outputFile(fsPath, text);
  const lines = text.split('\n');
  const document = {
    uri: { fsPath, scheme: 'file', toString: () => fsPath },
    version: 1,
    lineCount: lines.length,
    lineAt: (line: number) => ({ text: lines[line] }),
    getText: () => text,
    offsetAt: (position: { line: number; character: number }) =>
      lines.slice(0, position.line).reduce((n, line) => n + line.length + 1, 0) +
      position.character,
    positionAt: (offset: number) => {
      const prefix = text.slice(0, offset).split('\n');
      return { line: prefix.length - 1, character: prefix.at(-1)!.length };
    },
  };
  provider.documents.push(document);
  return document;
}
const change = (start: number, end: number, newText = 'newName') => ({
  range: { start: { line: 0, character: start }, end: { line: 0, character: end } },
  newText,
});
const request = () => ({
  path: 'index.ts',
  line: 1,
  column: 14,
  newName: 'newName',
  workspacePath: root,
  signal: new AbortController().signal,
});

describe('Language-aware transactional symbol rename', () => {
  it('applies real cross-file changes through a durable checkpoint and restores them without overwriting newer user edits', async () => {
    const a = await document('index.ts', 'export const value = 7;\n');
    const b = await document('use.ts', 'console.log(value);\n');
    provider.execute.mockResolvedValue({
      entries: () => [
        [a.uri, [change(13, 18)]],
        [b.uri, [change(12, 17)]],
      ],
    });
    configureStudioNativeStorage(path.join(root, 'private-extension-storage'));
    const inspectedSource = new Map<string, string | null>();
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath: root,
      inspectedSource,
      diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
      inspectChanges: async () => ({ ok: true }),
    });
    const host = {
      ...native,
      prepareSymbolRename: prepareStudioSymbolRename,
      inspect: async (input: Parameters<typeof inspectStudioAgentFiles>[0]) => {
        const observations = await inspectStudioAgentFiles(input);
        observations.forEach((entry) => inspectedSource.set(entry.path, entry.sha256));
        return { ok: true, output: observations };
      },
    } as unknown as StudioAgentWorkspaiToolHost;
    const tool = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    }).get('rename-workspace-symbol')!;
    const result = await tool.execute(request(), {
      sessionId: 'rename-owner',
      requestId: 'rename-request',
      toolCallId: 'rename-call',
      workspacePath: root,
      signal: new AbortController().signal,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await fs.readFile(a.uri.fsPath, 'utf8')).toBe('export const newName = 7;\n');
    const after = await fs.readFile(b.uri.fsPath, 'utf8');
    expect(after).toBe('console.log(newName);\n');
    const restore = () =>
      reviewStudioNativeCheckpoint({
        sessionId: 'rename-owner',
        requestIds: ['rename-request'],
        transactionIds: [],
        action: 'restore',
        workspaceTrusted: true,
      });
    await fs.appendFile(b.uri.fsPath, '// newer user edit\n');
    await expect(restore()).rejects.toThrow();
    expect(await fs.readFile(a.uri.fsPath, 'utf8')).toBe('export const newName = 7;\n');
    expect(await fs.readFile(b.uri.fsPath, 'utf8')).toContain('newer user edit');
    await fs.writeFile(b.uri.fsPath, after);
    await restore();
    expect(await fs.readFile(a.uri.fsPath, 'utf8')).toBe(a.getText());
    expect(await fs.readFile(b.uri.fsPath, 'utf8')).toBe(b.getText());
  });
  it('compiles exact provider ranges across files without writing, including repeated identifiers and Unicode', async () => {
    const a = await document('index.ts', 'export const value = value;\n');
    const b = await document('use.ts', '\u0641\u0627\u0631\u0633\u06cc: value;\n');
    provider.execute.mockResolvedValue({
      entries: () => [
        [a.uri, [change(13, 18), change(21, 26)]],
        [b.uri, [change(7, 12)]],
      ],
    });
    const patches = await prepareStudioSymbolRename(request());
    expect(patches).toMatchObject([
      {
        relativePath: 'index.ts',
        patchedContent: 'export const newName = newName;\n',
        baseSha256: crypto.createHash('sha256').update(a.getText()).digest('hex'),
      },
      { relativePath: 'use.ts', patchedContent: '\u0641\u0627\u0631\u0633\u06cc: newName;\n' },
    ]);
    expect(await fs.readFile(a.uri.fsPath, 'utf8')).toBe(a.getText());
    expect(provider.execute).toHaveBeenCalledWith(
      'vscode.executeDocumentRenameProvider',
      expect.objectContaining({ fsPath: a.uri.fsPath }),
      expect.objectContaining({ line: 0, character: 13 }),
      'newName'
    );
  });

  it('rejects a whole plan containing an escaped/sensitive target or overlapping ranges', async () => {
    const a = await document('index.ts', 'export const value = 1;');
    const b = await document('.env.local', 'value');
    provider.execute.mockResolvedValue({
      entries: () => [
        [a.uri, [change(13, 18)]],
        [b.uri, [change(0, 5)]],
      ],
    });
    await expect(prepareStudioSymbolRename(request())).rejects.toThrow('scope');
    provider.execute.mockResolvedValue({
      entries: () => [[a.uri, [change(13, 18), change(14, 17)]]],
    });
    await expect(prepareStudioSymbolRename(request())).rejects.toThrow('overlapping');
    provider.execute.mockResolvedValue({ entries: () => [[a.uri, [change(13, 99)]]] });
    await expect(prepareStudioSymbolRename(request())).rejects.toThrow('invalid source range');
    expect(await fs.readFile(a.uri.fsPath, 'utf8')).toBe(a.getText());
  });

  it('rejects edits after a concurrent buffer change or cancellation', async () => {
    const a = await document('index.ts', 'export const value = 1;');
    provider.execute.mockImplementation(async () => {
      a.version++;
      return { entries: () => [[a.uri, [change(13, 18)]]] };
    });
    await expect(prepareStudioSymbolRename(request())).rejects.toThrow('changed');
    const controller = new AbortController();
    provider.execute.mockImplementation(async () => {
      controller.abort();
      return { entries: () => [[a.uri, [change(13, 18)]]] };
    });
    await expect(
      prepareStudioSymbolRename({ ...request(), signal: controller.signal })
    ).rejects.toThrow('cancelled');
  });

  it('passes fresh hashes through the existing host transaction and rejects stale inspection without applying', async () => {
    const patches = [
      { relativePath: 'index.ts', baseSha256: 'sha', patchedContent: 'new' },
    ] as FilePatch[];
    const inspect = vi.fn(async () => ({
      ok: true,
      output: [{ path: 'index.ts', sha256: 'sha' }],
    }));
    const applyPatches = vi.fn(async () => ({
      ok: true,
      changed: true,
      output: { editedFiles: 1 },
    }));
    const host = {
      prepareSymbolRename: vi.fn(async () => patches),
      inspect,
      applyPatches,
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    });
    const tool = registry.get('rename-workspace-symbol')!;
    const context = {
      sessionId: 'owner',
      requestId: 'request',
      toolCallId: 'rename',
      workspacePath: root,
      signal: new AbortController().signal,
    };
    expect(tool.risk).toBe('guarded-write');
    expect(await tool.execute(request(), context)).toMatchObject({ ok: true, changed: true });
    expect(applyPatches).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'owner',
        requestId: 'request',
        transactionId: 'rename',
        patches,
      })
    );
    inspect.mockResolvedValue({ ok: true, output: [{ path: 'index.ts', sha256: 'other' }] });
    expect(await tool.execute(request(), context)).toMatchObject({ ok: false, changed: false });
    expect(applyPatches).toHaveBeenCalledOnce();
    for (const assistantMode of ['ask', 'plan'] as const) {
      expect(
        createStudioAgentWorkspaiToolRegistry({
          host,
          cardId: 'assistant:test',
          assistantMode,
        }).get('rename-workspace-symbol')
      ).toBeUndefined();
    }
  });
});
