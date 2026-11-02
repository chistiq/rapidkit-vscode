import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { WorkspaceRepairCliFileChange } from './workspaceRepairCliClient.js';

let storageRoot: string | undefined;
export function configureStudioScaffoldStorage(root: string): void {
  storageRoot = path.join(root, 'assistant-scaffold-receipts');
}
const excluded = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.workspai',
  '.rapidkit',
  '.turbo',
]);
type ScaffoldFile = { relativePath: string; hash: string; addedLines?: number; binary?: boolean };
type ScaffoldReceipt = {
  id: string;
  workspacePath: string;
  sessionId: string;
  requestId: string;
  files: ScaffoldFile[];
  excludedEntries: number;
  truncated: boolean;
};
function receiptPath(root: string, id: string): string {
  if (!storageRoot || !/^scaffold-[a-f0-9-]{36}$/.test(id)) {
    throw new Error('Scaffold receipt storage is unavailable.');
  }
  return path.join(
    storageRoot,
    crypto.createHash('sha256').update(path.resolve(root)).digest('hex'),
    `${id}.json`
  );
}
const digest = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
async function sourceFile(root: string, relative: string): Promise<Buffer> {
  const absolute = path.resolve(root, relative);
  const boundary = path.relative(root, absolute);
  if (!boundary || boundary.startsWith('..') || path.isAbsolute(boundary)) {
    throw new Error('Invalid scaffold file boundary.');
  }
  let cursor = root;
  for (const part of boundary.split(path.sep)) {
    cursor = path.join(cursor, part);
    if ((await fs.lstat(cursor)).isSymbolicLink()) {
      throw new Error('Scaffold file crosses a symbolic link.');
    }
  }
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
    throw new Error('Scaffold comparison requires a bounded regular file.');
  }
  return fs.readFile(absolute);
}

/** Only call for an approved destination proved absent before scaffold execution. No model reads. */
export async function captureStudioScaffoldChanges(input: {
  workspacePath: string;
  sessionId: string;
  requestId: string;
}): Promise<Record<string, unknown>> {
  const root = path.resolve(input.workspacePath);
  const files: ScaffoldFile[] = [];
  let excludedEntries = 0;
  let bytesRead = 0;
  let visited = 0;
  let truncated = false;
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++visited > 5000 || bytesRead >= 32 * 1024 * 1024 || files.length >= 2000) {
        truncated = true;
        return;
      }
      const absolute = path.join(directory, entry.name);
      if (excluded.has(entry.name) || /^\.env(?:\.|$)/.test(entry.name) || entry.isSymbolicLink()) {
        excludedEntries++;
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) {
        excludedEntries++;
        continue;
      }
      const stat = await fs.lstat(absolute);
      if (stat.size > 2 * 1024 * 1024 || bytesRead + stat.size > 32 * 1024 * 1024) {
        excludedEntries++;
        truncated = true;
        continue;
      }
      const relativePath = path.relative(root, absolute).replace(/\\/g, '/');
      const bytes = await sourceFile(root, relativePath);
      bytesRead += bytes.length;
      const text = bytes.toString('utf8');
      const binary = bytes.includes(0) || !Buffer.from(text).equals(bytes);
      files.push({
        relativePath,
        hash: digest(bytes),
        ...(binary
          ? { binary: true }
          : { addedLines: text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0 }),
      });
    }
  };
  await walk(root);
  const receipt: ScaffoldReceipt = {
    id: `scaffold-${crypto.randomUUID()}`,
    ...input,
    workspacePath: root,
    files,
    excludedEntries,
    truncated,
  };
  if (storageRoot) {
    const target = receiptPath(root, receipt.id);
    await fs.ensureDir(path.dirname(target), { mode: 0o700 });
    await fs.writeJSON(target, receipt, { mode: 0o600, flag: 'wx' });
    // Metadata only; keep a bounded number of old observations across workspaces.
    const receipts: Array<{ file: string; modified: number; size: number }> = [];
    for (const directory of await fs.readdir(storageRoot, { withFileTypes: true })) {
      if (!directory.isDirectory() || !/^[a-f0-9]{64}$/.test(directory.name)) {
        continue;
      }
      for (const entry of await fs.readdir(path.join(storageRoot, directory.name), {
        withFileTypes: true,
      })) {
        if (!entry.isFile() || !/^scaffold-[a-f0-9-]{36}\.json$/.test(entry.name)) {
          continue;
        }
        const file = path.join(storageRoot, directory.name, entry.name);
        const stat = await fs.stat(file);
        receipts.push({ file, modified: stat.mtimeMs, size: stat.size });
      }
    }
    receipts.sort((left, right) => right.modified - left.modified);
    let retainedBytes = 0;
    for (const [index, entry] of receipts.entries()) {
      retainedBytes += entry.size;
      if (entry.file !== target && (index >= 256 || retainedBytes > 64 * 1024 * 1024)) {
        await fs.remove(entry.file);
      }
    }
  }
  return {
    transactionId: receipt.id,
    transaction: {
      transactionId: receipt.id,
      state: 'observed',
      schemaVersion: 'workspai.scaffold-observation.v1',
    },
    changedPaths: files.map((file) => file.relativePath),
    fileChanges: fileChanges(receipt),
    scaffoldSummary: {
      fileCount: files.length,
      addedLines: files.reduce((sum, file) => sum + (file.addedLines ?? 0), 0),
      binaryFiles: files.filter((file) => file.binary).length,
      excludedEntries,
      truncated,
      scope:
        'Source files; dependency, build, cache, workspace metadata and environment files excluded.',
      reversible: false,
    },
  };
}
function fileChanges(receipt: ScaffoldReceipt): WorkspaceRepairCliFileChange[] {
  return receipt.files.map((file) => ({
    relativePath: file.relativePath,
    status: 'added',
    isNewFile: true,
    beforeHash: null,
    afterHash: file.hash,
    binary: file.binary === true,
    stale: false,
    ...(file.addedLines !== undefined ? { addedLines: file.addedLines, removedLines: 0 } : {}),
    diffLines: [],
  }));
}
export async function readStudioScaffoldFileChanges(
  root: string,
  id: string
): Promise<WorkspaceRepairCliFileChange[]> {
  const receipt = await readReceipt(root, id);
  const changes = fileChanges(receipt);
  for (const [index, file] of receipt.files.entries()) {
    const bytes = await sourceFile(path.resolve(root), file.relativePath).catch(() => undefined);
    if (!bytes || digest(bytes) !== file.hash) {
      changes[index].stale = true;
      changes[index].failReason =
        'This generated file changed after scaffolding. Open the current file instead.';
    }
  }
  return changes;
}
async function readReceipt(root: string, id: string): Promise<ScaffoldReceipt> {
  const receipt = (await fs.readJSON(receiptPath(root, id))) as ScaffoldReceipt;
  if (receipt.id !== id || receipt.workspacePath !== path.resolve(root)) {
    throw new Error('Scaffold receipt scope mismatch.');
  }
  return receipt;
}
export async function readStudioScaffoldComparison(
  root: string,
  id: string,
  relative: string
): Promise<{ before: string; after: string; absolutePath: string }> {
  const receipt = await readReceipt(root, id);
  const file = receipt.files.find((entry) => entry.relativePath === relative);
  if (!file || file.binary) {
    throw new Error('No text scaffold comparison exists for this file.');
  }
  const bytes = await sourceFile(path.resolve(root), relative);
  if (digest(bytes) !== file.hash) {
    throw new Error(
      'This generated file changed after scaffolding. Open the current file instead.'
    );
  }
  return { before: '', after: bytes.toString('utf8'), absolutePath: path.resolve(root, relative) };
}
