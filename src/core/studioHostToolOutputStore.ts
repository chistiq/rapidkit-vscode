import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { parseAttachedImages, type AIImageContent } from './aiImageContent.js';
import { assertStudioSessionRetained, isStudioSessionDeleted } from './studioSessionDeletion.js';

type Output = {
  version: 1;
  owner: string;
  ref: string;
  createdAt: number;
  totalChars: number;
  text: string;
  images?: AIImageContent[];
  digest: string;
};
const operations = new Map<string, Promise<unknown>>();
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 16 * 1024 * 1024;

/** Private, bounded output storage. The owning session is required on every read. */
export class StudioHostToolOutputStore {
  private readonly root: string;
  constructor(private readonly storageRoot: string) {
    this.root = path.join(storageRoot, 'assistant-tool-outputs');
  }
  private async rootExists(create = false): Promise<boolean> {
    if (create) {
      await fs.ensureDir(this.root, { mode: 0o700 });
    }
    const stat = await fs.lstat(this.root).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!stat) {
      return false;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Invalid output storage root.');
    }
    return true;
  }
  private directory(owner: string): string {
    if (!owner || owner.length > 200) {
      throw new Error('Invalid output owner.');
    }
    return path.join(this.root, crypto.createHash('sha256').update(owner).digest('hex'));
  }
  private file(owner: string, ref: string): string {
    if (!/^host-output-[a-f0-9-]{36}$/.test(ref)) {
      throw new Error('Invalid output reference.');
    }
    return path.join(this.directory(owner), `${ref}.json`);
  }
  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = operations.get(this.root) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    operations.set(this.root, next);
    try {
      return await next;
    } finally {
      if (operations.get(this.root) === next) {
        operations.delete(this.root);
      }
    }
  }
  async save(
    owner: string,
    ref: string,
    text: string,
    totalChars: number,
    images?: AIImageContent[]
  ): Promise<void> {
    await this.serialize(async () => {
      await assertStudioSessionRetained(this.storageRoot, owner);
      if (
        text.length > 2_000_000 ||
        totalChars < text.length ||
        !Number.isSafeInteger(totalChars)
      ) {
        throw new Error('Invalid retained output size.');
      }
      const file = this.file(owner, ref);
      await this.rootExists(true);
      const directory = path.dirname(file);
      await fs.ensureDir(directory, { mode: 0o700 });
      if ((await fs.lstat(directory)).isSymbolicLink()) {
        throw new Error('Invalid output directory.');
      }
      const validated = parseAttachedImages(images);
      const content = {
        version: 1 as const,
        owner,
        ref,
        createdAt: Date.now(),
        totalChars,
        text,
        ...(validated.length ? { images: validated } : {}),
      };
      const record = JSON.stringify({ ...content, digest: this.digest(content) });
      if (Buffer.byteLength(record) > MAX_BYTES) {
        throw new Error('Retained output is too large.');
      }
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temp, record, { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, file);
      } finally {
        await fs.remove(temp).catch(() => undefined);
      }
      await this.prune(file);
    });
  }
  private digest(content: Omit<Output, 'digest'>): string {
    return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
  }
  async read(
    owner: string,
    ref: string
  ): Promise<{ text: string; totalChars: number; images?: AIImageContent[] }> {
    // Expiry deletes durable bytes, so serialize it with replacement and chat deletion.
    return this.serialize(() => this.readRetained(owner, ref));
  }
  private async readRetained(
    owner: string,
    ref: string
  ): Promise<{ text: string; totalChars: number; images?: AIImageContent[] }> {
    await assertStudioSessionRetained(this.storageRoot, owner);
    const file = this.file(owner, ref);
    if (!(await this.rootExists())) {
      throw new Error('Retained output is unavailable.');
    }
    const stat = await fs.lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > MAX_BYTES ||
      (await fs.lstat(path.dirname(file))).isSymbolicLink()
    ) {
      throw new Error('Invalid retained output.');
    }
    const record = (await fs.readJSON(file)) as Output;
    const { digest, ...content } = record;
    if (
      record.version !== 1 ||
      record.owner !== owner ||
      record.ref !== ref ||
      typeof record.text !== 'string' ||
      record.text.length > 2_000_000 ||
      !Number.isSafeInteger(record.totalChars) ||
      record.totalChars < record.text.length ||
      !Number.isFinite(record.createdAt) ||
      this.digest(content) !== digest
    ) {
      throw new Error('Output integrity, ownership or retention check failed.');
    }
    if (Date.now() - record.createdAt > MAX_AGE) {
      await fs.remove(file);
      throw new Error('Output retention check failed; the expired record was removed.');
    }
    const images = parseAttachedImages(record.images);
    return {
      text: record.text,
      totalChars: record.totalChars,
      ...(images.length ? { images } : {}),
    };
  }
  async delete(owner: string): Promise<void> {
    await this.serialize(async () => {
      if (await this.rootExists()) {
        await fs.remove(this.directory(owner));
      }
    });
  }
  async list(
    owner: string
  ): Promise<
    Array<{ outputRef: string; retainedChars: number; totalChars: number; imageCount?: number }>
  > {
    if (await isStudioSessionDeleted(this.storageRoot, owner)) {
      return [];
    }
    if (!(await this.rootExists())) {
      return [];
    }
    const names = await fs.readdir(this.directory(owner)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return [] as string[];
      }
      throw error;
    });
    const outputs: Array<{
      outputRef: string;
      retainedChars: number;
      totalChars: number;
      imageCount?: number;
    }> = [];
    for (const name of names
      .filter((name) => /^host-output-[a-f0-9-]{36}\.json$/.test(name))
      .slice(-8)) {
      const outputRef = name.slice(0, -5);
      const entry = await this.read(owner, outputRef).catch(() => undefined);
      if (entry) {
        outputs.push({
          outputRef,
          retainedChars: entry.text.length,
          totalChars: entry.totalChars,
          ...(entry.images?.length ? { imageCount: entry.images.length } : {}),
        });
      }
    }
    return outputs;
  }
  private async prune(protectedFile: string): Promise<void> {
    const entries: Array<{ file: string; directory: string; size: number; at: number }> = [];
    for (const owner of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!owner.isDirectory() || !/^[a-f0-9]{64}$/.test(owner.name)) {
        continue;
      }
      const directory = path.join(this.root, owner.name);
      for (const name of await fs.readdir(directory)) {
        if (!/^host-output-[a-f0-9-]{36}\.json$/.test(name)) {
          continue;
        }
        const file = path.join(directory, name);
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          continue;
        }
        entries.push({ file, directory, size: stat.size, at: stat.mtimeMs });
      }
    }
    entries.sort(
      (a, b) =>
        Number(b.file === protectedFile) - Number(a.file === protectedFile) ||
        b.at - a.at ||
        a.file.localeCompare(b.file)
    );
    let bytes = 0;
    let count = 0;
    const owners = new Map<string, { count: number; bytes: number }>();
    for (const entry of entries) {
      const used = owners.get(entry.directory) ?? { count: 0, bytes: 0 };
      if (
        entry.file !== protectedFile &&
        (Date.now() - entry.at > MAX_AGE ||
          count >= 256 ||
          bytes + entry.size > 64 * 1024 * 1024 ||
          used.count >= 8 ||
          used.bytes + entry.size > 32 * 1024 * 1024)
      ) {
        await fs.remove(entry.file);
      } else {
        bytes += entry.size;
        count++;
        owners.set(entry.directory, { count: used.count + 1, bytes: used.bytes + entry.size });
      }
    }
  }
}

/** Shared by all session transports; bytes live outside the event log. */
export function studioToolImageRetention(storageRoot: string) {
  const store = new StudioHostToolOutputStore(storageRoot);
  return async (sessionId: string, images: AIImageContent[]): Promise<string> => {
    const ref = `host-output-${crypto.randomUUID()}`;
    await store.save(sessionId, ref, '', 0, images);
    return ref;
  };
}
