import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioExecutionTarget } from './studioProjectTarget.js';
import { assertStudioSessionRetained, isStudioSessionDeleted } from './studioSessionDeletion.js';

export type StudioRequestHistoryEntry = {
  requestId: string;
  status: StudioAgentPersistedSession['status'];
  updatedAt: string;
  workspacePath: string;
  executionTarget?: StudioExecutionTarget;
  bytes: number;
};
type Index = { version: 1; owner: string; entries: StudioRequestHistoryEntry[] };
type Archive = {
  version: 1;
  owner: string;
  requestId: string;
  session: StudioAgentPersistedSession;
  digest: string;
};
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export function studioSessionRequestId(session: StudioAgentPersistedSession): string {
  return (
    [...session.events].reverse().find((event) => event.requestId)?.requestId ??
    `legacy-${hash(session.createdAt).slice(0, 24)}`
  );
}

/** Archived controller snapshots, separate from the small current-session index. */
export class StudioRequestHistory {
  private readonly root: string;
  constructor(storageRoot: string) {
    this.root = path.join(storageRoot, 'studio-request-history');
  }
  private directory(owner: string): string {
    if (!owner || owner.length > 200) {
      throw new Error('Invalid request history owner.');
    }
    return path.join(this.root, hash(owner));
  }
  private file(owner: string, requestId: string): string {
    if (!requestId || requestId.length > 200) {
      throw new Error('Invalid request history identity.');
    }
    return path.join(this.directory(owner), `${hash(requestId)}.json`);
  }
  private async readIndex(owner: string): Promise<Index> {
    const file = path.join(this.directory(owner), 'index.json');
    let value: Index;
    try {
      const stat = await fs.lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 256 * 1024 ||
        (await fs.lstat(path.dirname(file))).isSymbolicLink()
      ) {
        throw new Error('Invalid history index storage.');
      }
      value = (await fs.readJSON(file)) as Index;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, owner, entries: [] };
      }
      throw new Error('Saved request history is unreadable; it was not reset.');
    }
    if (
      value.version !== 1 ||
      value.owner !== owner ||
      !Array.isArray(value.entries) ||
      value.entries.length > 32 ||
      value.entries.some(
        (entry) =>
          !entry ||
          typeof entry.requestId !== 'string' ||
          !entry.requestId ||
          entry.requestId.length > 200 ||
          typeof entry.updatedAt !== 'string' ||
          !Number.isFinite(Date.parse(entry.updatedAt)) ||
          typeof entry.workspacePath !== 'string' ||
          !Number.isSafeInteger(entry.bytes) ||
          entry.bytes < 0 ||
          entry.bytes > MAX_BYTES
      )
    ) {
      throw new Error('Saved request history has an invalid identity or format.');
    }
    return value;
  }
  private async write(file: string, value: unknown): Promise<void> {
    await fs.ensureDir(path.dirname(file), { mode: 0o700 });
    if ((await fs.lstat(path.dirname(file))).isSymbolicLink()) {
      throw new Error('Invalid history storage directory.');
    }
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeJSON(temporary, value, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, file);
    } finally {
      await fs.remove(temporary).catch(() => undefined);
    }
  }
  async archive(session: StudioAgentPersistedSession): Promise<void> {
    const owner = session.id;
    await assertStudioSessionRetained(path.dirname(this.root), owner);
    const requestId = studioSessionRequestId(session);
    const terminal = [...session.events]
      .reverse()
      .find(
        (event) =>
          event.requestId === requestId &&
          ['session.completed', 'session.failed', 'session.cancelled'].includes(event.type)
      );
    if (terminal) {
      session = {
        ...session,
        status:
          terminal.type === 'session.completed'
            ? 'completed'
            : terminal.type === 'session.cancelled'
              ? 'cancelled'
              : 'failed',
      };
    }
    const content = { version: 1 as const, owner, requestId, session };
    const value: Archive = { ...content, digest: hash(JSON.stringify(content)) };
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > MAX_BYTES) {
      throw new Error('The request snapshot exceeds its history budget.');
    }
    const index = await this.readIndex(owner);
    const metadata: StudioRequestHistoryEntry = {
      requestId,
      status: session.status,
      updatedAt: session.updatedAt,
      workspacePath: session.workspacePath,
      bytes,
      ...(session.executionTarget ? { executionTarget: session.executionTarget } : {}),
    };
    const entries = [metadata, ...index.entries.filter((entry) => entry.requestId !== requestId)]
      .filter((entry, at) => at === 0 || Date.now() - Date.parse(entry.updatedAt) <= MAX_AGE)
      .slice(0, 32);
    while (
      entries.length > 1 &&
      Buffer.byteLength(JSON.stringify({ version: 1, owner, entries })) > 250 * 1024
    ) {
      entries.pop();
    }
    // Publish the archive before referencing it, and the new index before removing old files.
    await this.write(this.file(owner, requestId), value);
    await this.write(path.join(this.directory(owner), 'index.json'), {
      version: 1,
      owner,
      entries,
    });
    for (const old of index.entries) {
      if (!entries.some((entry) => entry.requestId === old.requestId)) {
        await fs.remove(this.file(owner, old.requestId));
      }
    }
    await this.prune(this.file(owner, requestId));
  }
  async list(owner: string): Promise<StudioRequestHistoryEntry[]> {
    if (await isStudioSessionDeleted(path.dirname(this.root), owner)) {
      return [];
    }
    const index = await this.readIndex(owner);
    const entries: StudioRequestHistoryEntry[] = [];
    for (const entry of index.entries) {
      if (Date.now() - Date.parse(entry.updatedAt) > MAX_AGE) {
        continue;
      }
      if (await fs.pathExists(this.file(owner, entry.requestId))) {
        entries.push(structuredClone(entry));
      }
    }
    return entries;
  }
  async load(owner: string, requestId: string): Promise<StudioAgentPersistedSession | undefined> {
    if (await isStudioSessionDeleted(path.dirname(this.root), owner)) {
      return undefined;
    }
    const file = this.file(owner, requestId);
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!stat) {
      return undefined;
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > MAX_BYTES ||
      (await fs.lstat(path.dirname(file))).isSymbolicLink()
    ) {
      throw new Error('Invalid request snapshot.');
    }
    const archive = (await fs.readJSON(file)) as Archive;
    const { digest, ...content } = archive;
    if (
      hash(JSON.stringify(content)) !== digest ||
      archive.version !== 1 ||
      archive.owner !== owner ||
      archive.requestId !== requestId ||
      archive.session?.id !== owner ||
      studioSessionRequestId(archive.session) !== requestId ||
      !Number.isFinite(Date.parse(archive.session.updatedAt)) ||
      Date.now() - Date.parse(archive.session.updatedAt) > MAX_AGE
    ) {
      throw new Error('Request snapshot identity or retention check failed.');
    }
    return archive.session;
  }
  async delete(owner: string): Promise<void> {
    await fs.remove(this.directory(owner));
  }
  private async prune(protectedFile: string): Promise<void> {
    const entries: Array<{ file: string; size: number; modified: number }> = [];
    for (const owner of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!owner.isDirectory() || !/^[a-f0-9]{64}$/.test(owner.name)) {
        continue;
      }
      const directory = path.join(this.root, owner.name);
      for (const name of await fs.readdir(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) {
          continue;
        }
        const file = path.join(directory, name);
        const stat = await fs.lstat(file);
        if (stat.isFile() && !stat.isSymbolicLink()) {
          entries.push({ file, size: stat.size, modified: stat.mtimeMs });
        }
      }
    }
    entries.sort(
      (a, b) =>
        Number(b.file === protectedFile) - Number(a.file === protectedFile) ||
        b.modified - a.modified
    );
    let bytes = 0;
    let count = 0;
    for (const entry of entries) {
      if (
        entry.file !== protectedFile &&
        (count >= 256 ||
          bytes + entry.size > 64 * 1024 * 1024 ||
          Date.now() - entry.modified > MAX_AGE)
      ) {
        await fs.remove(entry.file);
      } else {
        bytes += entry.size;
        count++;
      }
    }
  }
}
