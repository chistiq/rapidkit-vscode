import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ findFiles: vi.fn(), inventory: vi.fn() }));
vi.mock('vscode', async () => {
  const fs = await import('node:fs/promises');
  return {
    FileType: { File: 1 },
    RelativePattern: class {
      constructor(
        readonly base: string,
        readonly pattern: string
      ) {}
    },
    workspace: {
      findFiles: mock.findFiles,
      fs: {
        stat: async (uri: { fsPath: string }) => ({
          type: 1,
          size: (await fs.stat(uri.fsPath)).size,
        }),
      },
    },
  };
});
vi.mock('../core/studioWorkspaceInventory.js', () => ({
  inspectStudioWorkspaceInventory: mock.inventory,
}));
import {
  searchStudioCodeContext,
  readStudioSemanticSources,
} from '../core/studioCodeContextSearch.js';
import { studioCodeContextTool } from '../core/studioCodeContextTool.js';
import { configureStudioNativeDocuments } from '../core/studioNativeDocuments.js';
import {
  discoverStudioWorkspaceFiles,
  searchStudioWorkspaceSource,
} from '../core/studioWorkspaceInspection.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-code-context-'));
  vi.clearAllMocks();
  mock.inventory.mockResolvedValue({ management: 'none' });
});
afterEach(async () => {
  configureStudioNativeDocuments();
  await fs.remove(root);
});
async function files(entries: Record<string, string | Buffer>) {
  const uris = [];
  for (const [name, text] of Object.entries(entries)) {
    const fsPath = path.join(root, name);
    await fs.outputFile(fsPath, text);
    uris.push({ scheme: 'file', fsPath });
  }
  mock.findFiles.mockResolvedValue(uris);
  return uris;
}
const context = () => ({
  sessionId: 'owner',
  requestId: 'request',
  toolCallId: 'context',
  workspacePath: root,
  signal: new AbortController().signal,
});

describe('Bounded hybrid code context', () => {
  it('restricts embedding discovery to allowed live source, honoring project ignore rules and unsaved buffers', async () => {
    await files({
      'visible.ts': 'export const old = 1;',
      'ignored.ts': 'ignored source',
      '.gitignore': 'ignored.ts\n',
      '.aws/config': 'cloud credentials',
      'private.pem': 'private material',
    });
    configureStudioNativeDocuments({
      get: (file) =>
        file === path.join(root, 'visible.ts')
          ? { text: 'export const fresh = 2;', version: 2, dirty: true }
          : undefined,
      replace: async () => false,
      save: async () => false,
    });
    const result = await readStudioSemanticSources(root, new AbortController().signal);
    expect(result.documents).toEqual([{ path: 'visible.ts', text: 'export const fresh = 2;' }]);
    expect(result.coverage.omittedFiles).toBe(4);
  });
  it('rejects an innocent source alias redirected into sensitive or ignored configuration before embedding', async () => {
    await files({
      '.docker/config.json': '{"auths":{"private":"secret"}}',
      'ignored.ts': 'private',
      '.gitignore': 'ignored.ts',
    });
    await fs.symlink(path.join(root, '.docker/config.json'), path.join(root, 'alias.ts'));
    await fs.symlink(path.join(root, 'ignored.ts'), path.join(root, 'visible.ts'));
    mock.findFiles.mockResolvedValue(
      ['alias.ts', 'visible.ts'].map((name) => ({ scheme: 'file', fsPath: path.join(root, name) }))
    );
    expect((await readStudioSemanticSources(root, new AbortController().signal)).documents).toEqual(
      []
    );
  });
  it('finds camel-case code with current-source hashes and line provenance, without returning complete files', async () => {
    const content = [
      '// unrelated',
      'export function retryWebhook() {',
      '  return sendWebhook();',
      '}',
      ...Array.from({ length: 100 }, () => '// unrelated tail'),
    ].join('\n');
    await files({
      'src/webhooks.ts': content,
      'src/unrelated.ts': 'export const unrelated = true;',
    });
    const result = await searchStudioCodeContext({
      root,
      query: 'webhook retry',
      signal: context().signal,
    });
    expect(result.snippets[0]).toMatchObject({
      path: 'src/webhooks.ts',
      line: 1,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      matchedTerms: ['webhook', 'retry'],
      provenance: 'current-source',
    });
    expect(result.snippets[0].text).not.toContain(
      'unrelated tail\n// unrelated tail\n// unrelated tail\n// unrelated tail'
    );
    expect(result.coverage.scannedFiles).toBe(2);
    expect(result.coverage.outputBytes).toBeLessThanOrEqual(16_000);
    expect(JSON.stringify(result).length).toBeLessThan(content.length);
  });

  it('excludes sensitive data and symlink escapes, and honors current unsaved editor text', async () => {
    const uris = await files({
      'src.ts': 'const older = 1;',
      '.env.local': 'WEBHOOK_SECRET=private-value',
      'outside/target.ts': 'const webhook = "external";',
    });
    await fs.symlink(path.join(root, '.env.local'), path.join(root, 'alias.ts'));
    const externalRoot = path.join(root, 'outside');
    const targetRoot = path.join(root, 'project');
    await fs.ensureDir(targetRoot);
    await fs.symlink(path.join(externalRoot, 'target.ts'), path.join(targetRoot, 'escape.ts'));
    mock.findFiles.mockResolvedValue([
      ...uris,
      { scheme: 'file', fsPath: path.join(root, 'alias.ts') },
    ]);
    configureStudioNativeDocuments({
      get: (file) =>
        file === path.join(root, 'src.ts')
          ? { text: 'function retryWebhook() {}', version: 2, dirty: true }
          : undefined,
      replace: async () => false,
      save: async () => false,
    });
    const result = await searchStudioCodeContext({
      root,
      query: 'webhook retry',
      signal: context().signal,
    });
    expect(
      result.snippets.some(
        (entry) => entry.path === 'src.ts' && entry.text.includes('retryWebhook')
      )
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-value');
    mock.findFiles.mockResolvedValue([
      { scheme: 'file', fsPath: path.join(targetRoot, 'escape.ts') },
    ]);
    expect(
      (
        await searchStudioCodeContext({
          root: targetRoot,
          query: 'webhook',
          signal: context().signal,
        })
      ).snippets
    ).toEqual([]);
  });

  it('continues ordinary source retrieval without adoption when Graph ownership is absent or language tools fail', async () => {
    await files({ 'index.ts': 'export const retryWebhook = true;' });
    const graphSearch = vi.fn();
    const codeIntelligence = vi.fn(async () => {
      throw new Error('No language provider');
    });
    const result = await studioCodeContextTool({ graphSearch, codeIntelligence }).execute(
      { query: 'webhook retry', symbol: 'retryWebhook' },
      context()
    );
    expect(result).toMatchObject({
      ok: true,
      changed: false,
      output: {
        evidence: [
          {
            provider: 'source',
            status: 'returned',
            observation: { snippets: [{ path: 'index.ts' }] },
          },
          { provider: 'language', status: 'unavailable', error: 'No language provider' },
          { provider: 'graph', status: 'unavailable' },
        ],
      },
    });
    expect(graphSearch).not.toHaveBeenCalled();
  });

  it('preserves CLI graph coverage and reports projection separately from source evidence', async () => {
    await files({ 'index.ts': 'export const retryWebhook = true;' });
    mock.inventory.mockResolvedValue({ management: 'workspai' });
    const graphSearch = vi.fn(async () => ({
      ok: true,
      output: {
        scope: 'project:api',
        coverage: { graphSourceHash: 'proof-hash', truncated: false },
        result: {
          matches: Array.from({ length: 100 }, (_, i) => ({ id: i, proof: 'x'.repeat(100) })),
        },
      },
    }));
    const result = await studioCodeContextTool({ graphSearch }).execute(
      { query: 'webhook retry' },
      context()
    );
    expect(result).toMatchObject({
      ok: true,
      output: {
        evidence: [
          { provider: 'source', status: 'returned' },
          {
            provider: 'graph',
            status: 'returned',
            observation: {
              scope: 'project:api',
              coverage: { graphSourceHash: 'proof-hash', truncated: false },
              projection: { applied: true },
            },
          },
        ],
      },
    });
    expect(graphSearch).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: root, operation: 'search', limit: 6 })
    );
  });

  it('releases Stop while another read provider never resolves', async () => {
    await files({ 'index.ts': 'export const webhook = true;' });
    const controller = new AbortController();
    let began!: () => void;
    const pending = new Promise<void>((resolve) => {
      began = resolve;
    });
    const codeIntelligence = vi.fn(() => {
      began();
      return new Promise<never>(() => {});
    });
    const result = studioCodeContextTool({ codeIntelligence }).execute(
      { query: 'webhook', symbol: 'webhook' },
      { ...context(), signal: controller.signal }
    );
    await pending;
    controller.abort();
    await expect(result).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('cancelled'),
    });
  });

  it('keeps literal search and file discovery inside the real source boundary', async () => {
    const uris = await files({
      'index.ts': 'export const webhook = true;',
      '.env.local': 'webhook private-value',
    });
    await fs.symlink(path.join(root, '.env.local'), path.join(root, 'alias.ts'));
    mock.findFiles.mockResolvedValue([
      ...uris,
      { scheme: 'file', fsPath: path.join(root, 'alias.ts') },
    ]);
    expect(
      JSON.stringify(await searchStudioWorkspaceSource({ query: 'webhook', workspacePath: root }))
    ).not.toContain('private-value');
    expect(
      (await searchStudioWorkspaceSource({ query: 'webhook', workspacePath: root })).every(
        (entry) => entry.path === 'index.ts'
      )
    ).toBe(true);
    expect(await discoverStudioWorkspaceFiles({ workspacePath: root })).toEqual([
      { path: 'index.ts', size: Buffer.byteLength('export const webhook = true;') },
    ]);
  });
});
