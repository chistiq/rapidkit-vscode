import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';

const deleted = new Set<string>();
const writes = new Map<string, Promise<unknown>>();
const MAX_RECORD_BYTES = 256 * 1024;
function identity(root: string, owner: string) {
  if (!owner || owner.length > 200) {
    throw new Error('Invalid session owner.');
  }
  const directory = path.join(path.resolve(root), 'assistant-session-deletions');
  const file = path.join(
    directory,
    crypto.createHash('sha256').update(owner).digest('hex') + '.json'
  );
  return { directory, file };
}

/** Small revocation records outlive bounded session indexes and late callbacks. */
export async function studioDeletedSessionChildren(root: string, owner: string): Promise<string[]> {
  const { directory, file } = identity(root, owner);
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return undefined;
    }
    throw error;
  });
  if (!stat) {
    return [];
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_RECORD_BYTES ||
    (await fs.lstat(directory)).isSymbolicLink()
  ) {
    throw new Error('Invalid session deletion record.');
  }
  const record = await fs.readJSON(file);
  if (
    record.version !== 1 ||
    record.owner !== owner ||
    record.deleted !== true ||
    (record.children !== undefined &&
      (!Array.isArray(record.children) ||
        record.children.length > 1024 ||
        record.children.some((id: unknown) => typeof id !== 'string' || !id || id.length > 200)))
  ) {
    throw new Error('Invalid session deletion identity.');
  }
  deleted.add(file);
  return record.children ?? [];
}

export async function isStudioSessionDeleted(root: string, owner: string): Promise<boolean> {
  const { file } = identity(root, owner);
  if (!deleted.has(file)) {
    await studioDeletedSessionChildren(root, owner);
  }
  return deleted.has(file);
}

export async function markStudioSessionDeleted(
  root: string,
  owner: string,
  children: string[] = []
): Promise<void> {
  const { directory, file } = identity(root, owner);
  const previous = writes.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const family = [
        ...new Set([...(await studioDeletedSessionChildren(root, owner)), ...children]),
      ];
      if (
        family.length > 1024 ||
        family.some((id) => typeof id !== 'string' || !id || id.length > 200)
      ) {
        throw new Error('Invalid deletion family.');
      }
      const record = JSON.stringify({
        version: 1,
        owner,
        deleted: true,
        ...(family.length ? { children: family } : {}),
      });
      if (Buffer.byteLength(record) > MAX_RECORD_BYTES) {
        throw new Error('Deletion family exceeds its storage budget.');
      }
      await fs.ensureDir(directory, { mode: 0o700 });
      if ((await fs.lstat(directory)).isSymbolicLink()) {
        throw new Error('Invalid session deletion directory.');
      }
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, record, { mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, file);
        deleted.add(file);
      } finally {
        await fs.remove(temporary).catch(() => undefined);
      }
    });
  writes.set(file, next);
  try {
    await next;
  } finally {
    if (writes.get(file) === next) {
      writes.delete(file);
    }
  }
}

export async function assertStudioSessionRetained(root: string, owner: string): Promise<void> {
  if (await isStudioSessionDeleted(root, owner)) {
    throw new Error('This chat was deleted; late data was not retained.');
  }
}
