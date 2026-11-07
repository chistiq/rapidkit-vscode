import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';

export async function deleteStudioIsolatedTaskData(
  storageRoot: string,
  owner: string
): Promise<void> {
  const root = path.join(storageRoot, 'assistant-isolated-tasks');
  const stat = await fs.lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!stat) {
    return;
  }
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (await fs.realpath(root)) !== path.resolve(root)
  ) {
    throw new Error('Isolated task storage was redirected.');
  }
  await fs.remove(path.join(root, crypto.createHash('sha256').update(owner).digest('hex')));
}
