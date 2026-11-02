import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { parseAttachedImages, type AIImageContent } from './aiImageContent.js';
import { assertStudioSessionRetained } from './studioSessionDeletion.js';

type Attachment = {
  version: 1;
  owner: string;
  turnId: string;
  text: string;
  images: AIImageContent[];
  digest: string;
};
const MAX_RECORD_BYTES = 12 * 1024 * 1024;
const MAX_OWNER_BYTES = 48 * 1024 * 1024;
const pending = new Map<string, Promise<void>>();
async function serialized(root: string, action: () => Promise<void>): Promise<void> {
  const previous = pending.get(root) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  pending.set(root, next);
  try {
    await next;
  } finally {
    if (pending.get(root) === next) {
      pending.delete(root);
    }
  }
}
/** Private host storage. Webview state contains identities, never attachment image bytes. */
export class StudioAttachmentStore {
  constructor(private readonly storageRoot: string) {}
  private ownerRoot(owner: string): string {
    if (!owner || owner.length > 200) {
      throw new Error('Invalid attachment owner.');
    }
    return path.join(
      this.storageRoot,
      'assistant-attachments',
      crypto.createHash('sha256').update(owner).digest('hex')
    );
  }
  private target(owner: string, turnId: string): string {
    if (!/^turn-[a-z0-9-]{8,100}$/.test(turnId)) {
      throw new Error('Invalid attachment turn identity.');
    }
    return path.join(this.ownerRoot(owner), `${turnId}.json`);
  }
  async save(owner: string, turnId: string, text: string, rawImages: unknown): Promise<void> {
    return serialized(this.storageRoot, () => this.saveRecord(owner, turnId, text, rawImages));
  }
  private async saveRecord(
    owner: string,
    turnId: string,
    text: string,
    rawImages: unknown
  ): Promise<void> {
    await assertStudioSessionRetained(this.storageRoot, owner);
    const images = parseAttachedImages(rawImages);
    if (Buffer.byteLength(text) > 256 * 1024) {
      throw new Error('Attachment text exceeds 256 KiB.');
    }
    const content = { version: 1 as const, owner, turnId, text, images };
    const record = JSON.stringify({
      ...content,
      digest: crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex'),
    });
    if (Buffer.byteLength(record) > MAX_RECORD_BYTES) {
      throw new Error('Attachment record is too large.');
    }
    const target = this.target(owner, turnId);
    const directory = path.dirname(target);
    await fs.ensureDir(directory, { mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink()) {
      throw new Error('Attachment storage must not be a symbolic link.');
    }
    let used = 0;
    for (const name of await fs.readdir(directory)) {
      if (!name.endsWith('.json') || name === path.basename(target)) {
        continue;
      }
      const file = await fs.lstat(path.join(directory, name));
      if (file.isFile() && !file.isSymbolicLink()) {
        used += file.size;
      }
    }
    if (used + Buffer.byteLength(record) > MAX_OWNER_BYTES) {
      throw new Error('This chat attachment quota is full. Delete an unused chat to free storage.');
    }
    let total = 0;
    const base = path.dirname(directory);
    for (const ownerEntry of await fs.readdir(base, { withFileTypes: true })) {
      if (!ownerEntry.isDirectory() || !/^[a-f0-9]{64}$/.test(ownerEntry.name)) {
        continue;
      }
      const ownerDirectory = path.join(base, ownerEntry.name);
      for (const name of await fs.readdir(ownerDirectory)) {
        const filePath = path.join(ownerDirectory, name);
        if (!name.endsWith('.json') || filePath === target) {
          continue;
        }
        const file = await fs.lstat(filePath);
        if (file.isFile() && !file.isSymbolicLink()) {
          total += file.size;
        }
      }
    }
    if (total + Buffer.byteLength(record) > 256 * 1024 * 1024) {
      throw new Error('Attachment storage quota is full. Delete unused chats to free storage.');
    }
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, record, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, target);
    } finally {
      await fs.remove(temporary).catch(() => undefined);
    }
  }
  async read(owner: string, turnId: string): Promise<{ text: string; images: AIImageContent[] }> {
    await assertStudioSessionRetained(this.storageRoot, owner);
    const target = this.target(owner, turnId);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD_BYTES) {
      throw new Error('Attachment storage is unavailable or invalid.');
    }
    const record = (await fs.readJSON(target)) as Attachment;
    const content = {
      version: record.version,
      owner: record.owner,
      turnId: record.turnId,
      text: record.text,
      images: record.images,
    };
    if (
      record.version !== 1 ||
      record.owner !== owner ||
      record.turnId !== turnId ||
      typeof record.text !== 'string' ||
      crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex') !== record.digest
    ) {
      throw new Error('Attachment integrity or ownership check failed.');
    }
    return { text: record.text, images: parseAttachedImages(record.images) };
  }
  async delete(owner: string): Promise<void> {
    await serialized(this.storageRoot, () => fs.remove(this.ownerRoot(owner)));
  }
}
