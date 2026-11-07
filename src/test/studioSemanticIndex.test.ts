import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioSemanticIndex, type StudioEmbeddingProvider } from '../core/studioSemanticIndex.js';
import { studioSourceIgnore } from '../core/studioSourceIgnore.js';
import { isStudioSemanticSourcePath } from '../core/studioSemanticSourcePolicy.js';

let storage: string;
const signal = () => new AbortController().signal;
beforeEach(async () => {
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-semantic-'));
});
afterEach(async () => {
  await fs.remove(storage);
});
function provider(identity = 'fixture-embedding-model') {
  const embed = vi.fn(async (texts: string[]) => ({
    vectors: texts.map((text) => (/retry|outages|resilience/i.test(text) ? [1, 0, 0] : [0, 1, 0])),
    inputTokens: texts.length * 10,
  }));
  return { identity, embed };
}
const documents = [
  { path: 'retry.ts', text: 'export const retryWithJitter = () => true; // EXACT_SOURCE_BODY' },
  { path: 'theme.py', text: 'palette = "blue"' },
];
describe('Independent embedding-backed code index', () => {
  it('exposes long-chunk truncation and bounds vector storage independently of embedding dimensions', async () => {
    const p: StudioEmbeddingProvider = {
      identity: 'wide-vector',
      embed: async (texts) => ({
        vectors: texts.map(() => Array.from({ length: 4096 }, (_, i) => (i === 0 ? 1 : 0))),
      }),
    };
    const result = await new StudioSemanticIndex(storage, p).search({
      root: '/fixture/a',
      documents: [{ path: 'long.ts', text: 'x'.repeat(6000) }],
      query: 'meaning',
      signal: signal(),
    });
    expect(result.snippets[0]).toMatchObject({ embeddingTextTruncated: true, textTruncated: true });
    expect(result.coverage.vectorCapacity).toBe(146);
    expect(result.embeddingUsage.complete).toBe(false);
  });
  it('clears all providers of one source without affecting a different source', async () => {
    const first = new StudioSemanticIndex(storage, provider('one'));
    await first.search({ root: '/a', documents, query: 'retry', signal: signal() });
    await new StudioSemanticIndex(storage, provider('two')).search({
      root: '/a',
      documents,
      query: 'retry',
      signal: signal(),
    });
    await first.search({ root: '/b', documents, query: 'retry', signal: signal() });
    await first.clearSource('/a');
    expect(await fs.readdir(path.join(storage, 'assistant-semantic-index'))).toHaveLength(1);
  });
  it('ranks cosine vectors for a query with no shared source words and persists no source text', async () => {
    const p = provider(),
      index = new StudioSemanticIndex(storage, p);
    const result = await index.search({
      root: '/fixture/project',
      documents,
      query: 'recover from outages',
      signal: signal(),
    });
    expect(result.snippets[0]).toMatchObject({
      path: 'retry.ts',
      score: 1,
      provenance: 'embedding-cosine-current-source',
    });
    expect(result.coverage).toMatchObject({ newChunks: 2, reusedChunks: 0, remainingChunks: 0 });
    const folder = path.join(storage, 'assistant-semantic-index');
    const raw = await fs.readFile(path.join(folder, (await fs.readdir(folder))[0]), 'utf8');
    expect(raw).not.toContain('EXACT_SOURCE_BODY');
    expect(raw).not.toContain('/fixture/project');
    const reloaded = await new StudioSemanticIndex(storage, p).search({
      root: '/fixture/project',
      documents,
      query: 'resilience',
      signal: signal(),
    });
    expect(reloaded.coverage).toMatchObject({ newChunks: 0, reusedChunks: 2 });
    expect(p.embed).toHaveBeenCalledTimes(3); // query + one source batch + next query
    expect(result.embeddingUsage).toMatchObject({ reportedInputTokens: 30, complete: true });
  });
  it('invalidates changed/deleted files, exposes partial coverage and clears only the owning source/provider', async () => {
    const p = provider(),
      index = new StudioSemanticIndex(storage, p);
    const first = await index.search({
      root: '/fixture/a',
      documents,
      query: 'resilience',
      maxNewChunks: 1,
      signal: signal(),
    });
    expect(first.coverage).toMatchObject({ indexedChunks: 1, remainingChunks: 1, truncated: true });
    const second = await index.search({
      root: '/fixture/a',
      documents,
      query: 'resilience',
      maxNewChunks: 1,
      signal: signal(),
    });
    expect(second.coverage).toMatchObject({
      indexedChunks: 2,
      reusedChunks: 1,
      remainingChunks: 0,
    });
    const changed = await index.search({
      root: '/fixture/a',
      documents: [{ path: 'theme.py', text: 'palette = "red"' }],
      query: 'palette',
      signal: signal(),
    });
    expect(changed.coverage).toMatchObject({ indexedChunks: 1, reusedChunks: 0, newChunks: 1 });
    expect(changed.snippets.every((s) => s.path === 'theme.py')).toBe(true);
    await index.search({ root: '/fixture/b', documents, query: 'palette', signal: signal() });
    await index.clear('/fixture/a');
    expect(await fs.readdir(path.join(storage, 'assistant-semantic-index'))).toHaveLength(1);
  });
  it('rebuilds changed embedding dimensions and never mixes model identities', async () => {
    const p = provider();
    await new StudioSemanticIndex(storage, p).search({
      root: '/fixture/a',
      documents,
      query: 'retry',
      signal: signal(),
    });
    p.embed.mockImplementation(async (texts) => ({
      vectors: texts.map(() => [1, 0]),
      inputTokens: 5,
    }));
    expect(
      (
        await new StudioSemanticIndex(storage, p).search({
          root: '/fixture/a',
          documents,
          query: 'retry',
          signal: signal(),
        })
      ).coverage
    ).toMatchObject({ reusedChunks: 0, newChunks: 2 });
    expect(
      (
        await new StudioSemanticIndex(storage, provider('other-model')).search({
          root: '/fixture/a',
          documents,
          query: 'retry',
          signal: signal(),
        })
      ).coverage.reusedChunks
    ).toBe(0);
  });
  it.each([[0, 0], [NaN, 1], [Infinity, 1], [1], ['bad', 1]])(
    'rejects invalid embeddings rather than producing fabricated relevance: %j',
    async (vector) => {
      const p: StudioEmbeddingProvider = {
        identity: 'invalid',
        embed: async (texts) => ({ vectors: texts.map(() => vector as number[]) }),
      };
      await expect(
        new StudioSemanticIndex(storage, p).search({
          root: '/fixture/a',
          documents,
          query: 'retry',
          signal: signal(),
        })
      ).rejects.toThrow(/vector/);
    }
  );
  it('does not persist a cancelled request or silently repair a tampered cache', async () => {
    const controller = new AbortController();
    controller.abort();
    const p = provider(),
      index = new StudioSemanticIndex(storage, p);
    await expect(
      index.search({ root: '/fixture/a', documents, query: 'retry', signal: controller.signal })
    ).rejects.toThrow('cancelled');
    expect(p.embed).not.toHaveBeenCalled();
    await index.search({ root: '/fixture/a', documents, query: 'retry', signal: signal() });
    const folder = path.join(storage, 'assistant-semantic-index'),
      file = path.join(folder, (await fs.readdir(folder))[0]);
    const data = await fs.readJSON(file);
    data.entries[0].vector = [0, 1, 0];
    await fs.writeJSON(file, data);
    await expect(
      index.search({ root: '/fixture/a', documents, query: 'retry', signal: signal() })
    ).rejects.toThrow('integrity');
    await index.clear('/fixture/a');
    expect(await fs.pathExists(file)).toBe(false);
  });
  it('rejects redirected private storage and sensitive source paths before embedding source', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-outside-'));
    try {
      await fs.symlink(outside, path.join(storage, 'assistant-semantic-index'));
      await expect(
        new StudioSemanticIndex(storage, provider()).search({
          root: '/fixture/a',
          documents,
          query: 'retry',
          signal: signal(),
        })
      ).rejects.toThrow('redirected');
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.remove(outside);
    }
    for (const file of [
      '.aws/config',
      '.ssh/id_rsa',
      'keys/server.pem',
      '.env.local',
      'src/credentials.json',
    ])
      expect(isStudioSemanticSourcePath(file)).toBe(false);
  });
  it('honors nested ignore negation without permitting re-inclusion below an ignored directory', async () => {
    await fs.outputFile(path.join(storage, '.gitignore'), '*.ts\nprivate/\n');
    await fs.outputFile(path.join(storage, 'src/.gitignore'), '!keep.ts\n');
    await fs.outputFile(path.join(storage, 'private/.gitignore'), '!data.ts\n');
    await fs.outputFile(path.join(storage, '.workspaiignore'), 'local.py\n');
    const ignored = await studioSourceIgnore(storage);
    expect(await ignored('src/drop.ts')).toBe(true);
    expect(await ignored('src/keep.ts')).toBe(false);
    expect(await ignored('private/data.ts')).toBe(true);
    expect(await ignored('local.py')).toBe(true);
    expect(await ignored('other.py')).toBe(false);
  });
});
