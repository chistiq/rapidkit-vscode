import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';

export const MAX_STUDIO_NATIVE_RECEIPT_BYTES = 64 * 1024 * 1024;
export async function readStudioNativeReceiptJSON(file: string): Promise<unknown> {
  const stat = await fs.lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_STUDIO_NATIVE_RECEIPT_BYTES ||
    (await fs.lstat(path.dirname(file))).isSymbolicLink()
  ) {
    throw new Error('Checkpoint receipt is not a bounded private regular file.');
  }
  return fs.readJSON(file);
}
/** Deleting a chat releases private source originals without changing working files. */
export async function deleteStudioNativeSessionCheckpoints(
  root: string,
  owner: string
): Promise<void> {
  const directory = path.join(root, 'assistant-native-transactions');
  const entries = await fs
    .readdir(directory, { withFileTypes: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
  if (entries.length && (await fs.lstat(directory)).isSymbolicLink()) {
    throw new Error('Invalid checkpoint storage directory.');
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) {
      continue;
    }
    const folder = path.join(directory, entry.name);
    for (const file of await fs.readdir(folder)) {
      if (!/^native-[a-f0-9-]{36}\.json$/.test(file)) {
        continue;
      }
      const target = path.join(folder, file);
      const receipt = (await readStudioNativeReceiptJSON(target)) as { sessionId?: unknown };
      if (receipt.sessionId === owner) {
        await fs.remove(target);
      }
    }
  }
  const ownerHash = crypto.createHash('sha256').update(owner).digest('hex');
  await fs.remove(path.join(directory, 'checkpoints', ownerHash));
}
