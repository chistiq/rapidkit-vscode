import { summarizeStudioTextChange } from './studioTextChangeSummary.js';
import { configureStudioScaffoldStorage } from './studioScaffoldChanges.js';
import { requireStudioWorkspaceDirectory } from './studioWorkspaceAvailability.js';
import { resolveStudioWorkspaceCommandPlan } from './studioWorkspaceCommand.js';
import { createTwoFilesPatch } from 'diff';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { normalizePatchesForWorkspaceScope } from './studioWorkspacePatchScope.js';
import {
  authorizeStudioWorkspacePatchTargets,
  compileInspectedStudioDeletePatches,
  compileInspectedStudioTextEdits,
} from './studioWorkspaceFileTransactions.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import { assertStudioSessionRetained } from './studioSessionDeletion.js';
import {
  MAX_STUDIO_NATIVE_RECEIPT_BYTES,
  readStudioNativeReceiptJSON,
} from './studioNativeCheckpointLifecycle.js';
import type {
  StudioWorkspaceSourceTransaction,
  StudioWorkspaceSourceSnapshot,
} from './studioWorkspaceSourceSnapshot.js';
import type { StudioAgentWorkspaiToolHost } from './studioAgentWorkspaiTools.js';
import { executeStudioWorkspaceCommandTransaction } from './studioWorkspaceCommandTransaction.js';
import {
  readStudioWorkingBytes,
  studioOpenDocument,
  replaceStudioDocuments,
  saveStudioDocument,
} from './studioNativeDocuments.js';

let storagePath: string | undefined;
export function configureStudioNativeStorage(root: string): void {
  storagePath = path.join(root, 'assistant-native-transactions');
  configureStudioScaffoldStorage(root);
}
export type StudioNativeTransaction = {
  schemaVersion: 'workspai.native-source-transaction.v1';
  transactionId: string;
  sessionId?: string;
  requestId?: string;
  review?: 'kept' | 'restored' | 'reapplied';
  workspacePath: string;
  workspaceIdentity?: { realPath: string; dev: number; ino: number };
  state: 'prepared' | 'applied' | 'rolled-back' | 'failed';
  files: Array<{
    relativePath: string;
    before: string | null;
    after: string | null;
    beforeMode?: number;
    afterMode?: number;
    /** Working text is before/after; disk is independently checkpointed for dirty buffers. */
    editor?: { beforeDisk: string | null; afterDisk: string | null };
    encoding?: 'base64';
    checkpointOnly?: boolean;
  }>;
};
const tails = new Map<string, Promise<unknown>>();
function serial<T>(root: string, run: () => Promise<T>): Promise<T> {
  const previous = tails.get(root) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(run);
  tails.set(root, task);
  return task.finally(() => {
    if (tails.get(root) === task) {
      tails.delete(root);
    }
  });
}
function serialRoots<T>(roots: string[], run: () => Promise<T>): Promise<T> {
  const ordered = [...new Set(roots.map((root) => path.resolve(root)))].sort();
  const enter = (index: number): Promise<T> =>
    index === ordered.length ? run() : serial(ordered[index], () => enter(index + 1));
  return enter(0);
}
async function serialSource<T>(root: string, run: () => Promise<T>): Promise<T> {
  return serial(await fs.realpath(root), run);
}
function receiptPath(root: string, id: string): string {
  if (!storagePath || !/^native-[a-f0-9-]{36}$/.test(id)) {
    throw new Error('Native transaction storage or identity is unavailable.');
  }
  return path.join(
    storagePath,
    crypto.createHash('sha256').update(path.resolve(root)).digest('hex'),
    `${id}.json`
  );
}
function checkpointIndexPath(owner: string, requestId: string): string {
  if (!storagePath) {
    throw new Error('Checkpoint storage is unavailable.');
  }
  const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
  return path.join(storagePath, 'checkpoints', hash(owner), `${hash(requestId)}.json`);
}
async function checkpointIds(file: string): Promise<string[]> {
  const value: unknown = await fs.readJSON(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error('Checkpoint index is unreadable; no partial request restore is allowed.');
  });
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'string' || !/^native-[a-f0-9-]{36}$/.test(id))
  ) {
    throw new Error('Checkpoint index is invalid; no partial request restore is allowed.');
  }
  return value;
}
async function persistReceipt(receipt: StudioNativeTransaction): Promise<void> {
  if (receipt.sessionId && storagePath) {
    await assertStudioSessionRetained(path.dirname(storagePath), receipt.sessionId);
  }
  if (!receipt.workspaceIdentity) {
    const realPath = await fs.realpath(receipt.workspacePath);
    const stat = await fs.stat(realPath);
    receipt.workspaceIdentity = { realPath, dev: stat.dev, ino: stat.ino };
  }
  const target = receiptPath(receipt.workspacePath, receipt.transactionId);
  await fs.ensureDir(path.dirname(target), { mode: 0o700 });
  if ((await fs.lstat(path.dirname(target))).isSymbolicLink()) {
    throw new Error('Invalid checkpoint receipt directory.');
  }
  const serialized = JSON.stringify(receipt);
  if (Buffer.byteLength(serialized) > MAX_STUDIO_NATIVE_RECEIPT_BYTES) {
    throw new Error('Checkpoint receipt exceeds its bounded private storage budget.');
  }
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
    if (receipt.sessionId && receipt.requestId) {
      const index = checkpointIndexPath(receipt.sessionId, receipt.requestId);
      await serial(index, async () => {
        const existing = await checkpointIds(index);
        const ids = [
          ...new Set([
            ...(Array.isArray(existing)
              ? existing.filter((id): id is string => typeof id === 'string')
              : []),
            receipt.transactionId,
          ]),
        ];
        await fs.ensureDir(path.dirname(index), { mode: 0o700 });
        const pendingIndex = `${index}.${crypto.randomUUID()}.tmp`;
        try {
          await fs.writeJSON(pendingIndex, ids, { mode: 0o600 });
          await fs.rename(pendingIndex, index);
        } finally {
          await fs.remove(pendingIndex).catch(() => undefined);
        }
      });
    }
  } finally {
    await fs.remove(temporary).catch(() => undefined);
  }
}
export async function readStudioNativeTransaction(
  workspacePath: string,
  transactionId: string
): Promise<StudioNativeTransaction> {
  const receipt = (await readStudioNativeReceiptJSON(
    receiptPath(workspacePath, transactionId)
  )) as StudioNativeTransaction;
  if (receipt.sessionId && storagePath) {
    await assertStudioSessionRetained(path.dirname(storagePath), receipt.sessionId);
  }
  if (
    receipt.schemaVersion !== 'workspai.native-source-transaction.v1' ||
    path.resolve(receipt.workspacePath) !== path.resolve(workspacePath) ||
    receipt.transactionId !== transactionId ||
    !Array.isArray(receipt.files) ||
    receipt.files.some(
      (file) =>
        typeof file.relativePath !== 'string' ||
        (file.before !== null && typeof file.before !== 'string') ||
        (file.after !== null && typeof file.after !== 'string') ||
        (file.encoding !== undefined && file.encoding !== 'base64')
    )
  ) {
    throw new Error('Native source transaction scope mismatch.');
  }
  if (receipt.workspaceIdentity) {
    const realPath = await fs.realpath(workspacePath);
    const stat = await fs.stat(realPath);
    if (
      realPath !== receipt.workspaceIdentity.realPath ||
      stat.dev !== receipt.workspaceIdentity.dev ||
      stat.ino !== receipt.workspaceIdentity.ino
    ) {
      throw new Error(
        'The checkpoint workspace directory was replaced or redirected. No files were changed.'
      );
    }
  }
  return receipt;
}
async function safeTarget(root: string, relative: string, checkpointOnly = false): Promise<string> {
  const target = path.resolve(root, relative);
  const boundary = path.relative(path.resolve(root), target);
  if (
    !boundary ||
    boundary.startsWith('..') ||
    path.isAbsolute(boundary) ||
    (studioSourcePathDenialReason(boundary) &&
      !(
        checkpointOnly &&
        /(?:^|[\\/])(?:\.env(?:\.|$)|\.npmrc$|\.pypirc$|[^\\/]*(?:secret|credential)[^\\/]*)(?:[\\/]|$)/i.test(
          boundary
        )
      ))
  ) {
    throw new Error(`Source target is outside the editable scope: ${relative}`);
  }
  let cursor = root;
  for (const part of boundary.split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (stat?.isSymbolicLink()) {
      throw new Error(`Source target crosses a symbolic link: ${relative}`);
    }
  }
  return target;
}
async function currentContent(file: string, encoding?: 'base64'): Promise<string | null> {
  try {
    const bytes = encoding ? await fs.readFile(file) : await readStudioWorkingBytes(file);
    if (bytes.length > 16 * 1024 * 1024) {
      throw new Error('Checkpoint file exceeds its 16 MiB byte budget.');
    }
    if (encoding) {
      return bytes.toString('base64');
    }
    const text = bytes.toString('utf8');
    if (bytes.length > 16 * 1024 * 1024 || bytes.includes(0) || !Buffer.from(text).equals(bytes)) {
      throw new Error(
        'Native source edits require a bounded UTF-8 text file. Use an appropriate host tool for binary or differently encoded files.'
      );
    }
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
async function diskContent(file: string, encoding?: 'base64'): Promise<string | null> {
  const bytes = await fs.readFile(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (bytes === null) {
    return null;
  }
  if (encoding) {
    return bytes.toString('base64');
  }
  const text = bytes.toString('utf8');
  if (bytes.length > 16 * 1024 * 1024 || bytes.includes(0) || !Buffer.from(text).equals(bytes)) {
    throw new Error('Editor checkpoint disk content must be bounded UTF-8 text.');
  }
  return text;
}
function reversedFile<T extends StudioNativeTransaction['files'][number]>(file: T): T {
  return {
    ...file,
    before: file.after,
    after: file.before,
    beforeMode: file.afterMode,
    afterMode: file.beforeMode,
    ...(file.editor
      ? { editor: { beforeDisk: file.editor.afterDisk, afterDisk: file.editor.beforeDisk } }
      : {}),
  };
}
function summarizeFile(
  file: StudioNativeTransaction['files'][number] & { stale?: boolean },
  root: string
) {
  if (file.checkpointOnly) {
    return {
      relativePath: file.relativePath,
      status:
        file.before === null
          ? ('added' as const)
          : file.after === null
            ? ('deleted' as const)
            : ('modified' as const),
      beforeHash: null,
      afterHash: null,
      binary: false,
      stale: file.stale === true,
      diffLines: [],
      failReason:
        'Sensitive file content is omitted from model previews. Its original bytes remain in the request checkpoint.',
      workspaceId: crypto.createHash('sha256').update(path.resolve(root)).digest('hex'),
      workspaceName: path.basename(root),
    };
  }
  const raw = (value: string | null) =>
    value === null ? null : Buffer.from(value, file.encoding ?? 'utf8');
  const before = raw(file.before),
    after = raw(file.after);
  const binary = [before, after].some(
    (bytes) =>
      bytes !== null && (bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes))
  );
  const hash = (bytes: Buffer | null) =>
    bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    ...(binary
      ? {
          relativePath: file.relativePath,
          status:
            file.before === null
              ? ('added' as const)
              : file.after === null
                ? ('deleted' as const)
                : ('modified' as const),
          binary: true,
          byteComparison: true,
          stale: file.stale === true,
          beforeHash: hash(before),
          afterHash: hash(after),
          beforeBytes: before?.length ?? 0,
          afterBytes: after?.length ?? 0,
          diffLines: [],
        }
      : summarizeStudioTextChange({
          ...file,
          before: before?.toString('utf8') ?? null,
          after: after?.toString('utf8') ?? null,
        })),
    workspaceId: crypto.createHash('sha256').update(path.resolve(root)).digest('hex'),
    workspaceName: path.basename(root),
  };
}
async function transactionInRoot(root: string, id: string) {
  try {
    return await readStudioNativeTransaction(root, id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
async function write(file: string, content: string | null, encoding?: 'base64'): Promise<void> {
  if (content === null) {
    await fs.remove(file);
  } else {
    await fs.ensureDir(path.dirname(file));
    const temporary = path.join(path.dirname(file), `.workspai-write-${crypto.randomUUID()}.tmp`);
    try {
      const mode = (await fs.stat(file).catch(() => undefined))?.mode ?? 0o644;
      await fs.writeFile(temporary, Buffer.from(content, encoding ?? 'utf8'), { mode, flag: 'wx' });
      await fs.rename(temporary, file);
    } finally {
      await fs.remove(temporary).catch(() => undefined);
    }
  }
}
async function applyExact(root: string, files: StudioNativeTransaction['files']): Promise<void> {
  const buffers: Parameters<typeof replaceStudioDocuments>[0] = [];
  for (const file of files) {
    const target = await safeTarget(root, file.relativePath, file.checkpointOnly);
    if ((await currentContent(target, file.encoding)) !== file.before) {
      throw new Error(`Source changed since inspection: ${file.relativePath}`);
    }
    if (file.editor) {
      const document = studioOpenDocument(target);
      if (
        !document ||
        file.before === null ||
        file.after === null ||
        document.text !== file.before ||
        (await diskContent(target)) !== file.editor.beforeDisk
      ) {
        throw new Error(
          `Editor checkpoint is stale: ${file.relativePath}. Preserve the current buffer and inspect again.`
        );
      }
      buffers.push({
        path: target,
        before: file.before,
        after: file.after,
        version: document.version,
      });
    } else if (studioOpenDocument(target)?.dirty) {
      throw new Error(
        `An unsaved buffer now owns ${file.relativePath}; inspect its working content again.`
      );
    }
  }
  const written: StudioNativeTransaction['files'] = [];
  try {
    for (const file of files) {
      const target = await safeTarget(root, file.relativePath, file.checkpointOnly);
      if ((await currentContent(target, file.encoding)) !== file.before) {
        throw new Error(`Source changed during the transaction: ${file.relativePath}`);
      }
      written.push(file);
      if (!file.editor || file.editor.beforeDisk !== file.editor.afterDisk) {
        await write(target, file.editor ? file.editor.afterDisk : file.after, file.encoding);
      }
      if (file.after !== null && file.afterMode !== undefined) {
        await fs.chmod(target, file.afterMode);
      }
    }
    await replaceStudioDocuments(buffers);
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const file of written.reverse()) {
      try {
        const target = await safeTarget(root, file.relativePath, file.checkpointOnly);
        const expected = file.editor ? file.editor.afterDisk : file.after;
        const original = file.editor ? file.editor.beforeDisk : file.before;
        const current = await diskContent(target, file.encoding);
        if (current !== expected && current !== original) {
          throw new Error('The user changed this file during rollback.');
        }
        if (current !== original) {
          await write(target, original, file.encoding);
        }
        if (file.before !== null && file.beforeMode !== undefined) {
          await fs.chmod(target, file.beforeMode);
        }
      } catch {
        rollbackErrors.push(file.relativePath);
      }
    }
    if (rollbackErrors.length) {
      throw new Error(
        `Source apply failed and rollback needs review: ${rollbackErrors.join(', ')}. ${String(error)}`
      );
    }
    throw error;
  }
}
export async function rollbackStudioNativeTransaction(root: string, id: string) {
  return serialSource(root, async () => {
    const receipt = await readStudioNativeTransaction(root, id);
    if (receipt.state === 'rolled-back') {
      return receipt;
    }
    if (receipt.state !== 'applied') {
      throw new Error(
        'This source transaction was not fully applied; inspect its files before recovery.'
      );
    }
    await applyExact(root, receipt.files.map(reversedFile));
    receipt.state = 'rolled-back';
    await persistReceipt(receipt);
    return receipt;
  });
}
export async function readStudioNativeComparison(root: string, id: string, relativePath: string) {
  const receipt = await readStudioNativeTransaction(root, id);
  const file = receipt.files.find((entry) => entry.relativePath === relativePath);
  if (!file) {
    throw new Error('File is not part of this native transaction.');
  }
  const absolutePath = await safeTarget(root, relativePath);
  if (file.checkpointOnly) {
    throw new Error('Sensitive checkpoint contents are unavailable to generic comparison tools.');
  }
  const expected = receipt.state === 'rolled-back' ? file.before : file.after;
  if ((await currentContent(absolutePath, file.encoding)) !== expected) {
    throw new Error(
      'The file changed after this native transaction; an exact comparison is stale.'
    );
  }
  return { ...file, absolutePath, state: receipt.state, binary: summarizeFile(file, root).binary };
}

async function ownedReceipt(owner: string, id: string): Promise<StudioNativeTransaction> {
  if (!storagePath || !/^native-[a-f0-9-]{36}$/.test(id)) {
    throw new Error('Invalid checkpoint identity.');
  }
  for (const directory of await fs.readdir(storagePath, { withFileTypes: true })) {
    if (!directory.isDirectory() || !/^[a-f0-9]{64}$/.test(directory.name)) {
      continue;
    }
    const file = path.join(storagePath, directory.name, `${id}.json`);
    if (!(await fs.pathExists(file))) {
      continue;
    }
    const receipt = (await readStudioNativeReceiptJSON(file)) as StudioNativeTransaction;
    if (receipt.sessionId !== owner || file !== receiptPath(receipt.workspacePath, id)) {
      throw new Error('Checkpoint owner or scope mismatch.');
    }
    return readStudioNativeTransaction(receipt.workspacePath, id);
  }
  throw new Error('The checkpoint is unavailable.');
}

export async function resolveStudioNativeTransactionWorkspace(
  owner: string,
  id: string,
  requestId?: string
): Promise<string> {
  const receipt = await ownedReceipt(owner, id);
  if (requestId && receipt.requestId !== requestId) {
    throw new Error('Checkpoint request does not own this file.');
  }
  return receipt.workspacePath;
}

/** Restore a request as one net change, checking every current file before writing any. */
export async function reviewStudioNativeCheckpoint(input: {
  sessionId: string;
  requestIds: string[];
  transactionIds: string[];
  action: 'keep' | 'restore' | 'redo';
  workspaceTrusted: boolean;
}) {
  if (input.action !== 'keep' && input.workspaceTrusted !== true) {
    throw new Error('Trust the workspace before changing checkpoint files.');
  }
  const indexed: string[] = [];
  if (input.requestIds.length > 20) {
    throw new Error('Select one bounded checkpoint group.');
  }
  for (const requestId of input.requestIds) {
    const stored = await checkpointIds(checkpointIndexPath(input.sessionId, requestId));
    if (Array.isArray(stored)) {
      indexed.push(...stored.filter((id): id is string => typeof id === 'string'));
    }
  }
  const ids = [...new Set(indexed.length ? indexed : input.transactionIds)];
  if (!ids.length || ids.length > 100 || !input.requestIds.length) {
    throw new Error('Select a bounded request checkpoint.');
  }
  const initial = await Promise.all(ids.map((id) => ownedReceipt(input.sessionId, id)));
  const canonical = new Map(
    await Promise.all(
      initial.map(
        async (receipt) =>
          [receipt.workspacePath, await fs.realpath(receipt.workspacePath)] as const
      )
    )
  );
  const roots = [...new Set(canonical.values())];
  return serialRoots(roots, async () => {
    const receipts = await Promise.all(ids.map((id) => ownedReceipt(input.sessionId, id)));
    if (
      receipts.some(
        (receipt) =>
          !canonical.has(receipt.workspacePath) ||
          !receipt.requestId ||
          !input.requestIds.includes(receipt.requestId) ||
          receipt.state !== (input.action === 'redo' ? 'rolled-back' : 'applied')
      )
    ) {
      throw new Error(
        input.action === 'redo'
          ? 'Checkpoint is not a fully restored request in this workspace.'
          : 'Checkpoint is not an applied request in this workspace.'
      );
    }
    const net = new Map<
      string,
      StudioNativeTransaction['files'][number] & { workspacePath: string; transactionId: string }
    >();
    for (const receipt of receipts) {
      for (const savedFile of receipt.files) {
        let file = savedFile;
        const key = path.resolve(canonical.get(receipt.workspacePath)!, file.relativePath);
        let previous = net.get(key);
        if (previous && previous.encoding !== file.encoding) {
          if (previous.editor || file.editor) {
            throw new Error('A binary checkpoint cannot replace an owned editor buffer.');
          }
          const encode = <T extends StudioNativeTransaction['files'][number]>(entry: T): T => ({
            ...entry,
            encoding: 'base64',
            before:
              entry.before === null
                ? null
                : Buffer.from(entry.before, entry.encoding ?? 'utf8').toString('base64'),
            after:
              entry.after === null
                ? null
                : Buffer.from(entry.after, entry.encoding ?? 'utf8').toString('base64'),
          });
          previous = encode(previous);
          file = encode(file);
        }
        if (previous && previous.after !== file.before) {
          throw new Error('Checkpoint history is not contiguous. Inspect the intervening changes.');
        }
        if (
          previous &&
          (previous.editor?.afterDisk ?? previous.after) !==
            (file.editor?.beforeDisk ?? file.before)
        ) {
          throw new Error('Checkpoint disk history is not contiguous. Inspect saved user changes.');
        }
        net.set(
          key,
          previous
            ? {
                ...file,
                before: previous.before,
                beforeMode: previous.beforeMode,
                ...(previous.editor || file.editor
                  ? {
                      editor: {
                        beforeDisk: previous.editor?.beforeDisk ?? previous.before,
                        afterDisk: file.editor?.afterDisk ?? file.after,
                      },
                    }
                  : {}),
                workspacePath: canonical.get(receipt.workspacePath)!,
                transactionId: receipt.transactionId,
              }
            : {
                ...file,
                workspacePath: canonical.get(receipt.workspacePath)!,
                transactionId: receipt.transactionId,
              }
        );
      }
    }
    for (const file of net.values()) {
      const target = await safeTarget(file.workspacePath, file.relativePath, file.checkpointOnly);
      const expected = input.action === 'redo' ? file.before : file.after;
      const expectedMode = input.action === 'redo' ? file.beforeMode : file.afterMode;
      const mode =
        expected !== null && expectedMode !== undefined
          ? (await fs.stat(target).catch(() => undefined))?.mode
          : undefined;
      if (
        (await currentContent(target, file.encoding)) !== expected ||
        (expectedMode !== undefined &&
          expected !== null &&
          (mode === undefined || (mode & 0o7777) !== (expectedMode & 0o7777)))
      ) {
        throw new Error(
          `Checkpoint is stale: ${file.relativePath} changed after this request. No files were changed.`
        );
      }
      if (
        file.editor &&
        (await diskContent(target)) !==
          (input.action === 'redo' ? file.editor.beforeDisk : file.editor.afterDisk)
      ) {
        throw new Error(
          `Checkpoint is stale: saved disk content changed for ${file.relativePath}. No files were changed.`
        );
      }
      const document = studioOpenDocument(target);
      if (
        (file.editor && (!document || document.text !== expected)) ||
        (!file.editor && document?.dirty)
      ) {
        throw new Error(`Editor checkpoint is stale: ${file.relativePath}. No files were changed.`);
      }
    }
    const restore = [...net.values()].map(reversedFile);
    const applied: string[] = [];
    const applyRoots = async (files: typeof restore) => {
      for (const root of [...roots].sort()) {
        await applyExact(
          root,
          files.filter((file) => path.resolve(file.workspacePath) === root)
        );
        applied.push(root);
      }
    };
    try {
      if (input.action === 'restore') {
        await applyRoots(restore);
      }
      if (input.action === 'redo') {
        await applyRoots([...net.values()]);
      }
      for (const receipt of receipts) {
        await persistReceipt({
          ...receipt,
          state: input.action === 'restore' ? 'rolled-back' : 'applied',
          review:
            input.action === 'restore'
              ? 'restored'
              : input.action === 'redo'
                ? 'reapplied'
                : 'kept',
        });
      }
    } catch (error) {
      const failures: string[] = [];
      for (const root of applied.reverse()) {
        try {
          if (input.action === 'restore') {
            await applyExact(
              root,
              [...net.values()].filter((file) => path.resolve(file.workspacePath) === root)
            );
          }
          if (input.action === 'redo') {
            await applyExact(
              root,
              restore.filter((file) => path.resolve(file.workspacePath) === root)
            );
          }
        } catch {
          failures.push(path.basename(root));
        }
      }
      if (!failures.length) {
        for (const receipt of receipts) {
          await persistReceipt(receipt);
        }
      }
      if (failures.length) {
        throw new Error(
          `Checkpoint rollback needs review in ${failures.join(', ')}. ${String(error)}`
        );
      }
      throw error;
    }
    return {
      state:
        input.action === 'restore'
          ? ('restored' as const)
          : input.action === 'redo'
            ? ('reapplied' as const)
            : ('kept' as const),
      transactionIds: ids,
      workspaceCount: roots.length,
      files: [...net.values()].map((file) => ({
        ...summarizeFile(file, file.workspacePath),
        transactionId: file.transactionId,
        workspacePath: file.workspacePath,
      })),
    };
  });
}

export async function readStudioNativeFileChanges(root: string, id: string) {
  const receipt = await readStudioNativeTransaction(root, id);
  return Promise.all(
    receipt.files.map(async (file) => {
      const current = await currentContent(
        await safeTarget(root, file.relativePath, file.checkpointOnly),
        file.encoding
      );
      const expected = receipt.state === 'rolled-back' ? file.before : file.after;
      return summarizeFile({ ...file, stale: current !== expected }, root);
    })
  );
}

/** Host bytes stay out of model arguments and activity logs. */
export async function writeStudioNativeAsset(input: {
  workspacePath: string;
  sessionId: string;
  requestId: string;
  relativePath: string;
  expectedHash: string | null;
  bytes: Buffer;
}) {
  return serialSource(input.workspacePath, async () => {
    if (input.bytes.length > 16 * 1024 * 1024) {
      throw new Error('Asset exceeds its 16 MiB file budget.');
    }
    const target = await safeTarget(input.workspacePath, input.relativePath);
    if (path.extname(target).toLowerCase() === '.json') {
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.bytes));
    }
    if (studioOpenDocument(target)?.dirty) {
      throw new Error(
        'An unsaved editor document owns this target. Preserve its contents before replacing it with an asset.'
      );
    }
    const before = await currentContent(target, 'base64');
    const hash =
      before === null
        ? null
        : crypto.createHash('sha256').update(Buffer.from(before, 'base64')).digest('hex');
    if (hash !== input.expectedHash) {
      throw new Error(
        'Asset target changed since inspection. Read its metadata before replacing it.'
      );
    }
    for (const id of await checkpointIds(checkpointIndexPath(input.sessionId, input.requestId))) {
      const prior = await transactionInRoot(input.workspacePath, id);
      if (prior?.files.some((file) => file.relativePath === input.relativePath && file.editor)) {
        throw new Error(
          'This request owns an editor checkpoint for the same target; keep the asset at a separate path to preserve that buffer.'
        );
      }
    }
    const mode = (await fs.stat(target).catch(() => undefined))?.mode;
    const file: StudioNativeTransaction['files'][number] = {
      relativePath: input.relativePath,
      encoding: 'base64',
      before,
      after: input.bytes.toString('base64'),
      beforeMode: mode,
      afterMode: mode,
    };
    const receipt: StudioNativeTransaction = {
      schemaVersion: 'workspai.native-source-transaction.v1',
      transactionId: `native-${crypto.randomUUID()}`,
      sessionId: input.sessionId,
      requestId: input.requestId,
      workspacePath: path.resolve(input.workspacePath),
      state: 'prepared',
      files: [file],
    };
    await persistReceipt(receipt);
    try {
      await applyExact(input.workspacePath, [file]);
      receipt.state = 'applied';
      try {
        await persistReceipt(receipt);
      } catch (error) {
        await applyExact(input.workspacePath, [reversedFile(file)]);
        throw error;
      }
    } catch (error) {
      receipt.state = 'failed';
      await persistReceipt(receipt).catch(() => undefined);
      throw error;
    }
    return {
      ok: true,
      changed: file.before !== file.after,
      output: {
        transactionId: receipt.transactionId,
        transaction: {
          schemaVersion: receipt.schemaVersion,
          transactionId: receipt.transactionId,
          state: receipt.state,
        },
        changedPaths: [file.relativePath],
        fileChanges: [summarizeFile(file, input.workspacePath)],
        instruction:
          'Asset bytes were copied and checkpointed, not semantically verified. Inspect the asset and run applicable checks before accepting the request.',
      },
    };
  });
}

export function createStudioNativeWorkspaceCapabilities(input: {
  workspacePath: string;
  projectPath?: string;
  transactionIds?: readonly string[];
  inspectedSource: Map<string, string | null>;
  diagnostics: StudioAgentWorkspaiToolHost['diagnostics'];
  inspectChanges: StudioAgentWorkspaiToolHost['inspectChanges'];
  hasRunningTerminal?: () => boolean;
}): Pick<
  StudioAgentWorkspaiToolHost,
  | 'applyPatches'
  | 'applyTextEdits'
  | 'saveFiles'
  | 'rememberNativeTransaction'
  | 'deleteFiles'
  | 'runWorkspaceCommand'
  | 'preflightWorkspaceCommand'
  | 'verify'
  | 'inspectChanges'
> {
  const externalProject =
    input.projectPath &&
    path.relative(path.resolve(input.workspacePath), path.resolve(input.projectPath));
  if (
    input.projectPath &&
    externalProject &&
    (externalProject.startsWith('..') || path.isAbsolute(externalProject))
  ) {
    const source = createStudioNativeWorkspaceCapabilities({
      ...input,
      workspacePath: input.projectPath,
      projectPath: undefined,
    });
    const rebase = <T extends { workspacePath: string; projectPath?: string }>(request: T): T => ({
      ...request,
      workspacePath: input.projectPath!,
      projectPath: undefined,
    });
    return {
      applyPatches: (request) => source.applyPatches(rebase(request)),
      applyTextEdits: (request) => source.applyTextEdits!(rebase(request)),
      deleteFiles: (request) => source.deleteFiles(rebase(request)),
      saveFiles: (request) => source.saveFiles!(rebase(request)),
      rememberNativeTransaction: source.rememberNativeTransaction,
      preflightWorkspaceCommand: (request) => source.preflightWorkspaceCommand!(rebase(request)),
      runWorkspaceCommand: (request) => source.runWorkspaceCommand(rebase(request)),
      inspectChanges: (request) => source.inspectChanges(rebase(request)),
      verify: (request) => source.verify(rebase(request)),
    };
  }
  const ownTransactions = [...new Set(input.transactionIds ?? [])];
  const baseline = input
    .diagnostics({ workspacePath: input.workspacePath, projectPath: input.projectPath })
    .catch((error) => ({ ok: false, error: String(error), output: undefined }));
  const diagnosticsErrors = (value: unknown): Array<Record<string, unknown>> => {
    const entries =
      value && typeof value === 'object'
        ? (value as { diagnostics?: unknown }).diagnostics
        : undefined;
    return Array.isArray(entries)
      ? entries.filter(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            (entry.severity === 'error' || entry.severity === 0)
        )
      : [];
  };
  const inspectChanges: StudioAgentWorkspaiToolHost['inspectChanges'] = async (request) => {
    const git = await input.inspectChanges(request);
    const diffs: string[] = [];
    // Review each path from its earliest still-applied receipt to the current file.
    // Replaying every intermediate diff wastes context and can hide the net change.
    const files = new Map<string, StudioNativeTransaction['files'][number]>();
    const requested = request.paths?.length ? new Set(request.paths) : undefined;
    for (const id of ownTransactions) {
      const receipt = await transactionInRoot(request.workspacePath, id);
      if (!receipt) {
        continue;
      }
      if (receipt.state !== 'applied') {
        continue;
      }
      for (const file of receipt.files) {
        if (requested && !requested.has(file.relativePath)) {
          continue;
        }
        if (!files.has(file.relativePath)) {
          files.set(file.relativePath, file);
        }
      }
    }
    for (const file of files.values()) {
      if (file.checkpointOnly) {
        diffs.push(`${file.relativePath}: sensitive content omitted; bytes are checkpointed.`);
        continue;
      }
      const current = await currentContent(
        await safeTarget(request.workspacePath, file.relativePath),
        file.encoding
      );
      if (file.before === current) {
        continue;
      }
      if (file.encoding) {
        diffs.push(
          JSON.stringify(summarizeFile({ ...file, after: current }, request.workspacePath))
        );
        continue;
      }
      const diff = createTwoFilesPatch(
        file.relativePath,
        file.relativePath,
        file.before ?? '',
        current ?? '',
        'before',
        'current',
        { context: 3, timeout: 500 }
      );
      diffs.push(
        diff ?? `Diff budget exceeded for ${file.relativePath}; inspect a narrower source target.`
      );
    }
    const nativeDiff = diffs.join('\n');
    return {
      ok: git.ok,
      output: {
        ...(git.output && typeof git.output === 'object' ? git.output : {}),
        nativeTransactionIds: ownTransactions,
        nativeDiff: nativeDiff.slice(0, 24_000),
        nativeDiffTruncated: nativeDiff.length > 24_000,
        authority: 'workspace-evidence',
      },
    };
  };
  const applyPatches: StudioAgentWorkspaiToolHost['applyPatches'] = async (request) =>
    serialSource(request.workspacePath, async () => {
      const patches = normalizePatchesForWorkspaceScope(request);
      if (patches.length !== request.patches.length) {
        throw new Error(
          'Multiple source proposals resolve to the same file. Submit one change per target.'
        );
      }
      const denied = await authorizeStudioWorkspacePatchTargets({
        ...request,
        patches,
        inspectedSource: input.inspectedSource,
      });
      if (denied.length) {
        return {
          ok: false,
          error: `Inspect every target before editing: ${denied.map((patch) => patch.relativePath).join(', ')}`,
        };
      }
      const id = `native-${crypto.randomUUID()}`;
      const files: StudioNativeTransaction['files'] = [];
      for (const patch of patches) {
        const target = await safeTarget(request.workspacePath, patch.relativePath);
        const before = await currentContent(target);
        const sha =
          before === null ? null : crypto.createHash('sha256').update(before).digest('hex');
        if (input.inspectedSource.get(patch.relativePath) !== sha) {
          throw new Error(`Source changed after inspection: ${patch.relativePath}`);
        }
        const after = patch.operation === 'delete' ? null : patch.patchedContent;
        if (after?.includes('\0')) {
          throw new Error('Source changes must be text.');
        }
        if (after !== null && path.extname(target) === '.json') {
          JSON.parse(after);
        }
        const beforeMode = (await fs.stat(target).catch(() => undefined))?.mode;
        const document = studioOpenDocument(target);
        if (document?.dirty && after === null) {
          throw new Error(
            'Save the owned document before deleting it so unsaved work is preserved in its checkpoint.'
          );
        }
        const disk = document?.dirty ? await diskContent(target) : undefined;
        files.push({
          relativePath: patch.relativePath,
          before,
          after,
          beforeMode,
          afterMode: beforeMode,
          ...(disk !== undefined ? { editor: { beforeDisk: disk, afterDisk: disk } } : {}),
        });
      }
      if (new Set(files.map((file) => file.relativePath)).size !== files.length) {
        throw new Error('Duplicate source targets are not allowed.');
      }
      const receipt: StudioNativeTransaction = {
        schemaVersion: 'workspai.native-source-transaction.v1',
        transactionId: id,
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        ...(request.requestId ? { requestId: request.requestId } : {}),
        workspacePath: path.resolve(request.workspacePath),
        state: 'prepared',
        files,
      };
      // Persist originals before touching source. Storage failure prevents execution.
      await persistReceipt(receipt);
      await baseline;
      try {
        await applyExact(request.workspacePath, files);
        receipt.state = 'applied';
        try {
          await persistReceipt(receipt);
        } catch (error) {
          await applyExact(request.workspacePath, files.map(reversedFile));
          throw error;
        }
      } catch (error) {
        receipt.state = 'failed';
        await persistReceipt(receipt).catch(() => undefined);
        throw error;
      }
      ownTransactions.push(id);
      return {
        ok: true,
        changed: files.some((file) => file.before !== file.after),
        output: {
          transactionId: id,
          transaction: {
            schemaVersion: receipt.schemaVersion,
            transactionId: id,
            state: 'applied',
          },
          changedPaths: files
            .filter((file) => file.before !== file.after)
            .map((file) => file.relativePath),
          patches: patches.map((patch) => ({ ...patch, status: 'applied' })),
          fileChanges: files.map((file) => summarizeFile(file, request.workspacePath)),
          verificationAuthority: 'workspace-evidence',
          instruction:
            'Changes are applied, not yet verified. Run relevant native checks, inspect the final changes, then verify-blocker for workspace diagnostics. No CLI Goal or canonical closure is implied.',
        },
      };
    });
  const preflightWorkspaceCommand: NonNullable<
    StudioAgentWorkspaiToolHost['preflightWorkspaceCommand']
  > = async (request) => {
    await requireStudioWorkspaceDirectory(resolveStudioWorkspaceCommandPlan(request).cwd);
    for (const id of ownTransactions) {
      const receipt = await transactionInRoot(request.workspacePath, id);
      if (!receipt) {
        continue;
      }
      for (const file of receipt.files) {
        if (file.checkpointOnly) {
          continue;
        }
        const target = await safeTarget(request.workspacePath, file.relativePath);
        const document = studioOpenDocument(target);
        if (document?.dirty && document.text !== (await diskContent(target))) {
          throw new Error(
            `Checks read disk while ${file.relativePath} has unsaved request edits. Use save-workspace-documents for owned paths before running the command.`
          );
        }
      }
    }
  };
  const retainCommandChanges = async (
    owner: { sessionId: string; requestId: string },
    changed: {
      transaction: StudioWorkspaceSourceTransaction;
      after: StudioWorkspaceSourceSnapshot;
      changedPaths: string[];
    }
  ) => {
    if (changed.changedPaths.length > 1000) {
      throw new Error(
        'The request checkpoint cannot retain more than 1000 changed command files in one receipt.'
      );
    }
    const files: StudioNativeTransaction['files'] = [];
    for (const relativePath of changed.changedPaths) {
      const checkpointOnly = !!studioSourcePathDenialReason(relativePath);
      const target = await safeTarget(
        changed.transaction.workspacePath,
        relativePath,
        checkpointOnly
      );
      if (
        changed.transaction.before.symlinks[relativePath] !== undefined ||
        changed.after.symlinks[relativePath] !== undefined ||
        studioOpenDocument(target)?.dirty
      ) {
        throw new Error(
          'Command checkpoint cannot attribute a changed symlink or concurrently edited buffer.'
        );
      }
      const before = changed.transaction.before.files[relativePath]
        ? await fs.readFile(path.join(changed.transaction.backupPath, relativePath))
        : null;
      const after = changed.after.files[relativePath] ? await fs.readFile(target) : null;
      const hash = (bytes: Buffer | null) =>
        bytes === null ? undefined : crypto.createHash('sha256').update(bytes).digest('hex');
      if (
        hash(before) !== changed.transaction.before.files[relativePath] ||
        hash(after) !== changed.after.files[relativePath]
      ) {
        throw new Error('Command files changed during checkpoint attribution.');
      }
      const binary = [before, after].some(
        (bytes) =>
          bytes !== null &&
          (bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes))
      );
      const encoding = binary ? ('base64' as const) : undefined;
      files.push({
        relativePath,
        before: before?.toString(encoding ?? 'utf8') ?? null,
        after: after?.toString(encoding ?? 'utf8') ?? null,
        ...(encoding ? { encoding } : {}),
        ...(checkpointOnly ? { checkpointOnly: true } : {}),
        beforeMode: changed.transaction.fileModes[relativePath],
        afterMode: after !== null ? (await fs.stat(target)).mode : undefined,
      });
    }
    const receipt: StudioNativeTransaction = {
      schemaVersion: 'workspai.native-source-transaction.v1',
      transactionId: `native-${crypto.randomUUID()}`,
      ...owner,
      workspacePath: changed.transaction.workspacePath,
      state: 'applied',
      files,
    };
    await persistReceipt(receipt);
    ownTransactions.push(receipt.transactionId);
    return {
      nativeTransactionId: receipt.transactionId,
      transaction: {
        schemaVersion: receipt.schemaVersion,
        transactionId: receipt.transactionId,
        state: receipt.state,
      },
      fileChanges: files.map((file) => summarizeFile(file, receipt.workspacePath)),
    };
  };
  return {
    applyPatches,
    rememberNativeTransaction: (id) => {
      if (!ownTransactions.includes(id)) {
        ownTransactions.push(id);
      }
    },
    saveFiles: async (request) =>
      serialSource(request.workspacePath, async () => {
        const owned = new Map<string, StudioNativeTransaction['files'][number]>();
        for (const id of ownTransactions) {
          const receipt = await transactionInRoot(request.workspacePath, id);
          if (!receipt) {
            continue;
          }
          if (
            receipt.sessionId !== request.sessionId ||
            receipt.requestId !== request.requestId ||
            receipt.state !== 'applied'
          ) {
            continue;
          }
          for (const file of receipt.files) {
            owned.set(file.relativePath, file);
          }
        }
        const files: StudioNativeTransaction['files'] = [];
        for (const relativePath of [...new Set(request.paths)]) {
          const target = await safeTarget(request.workspacePath, relativePath);
          const file = owned.get(relativePath);
          const document = studioOpenDocument(target);
          if (
            !file ||
            !document?.dirty ||
            document.text !== file.after ||
            (await diskContent(target)) !== (file.editor?.afterDisk ?? file.after)
          ) {
            throw new Error(
              `This request does not own the current unsaved content: ${relativePath}. Inspect current changes before saving.`
            );
          }
          const beforeDisk = await diskContent(target);
          const mode = (await fs.stat(target)).mode;
          files.push({
            relativePath,
            before: document.text,
            after: document.text,
            beforeMode: mode,
            afterMode: mode,
            editor: { beforeDisk, afterDisk: document.text },
          });
        }
        const id = `native-${crypto.randomUUID()}`;
        const receipt: StudioNativeTransaction = {
          schemaVersion: 'workspai.native-source-transaction.v1',
          transactionId: id,
          sessionId: request.sessionId,
          requestId: request.requestId,
          workspacePath: path.resolve(request.workspacePath),
          state: 'prepared',
          files,
        };
        await persistReceipt(receipt);
        let failure: string | undefined;
        try {
          for (const file of files) {
            await saveStudioDocument(
              await safeTarget(request.workspacePath, file.relativePath),
              file.before!
            );
          }
        } catch (error) {
          failure = String(error);
        }
        for (const file of files) {
          const target = await safeTarget(request.workspacePath, file.relativePath);
          file.after = await currentContent(target);
          file.editor!.afterDisk = await diskContent(target);
          file.afterMode = (await fs.stat(target)).mode;
        }
        receipt.state = 'applied';
        try {
          await persistReceipt(receipt);
        } catch (error) {
          await applyExact(request.workspacePath, files.map(reversedFile));
          receipt.state = 'rolled-back';
          await persistReceipt(receipt).catch(() => undefined);
          throw error;
        }
        ownTransactions.push(id);
        return {
          ok: !failure,
          changed: files.some(
            (file) =>
              file.editor!.beforeDisk !== file.editor!.afterDisk || file.before !== file.after
          ),
          ...(failure
            ? {
                error: `Saving did not finish for every document. The actual effects remain checkpointed. ${failure}`,
              }
            : {}),
          output: {
            transactionId: id,
            transaction: {
              schemaVersion: receipt.schemaVersion,
              transactionId: id,
              state: 'applied',
            },
            changedPaths: files.map((file) => file.relativePath),
            fileChanges: files.map((file) => summarizeFile(file, request.workspacePath)),
            instruction:
              'Inspect save-hook changes and run relevant disk-based checks. Saving is not verification.',
          },
        };
      }),
    preflightWorkspaceCommand,
    inspectChanges,
    applyTextEdits: async (request) =>
      applyPatches({
        ...request,
        patches: await compileInspectedStudioTextEdits({
          ...request,
          inspectedSource: input.inspectedSource,
        }),
      }),
    deleteFiles: async (request) =>
      applyPatches({
        ...request,
        patches: await compileInspectedStudioDeletePatches({
          ...request,
          inspectedSource: input.inspectedSource,
        }),
      }),
    runWorkspaceCommand: async (request) =>
      serialSource(request.workspacePath, async () => {
        await preflightWorkspaceCommand(request);
        return executeStudioWorkspaceCommandTransaction({
          ...request,
          ...(request.sessionId && request.requestId
            ? {
                retainSourceChanges: (changed: {
                  transaction: StudioWorkspaceSourceTransaction;
                  after: StudioWorkspaceSourceSnapshot;
                  changedPaths: string[];
                }) =>
                  retainCommandChanges(
                    { sessionId: request.sessionId!, requestId: request.requestId! },
                    changed
                  ),
              }
            : {}),
          reportProcessEvent: request.reportProgress
            ? (event) => request.reportProgress!({ process: event })
            : undefined,
        });
      }),
    verify: async (request) => {
      const diagnostics = await input.diagnostics(request);
      const before = await baseline;
      const priorErrors = diagnosticsErrors(before.output);
      const identity = (entry: Record<string, unknown>) =>
        JSON.stringify([entry.path ?? entry.filePath, entry.source, entry.code, entry.message]);
      const prior = new Map<string, number>();
      for (const entry of priorErrors) {
        prior.set(identity(entry), (prior.get(identity(entry)) ?? 0) + 1);
      }
      const errors = diagnosticsErrors(diagnostics.output).filter((entry) => {
        const key = identity(entry);
        const available = prior.get(key) ?? 0;
        if (available > 0) {
          prior.set(key, available - 1);
          return false;
        }
        return true;
      });
      const changes = await inspectChanges(request);
      const running = input.hasRunningTerminal?.() ?? false;
      const ok = before.ok && diagnostics.ok && changes.ok && errors.length === 0 && !running;
      return {
        ok,
        cardBlocking: !ok,
        output: {
          authority: 'workspace-evidence',
          diagnostics: diagnostics.output,
          preExistingErrorCount: priorErrors.length,
          newErrors: errors,
          changes: changes.output,
          runningTerminal: running,
          summary: ok
            ? 'Native workspace review found no new editor errors against the baseline and collected the final changes. Existing errors remain visible. Report the actual project checks and their limits; this is not CLI canonical verification.'
            : 'Native workspace review remains blocked. Inspect the new errors, change-review result, or running command. No verified completion is implied.',
        },
        ...(ok
          ? {}
          : {
              error: running
                ? 'A terminal command is still running. Inspect its output and wait for completion or stop it before verification.'
                : 'Workspace diagnostics or final change review need attention.',
            }),
      };
    },
  };
}
