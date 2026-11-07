import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import { isStudioSemanticSourcePath } from './studioSemanticSourcePolicy.js';

export type StudioEmbeddingProvider = {
  identity: string;
  embed(
    texts: string[],
    signal: AbortSignal
  ): Promise<{ vectors: number[][]; inputTokens?: number }>;
};
export type StudioSemanticDocument = { path: string; text: string };
type Chunk = {
  path: string;
  sha256: string;
  line: number;
  endLine: number;
  text: string;
  embeddingTextTruncated: boolean;
  key: string;
};
type Entry = Omit<Chunk, 'text'> & { vector: number[] };
type Index = {
  version: 1;
  scope: string;
  provider: string;
  updatedAt: number;
  entries: Entry[];
  digest: string;
};
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const locks = new Map<string, Promise<unknown>>();
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_CHUNKS = 2048;
function cancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error('Semantic retrieval was cancelled.');
  }
}
function normalized(raw: unknown): number[] {
  if (
    !Array.isArray(raw) ||
    raw.length < 2 ||
    raw.length > 4096 ||
    raw.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6)
  ) {
    throw new Error('Embedding provider returned an invalid bounded vector.');
  }
  const norm = Math.hypot(...raw);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error('Embedding provider returned a zero/invalid vector.');
  }
  return raw.map((n) => n / norm);
}
function chunksFor(documents: StudioSemanticDocument[]): { chunks: Chunk[]; truncated: boolean } {
  const chunks: Chunk[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const document of documents) {
    if (
      !document ||
      typeof document.path !== 'string' ||
      typeof document.text !== 'string' ||
      studioSourcePathDenialReason(document.path) ||
      !isStudioSemanticSourcePath(document.path) ||
      path.isAbsolute(document.path) ||
      /\\|\0/.test(document.path) ||
      document.path.split('/').includes('..') ||
      seen.has(document.path)
    ) {
      throw new Error('Semantic documents require unique, safe source-relative paths.');
    }
    seen.add(document.path);
    bytes += Buffer.byteLength(document.text);
    if (
      document.text.length > 256 * 1024 ||
      bytes > 16 * 1024 * 1024 ||
      document.text.includes('\0')
    ) {
      throw new Error('Semantic source budget exceeded.');
    }
    const lines = document.text.split(/\r?\n/);
    const digest = sha(document.text);
    for (let start = 0; start < lines.length; start += 40) {
      const fullText = lines.slice(start, start + 40).join('\n');
      const text = fullText.slice(0, 4000);
      if (!text.trim()) {
        continue;
      }
      if (chunks.length === MAX_CHUNKS) {
        return { chunks, truncated: true };
      }
      const line = start + 1,
        endLine = Math.min(start + 40, lines.length);
      const key = sha(JSON.stringify([document.path, digest, line, text]));
      chunks.push({
        path: document.path,
        sha256: digest,
        line,
        endLine,
        text,
        key,
        embeddingTextTruncated: fullText.length > 4000,
      });
    }
  }
  return { chunks, truncated: false };
}

/** Independent embedding index: no source text is persisted and no lexical scores masquerade as vectors. */
export class StudioSemanticIndex {
  private readonly directory: string;
  constructor(
    storageRoot: string,
    private readonly provider: StudioEmbeddingProvider
  ) {
    if (!provider.identity || provider.identity.length > 1000) {
      throw new Error('Invalid embedding provider identity.');
    }
    this.directory = path.join(storageRoot, 'assistant-semantic-index');
  }
  private async safeDirectory() {
    await fs.ensureDir(this.directory, { mode: 0o700 });
    const stat = await fs.lstat(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await fs.realpath(this.directory)) !== path.resolve(this.directory)
    ) {
      throw new Error('Semantic index storage was redirected.');
    }
  }
  private async serial<T>(file: string, action: () => Promise<T>): Promise<T> {
    const before = locks.get(file) ?? Promise.resolve();
    const next = before.catch(() => undefined).then(action);
    locks.set(file, next);
    try {
      return await next;
    } finally {
      if (locks.get(file) === next) {
        locks.delete(file);
      }
    }
  }
  private locator(root: string) {
    const scope = sha(path.resolve(root));
    const provider = sha(this.provider.identity);
    return { scope, provider, file: path.join(this.directory, `${scope}-${provider}.json`) };
  }
  private async load(file: string, scope: string, provider: string): Promise<Entry[]> {
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!stat) {
      return [];
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CACHE_BYTES) {
      throw new Error('Invalid semantic index storage.');
    }
    const value = (await fs.readJSON(file)) as Index;
    const { digest, ...content } = value;
    if (
      value.version !== 1 ||
      value.scope !== scope ||
      value.provider !== provider ||
      !Number.isFinite(value.updatedAt) ||
      !Array.isArray(value.entries) ||
      value.entries.length > MAX_CHUNKS ||
      digest !== sha(JSON.stringify(content))
    ) {
      throw new Error('Semantic index integrity check failed; clear the derived index to rebuild.');
    }
    if (Date.now() - value.updatedAt > 30 * 24 * 3600_000) {
      return [];
    }
    return value.entries;
  }
  private async save(file: string, value: Omit<Index, 'digest'>) {
    const bytes = JSON.stringify({ ...value, digest: sha(JSON.stringify(value)) });
    if (Buffer.byteLength(bytes) > MAX_CACHE_BYTES) {
      throw new Error('Semantic index cache budget exceeded.');
    }
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, file);
    } finally {
      await fs.remove(temporary).catch(() => undefined);
    }
    const retained: Array<{ file: string; size: number; at: number }> = [];
    for (const name of await fs.readdir(this.directory)) {
      if (!/^[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(name)) {
        continue;
      }
      const target = path.join(this.directory, name),
        stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            return undefined;
          }
          throw error;
        });
      if (stat?.isFile() && !stat.isSymbolicLink()) {
        retained.push({ file: target, size: stat.size, at: stat.mtimeMs });
      }
    }
    retained.sort((a, b) => Number(b.file === file) - Number(a.file === file) || b.at - a.at);
    let used = 0;
    for (const [index, entry] of retained.entries()) {
      used += entry.size;
      if (
        entry.file !== file &&
        (index >= 16 || used > 64 * 1024 * 1024 || Date.now() - entry.at > 30 * 24 * 3600_000)
      ) {
        await fs.remove(entry.file);
      }
    }
  }
  async clear(root: string): Promise<void> {
    const { file, scope } = this.locator(root);
    await this.serial(path.join(this.directory, scope), async () => {
      await this.safeDirectory();
      await fs.remove(file);
    });
  }
  async clearSource(root: string): Promise<void> {
    const { scope } = this.locator(root);
    await this.serial(path.join(this.directory, scope), async () => {
      await this.safeDirectory();
      for (const name of await fs.readdir(this.directory)) {
        if (name.startsWith(`${scope}-`) && /^[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(name)) {
          await fs.remove(path.join(this.directory, name));
        }
      }
    });
  }
  async search(input: {
    root: string;
    documents: StudioSemanticDocument[];
    query: string;
    signal: AbortSignal;
    limit?: number;
    maxNewChunks?: number;
  }) {
    const { file, scope, provider } = this.locator(input.root);
    return this.serial(path.join(this.directory, scope), async () => {
      cancelled(input.signal);
      if (
        !input.query.trim() ||
        input.query.length > 500 ||
        !Number.isInteger(input.limit ?? 8) ||
        (input.limit ?? 8) < 1 ||
        (input.limit ?? 8) > 12 ||
        !Number.isInteger(input.maxNewChunks ?? 64) ||
        (input.maxNewChunks ?? 64) < 0 ||
        (input.maxNewChunks ?? 64) > 128
      ) {
        throw new Error('Invalid semantic query or indexing allowance.');
      }
      await this.safeDirectory();
      const { chunks, truncated } = chunksFor(input.documents);
      const requested = new Map(chunks.map((chunk) => [chunk.key, chunk]));
      const stored = await this.load(file, scope, provider);
      const queryResponse = await this.provider.embed([input.query], input.signal);
      cancelled(input.signal);
      if (queryResponse.vectors.length !== 1) {
        throw new Error('Embedding provider omitted the query vector.');
      }
      const query = normalized(queryResponse.vectors[0]);
      const cache = new Map<string, Entry>();
      for (const entry of stored) {
        const current = requested.get(entry.key);
        if (
          !current ||
          entry.path !== current.path ||
          entry.sha256 !== current.sha256 ||
          entry.line !== current.line ||
          entry.endLine !== current.endLine
        ) {
          continue;
        }
        const vector = normalized(entry.vector);
        if (vector.length === query.length && cache.size < Math.floor(600_000 / query.length)) {
          cache.set(entry.key, { ...entry, vector });
        }
      }
      const reused = cache.size;
      const pending = chunks
        .filter((chunk) => !cache.has(chunk.key))
        .slice(
          0,
          Math.min(
            input.maxNewChunks ?? 64,
            Math.max(0, Math.floor(600_000 / query.length) - cache.size)
          )
        );
      let inputTokens = queryResponse.inputTokens ?? 0,
        usageComplete = queryResponse.inputTokens !== undefined;
      for (let start = 0; start < pending.length; start += 8) {
        cancelled(input.signal);
        const batch = pending.slice(start, start + 8);
        const response = await this.provider.embed(
          batch.map((chunk) => `${chunk.path}\n${chunk.text}`),
          input.signal
        );
        cancelled(input.signal);
        if (response.vectors.length !== batch.length) {
          throw new Error('Embedding provider returned an incomplete batch.');
        }
        inputTokens += response.inputTokens ?? 0;
        usageComplete &&= response.inputTokens !== undefined;
        response.vectors.forEach((raw, index) => {
          const vector = normalized(raw);
          if (vector.length !== query.length) {
            throw new Error('Embedding dimensions changed during the request.');
          }
          const { text: _text, ...chunk } = batch[index];
          void _text;
          cache.set(chunk.key, { ...chunk, vector });
        });
      }
      cancelled(input.signal);
      await this.safeDirectory();
      await this.save(file, {
        version: 1,
        scope,
        provider,
        updatedAt: Date.now(),
        entries: [...cache.values()],
      });
      const snippets = [...cache.values()]
        .map((entry) => ({
          ...requested.get(entry.key)!,
          score: entry.vector.reduce((sum, n, index) => sum + n * query[index], 0),
        }))
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line)
        .slice(0, input.limit ?? 8)
        .map(({ key: _key, ...chunk }) => ({
          ...chunk,
          text: chunk.text.slice(0, 1800),
          textTruncated: chunk.text.length > 1800,
          provenance: 'embedding-cosine-current-source' as const,
        }));
      return {
        ranking: 'embedding-cosine',
        observedAt: new Date().toISOString(),
        snippets,
        coverage: {
          sourceFiles: input.documents.length,
          availableChunks: chunks.length,
          indexedChunks: cache.size,
          reusedChunks: reused,
          newChunks: pending.length,
          remainingChunks: chunks.length - cache.size,
          vectorCapacity: Math.min(MAX_CHUNKS, Math.floor(600_000 / query.length)),
          truncated: truncated || cache.size < chunks.length,
        },
        embeddingUsage: {
          reportedInputTokens: inputTokens,
          complete: usageComplete,
          instruction:
            'Embedding usage is separate from chat tokens; missing usage is not zero cost.',
        },
        instruction:
          'Embedding relevance is not proof of correctness or exhaustive recall. Inspect exact current source before editing. Partial coverage is explicit; another bounded call can index remaining chunks up to vectorCapacity. Use focused ordinary search for files beyond that capacity. No Workspai adoption or intelligence chain is required.',
      };
    });
  }
}
