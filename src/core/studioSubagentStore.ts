import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import { StudioAttachmentStore } from './studioAttachmentStore.js';
import { StudioHostToolOutputStore } from './studioHostToolOutputStore.js';
import { StudioRequestHistory } from './studioRequestHistory.js';
import {
  assertStudioSessionRetained,
  isStudioSessionDeleted,
  markStudioSessionDeleted,
} from './studioSessionDeletion.js';

export type StudioSubagentMetadata = {
  childSessionId: string;
  requestId: string;
  toolCallId: string;
  kind: 'research' | 'execution';
  objective: string;
  status: StudioAgentPersistedSession['status'];
  updatedAt: string;
};
type RecordData = {
  version: 1;
  owner: string;
  session: StudioAgentPersistedSession;
  digest: string;
};
const MAX_AGE = 30 * 24 * 3600 * 1000;
const MAX_RECORD = 4 * 1024 * 1024 + 4_096;
const MAX_OWNER = 16 * 1024 * 1024;
const MAX_TOTAL = 64 * 1024 * 1024;
const operations = new Map<string, Promise<unknown>>();
const digest = (data: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const childName = /^child-([A-Za-z0-9][A-Za-z0-9_-]{0,199})\.json$/;

/** Children never evict main chats. Every snapshot is atomically published under its parent. */
export class StudioSubagentStore {
  private readonly root: string;
  constructor(
    private readonly storageRoot: string,
    private readonly isActive: (childId: string) => boolean = () => false
  ) {
    this.root = path.join(storageRoot, 'assistant-subagents');
  }
  private directory(owner: string): string {
    if (!owner || owner.length > 200) {
      throw new Error('Invalid subagent owner.');
    }
    return path.join(this.root, crypto.createHash('sha256').update(owner).digest('hex'));
  }
  private file(owner: string, child: string): string {
    const name = `child-${child}.json`;
    if (!childName.test(name) || child === owner) {
      throw new Error('Invalid child session identity.');
    }
    return path.join(this.directory(owner), name);
  }
  private async serial<T>(action: () => Promise<T>): Promise<T> {
    const previous = operations.get(this.root) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    operations.set(this.root, next);
    try {
      return await next;
    } finally {
      if (operations.get(this.root) === next) {
        operations.delete(this.root);
      }
    }
  }
  private async validDirectory(owner: string, create = false): Promise<boolean> {
    const directory = this.directory(owner);
    if (create) {
      await fs.ensureDir(this.root, { mode: 0o700 });
      if ((await fs.lstat(this.root)).isSymbolicLink()) {
        throw new Error('Invalid subagent storage directory.');
      }
      await fs.ensureDir(directory, { mode: 0o700 });
    }
    for (const entry of [this.root, directory]) {
      const stat = await fs.lstat(entry).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      if (!stat) {
        return false;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error('Invalid subagent storage directory.');
      }
    }
    return true;
  }
  private async read(
    owner: string,
    child: string
  ): Promise<StudioAgentPersistedSession | undefined> {
    const file = this.file(owner, child);
    if (
      (await isStudioSessionDeleted(this.storageRoot, owner)) ||
      (await isStudioSessionDeleted(this.storageRoot, child)) ||
      !(await this.validDirectory(owner))
    ) {
      return undefined;
    }
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!stat) {
      return undefined;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD) {
      throw new Error('Invalid child snapshot.');
    }
    const record = (await fs.readJSON(file)) as RecordData;
    const { digest: expected, ...content } = record;
    const session = record.session;
    const parent = session?.parent;
    if (
      record.version !== 1 ||
      record.owner !== owner ||
      session?.id !== child ||
      parent?.sessionId !== owner ||
      !parent.requestId ||
      !parent.toolCallId ||
      !['research', 'execution'].includes(parent.kind) ||
      !Array.isArray(session.events) ||
      !Number.isFinite(Date.parse(session.updatedAt)) ||
      digest(content) !== expected
    ) {
      throw new Error('Child snapshot ownership or integrity check failed.');
    }
    return Date.now() - Date.parse(session.updatedAt) > MAX_AGE ? undefined : session;
  }
  async load(owner: string, child: string): Promise<StudioAgentPersistedSession | undefined> {
    return this.serial(() => this.read(owner, child));
  }
  async list(owner: string): Promise<StudioSubagentMetadata[]> {
    return this.serial(async () => {
      if (
        !(await this.validDirectory(owner)) ||
        (await isStudioSessionDeleted(this.storageRoot, owner))
      ) {
        return [];
      }
      const results: StudioSubagentMetadata[] = [];
      for (const name of await fs.readdir(this.directory(owner))) {
        const id = childName.exec(name)?.[1];
        if (!id) {
          continue;
        }
        const snapshot = await this.read(owner, id);
        if (!snapshot) {
          continue;
        }
        results.push({
          childSessionId: id,
          requestId: snapshot.parent!.requestId,
          toolCallId: snapshot.parent!.toolCallId,
          kind: snapshot.parent!.kind,
          objective: snapshot.parent!.objective.slice(0, 1_000),
          status: snapshot.status,
          updatedAt: snapshot.updatedAt,
        });
      }
      return results.sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.childSessionId.localeCompare(b.childSessionId)
      );
    });
  }
  async ids(owner: string): Promise<string[]> {
    return this.serial(async () =>
      !(await this.validDirectory(owner))
        ? []
        : (await fs.readdir(this.directory(owner))).flatMap((name) => {
            const id = childName.exec(name)?.[1];
            return id ? [id] : [];
          })
    );
  }
  async save(session: StudioAgentPersistedSession): Promise<void> {
    return this.serial(async () => {
      const parent = session.parent;
      if (
        !parent ||
        !parent.requestId ||
        parent.requestId.length > 200 ||
        !parent.toolCallId ||
        parent.toolCallId.length > 200 ||
        !['research', 'execution'].includes(parent.kind) ||
        typeof parent.objective !== 'string' ||
        parent.objective.length > 8_000
      ) {
        throw new Error('A host-owned parent request is required for subagent storage.');
      }
      await assertStudioSessionRetained(this.storageRoot, parent.sessionId);
      await assertStudioSessionRetained(this.storageRoot, session.id);
      const file = this.file(parent.sessionId, session.id);
      await this.validDirectory(parent.sessionId, true);
      const content = { version: 1 as const, owner: parent.sessionId, session };
      const record = JSON.stringify({ ...content, digest: digest(content) });
      const bytes = Buffer.byteLength(record);
      if (bytes > MAX_RECORD) {
        throw new Error('Child snapshot exceeds its storage budget.');
      }
      await this.reserve(file, bytes);
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, record, { mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, file);
      } finally {
        await fs.remove(temporary).catch(() => undefined);
      }
    });
  }
  private async artifacts(child: string): Promise<void> {
    await markStudioSessionDeleted(this.storageRoot, child);
    await new StudioAttachmentStore(this.storageRoot).delete(child);
    await new StudioHostToolOutputStore(this.storageRoot).delete(child);
    await new StudioRequestHistory(this.storageRoot).delete(child);
  }
  async delete(owner: string): Promise<void> {
    return this.serial(async () => {
      await markStudioSessionDeleted(this.storageRoot, owner);
      if (!(await this.validDirectory(owner))) {
        return;
      }
      for (const name of await fs.readdir(this.directory(owner))) {
        const child = childName.exec(name)?.[1];
        if (child) {
          await this.artifacts(child);
        }
      }
      await fs.remove(this.directory(owner));
    });
  }
  private async reserve(protectedFile: string, bytes: number): Promise<void> {
    const records: Array<{ file: string; size: number; at: number; child: string }> = [];
    for (const owner of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!owner.isDirectory() || !/^[a-f0-9]{64}$/.test(owner.name)) {
        continue;
      }
      for (const name of await fs.readdir(path.join(this.root, owner.name))) {
        const child = childName.exec(name)?.[1];
        const file = path.join(this.root, owner.name, name);
        if (!child || file === protectedFile) {
          continue;
        }
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD) {
          throw new Error('Invalid retained child storage.');
        }
        records.push({ file, size: stat.size, at: stat.mtimeMs, child });
      }
    }
    const owner = path.dirname(protectedFile);
    let total = records.reduce((sum, record) => sum + record.size, bytes);
    let own = records
      .filter((record) => path.dirname(record.file) === owner)
      .reduce((sum, record) => sum + record.size, bytes);
    let count = records.length + 1;
    let ownCount = records.filter((record) => path.dirname(record.file) === owner).length + 1;
    records.sort((a, b) => a.at - b.at || a.file.localeCompare(b.file));
    for (const record of records) {
      const sameOwner = path.dirname(record.file) === owner;
      if (
        total <= MAX_TOTAL &&
        own <= MAX_OWNER &&
        count <= 128 &&
        ownCount <= 24 &&
        Date.now() - record.at <= MAX_AGE
      ) {
        continue;
      }
      if (!sameOwner && total <= MAX_TOTAL && count <= 128 && Date.now() - record.at <= MAX_AGE) {
        continue;
      }
      const saved = (await fs.readJSON(record.file)) as RecordData;
      if (this.isActive(record.child)) {
        continue;
      }
      if (
        saved.session?.id !== record.child ||
        !saved.owner ||
        this.file(saved.owner, record.child) !== record.file
      ) {
        throw new Error('Invalid eviction ownership.');
      }
      await this.artifacts(record.child);
      await fs.remove(record.file);
      await fs.rmdir(path.dirname(record.file)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') {
          throw error;
        }
      });
      total -= record.size;
      count--;
      if (sameOwner) {
        own -= record.size;
        ownCount--;
      }
    }
    if (total > MAX_TOTAL || own > MAX_OWNER || count > 128 || ownCount > 24) {
      throw new Error(
        'Subagent storage is full of active snapshots. Continue directly or release a finished child.'
      );
    }
  }
}
