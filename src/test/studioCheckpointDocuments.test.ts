import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  reviewStudioNativeCheckpoint,
  readStudioNativeTransaction,
} from '../core/studioNativeWorkspace.js';
import {
  configureStudioNativeDocuments,
  type StudioOpenDocument,
} from '../core/studioNativeDocuments.js';
import { inspectStudioAgentFiles } from '../core/sidebarStudioAgentRuntime.js';
import { createStudioAgentWorkspaiToolRegistry } from '../core/studioAgentWorkspaiTools.js';
import { buildStudioChangedFilesSummary } from '../../webview-ui/src/lib/studioChangedFilesSummary';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';

let root: string;
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'request-checkpoint-'));
  configureStudioNativeStorage(path.join(root, 'storage'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  configureStudioNativeDocuments();
  await fs.remove(root);
});
async function fixture(name: string, text = 'original\n') {
  const workspacePath = path.join(root, name);
  await fs.ensureDir(workspacePath);
  const file = path.join(workspacePath, 'service.ts');
  await fs.writeFile(file, text);
  const inspectedSource = new Map<string, string | null>([['service.ts', sha(text)]]);
  const native = createStudioNativeWorkspaceCapabilities({
    workspacePath,
    inspectedSource,
    diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
    inspectChanges: async () => ({ ok: true, output: {} }),
  });
  const request = {
    sessionId: 'chat',
    requestId: 'request',
    workspacePath,
    transactionId: 'proposal',
    patches: [
      {
        relativePath: 'service.ts',
        patchedContent: 'changed\n',
        isNewFile: false,
        hunks: [],
        status: 'pending' as const,
      },
    ],
  };
  return { workspacePath, file, native, request, inspectedSource };
}
const checkpoint = {
  sessionId: 'chat',
  requestIds: ['request'],
  transactionIds: [],
  workspaceTrusted: true,
};
const id = (result: { output?: unknown }) =>
  (result.output as { transactionId: string }).transactionId;
function buffers(
  entries: Map<string, StudioOpenDocument>,
  saving?: (file: string) => Promise<boolean>
) {
  configureStudioNativeDocuments({
    get: (file) => entries.get(file),
    async replace(edits) {
      if (
        edits.some(
          (edit) =>
            entries.get(edit.path)?.version !== edit.version ||
            entries.get(edit.path)?.text !== edit.before
        )
      ) {
        return false;
      }
      for (const edit of edits) {
        const document = entries.get(edit.path)!;
        document.text = edit.after;
        document.version++;
        document.dirty = edit.after !== (await fs.readFile(edit.path, 'utf8'));
      }
      return true;
    },
    async save(file, expected) {
      const document = entries.get(file);
      if (!document || document.text !== expected) {
        return false;
      }
      if (saving) {
        return saving(file);
      }
      await fs.writeFile(file, document.text);
      document.dirty = false;
      return true;
    },
  });
}
describe('Request checkpoints across editor state and workspace roots', () => {
  it('deletes only the chat-owned checkpoint originals and rejects late writes without changing source', async () => {
    const f = await fixture('deleted-chat');
    const other = await fixture('retained-chat');
    const applied = await f.native.applyPatches(f.request);
    const retained = await other.native.applyPatches({ ...other.request, sessionId: 'other' });
    const store = new VSCodeStudioAgentSessionStore({
      storageUri: { fsPath: path.join(root, 'storage') },
      workspaceState: { get: () => undefined, update: async () => {} },
    } as unknown as import('vscode').ExtensionContext);
    await store.delete('chat');
    await expect(readStudioNativeTransaction(f.workspacePath, id(applied))).rejects.toThrow();
    expect((await readStudioNativeTransaction(other.workspacePath, id(retained))).sessionId).toBe(
      'other'
    );
    expect(await fs.readFile(f.file, 'utf8')).toBe('changed\n');
    f.inspectedSource.set('service.ts', sha('changed\n'));
    await expect(
      f.native.applyPatches({
        ...f.request,
        patches: [{ ...f.request.patches[0], patchedContent: 'late\n' }],
      })
    ).rejects.toThrow('deleted');
    expect(await fs.readFile(f.file, 'utf8')).toBe('changed\n');
  });
  it('edits an externally adopted project source without touching the canonical workspace directory', async () => {
    const workspace = await fixture('canonical'),
      external = await fixture('external');
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath: workspace.workspacePath,
      projectPath: external.workspacePath,
      inspectedSource: external.inspectedSource,
      diagnostics: async () => ({ ok: true }),
      inspectChanges: async () => ({ ok: true }),
    });
    const result = await native.applyPatches({
      ...workspace.request,
      projectPath: external.workspacePath,
    });
    expect(result.ok).toBe(true);
    expect(await fs.readFile(external.file, 'utf8')).toBe('changed\n');
    expect(await fs.readFile(workspace.file, 'utf8')).toBe('original\n');
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' });
    expect(await fs.readFile(external.file, 'utf8')).toBe('original\n');
  });

  it('refuses a replaced workspace directory even when replacement files have matching contents', async () => {
    const f = await fixture('source');
    await f.native.applyPatches(f.request);
    await fs.rename(f.workspacePath, path.join(root, 'previous-source'));
    await fs.ensureDir(f.workspacePath);
    await fs.writeFile(f.file, 'changed\n');
    await expect(
      reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' })
    ).rejects.toThrow('replaced or redirected');
    expect(await fs.readFile(f.file, 'utf8')).toBe('changed\n');
  });

  it('keeps concurrent root indexes, separates identical relative paths and restores/redoes the complete request after reload', async () => {
    const a = await fixture('first'),
      b = await fixture('second', 'second original\n');
    const results = await Promise.all([
      a.native.applyPatches(a.request),
      b.native.applyPatches(b.request),
    ]);
    const timeline = results.map((result) => ({
      action: 'apply-workspace-patch',
      title: 'Edited',
      summary: '',
      status: 'done' as const,
      transactionId: id(result),
      transactionState: 'applied',
      fileChanges: (result.output as { fileChanges: [] }).fileChanges,
    }));
    const summary = buildStudioChangedFilesSummary(timeline);
    expect(summary.files).toHaveLength(2);
    expect(new Set(summary.files.map((file) => file.workspaceId)).size).toBe(2);
    expect(summary.files.map((file) => file.workspaceName).sort()).toEqual(['first', 'second']);
    configureStudioNativeStorage(path.join(root, 'storage'));
    const restored = await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' });
    expect(restored).toMatchObject({ state: 'restored', workspaceCount: 2 });
    expect(restored.files).toHaveLength(2);
    expect(await fs.readFile(a.file, 'utf8')).toBe('original\n');
    expect(await fs.readFile(b.file, 'utf8')).toBe('second original\n');
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'redo' });
    expect(await fs.readFile(a.file, 'utf8')).toBe('changed\n');
    expect(await fs.readFile(b.file, 'utf8')).toBe('changed\n');
  });

  it('preflights every root and refuses a corrupt index instead of restoring a partial request', async () => {
    const a = await fixture('first'),
      b = await fixture('second');
    const first = await a.native.applyPatches(a.request);
    await b.native.applyPatches(b.request);
    await fs.writeFile(b.file, 'user work\n');
    await expect(
      reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' })
    ).rejects.toThrow('stale');
    expect(await fs.readFile(a.file, 'utf8')).toBe('changed\n');
    expect(await fs.readFile(b.file, 'utf8')).toBe('user work\n');
    const index = path.join(
      root,
      'storage/assistant-native-transactions/checkpoints',
      sha('chat'),
      `${sha('request')}.json`
    );
    await fs.writeFile(index, 'broken-json');
    await expect(
      reviewStudioNativeCheckpoint({
        ...checkpoint,
        transactionIds: [id(first)],
        action: 'restore',
      })
    ).rejects.toThrow('unreadable');
    expect(await fs.readFile(a.file, 'utf8')).toBe('changed\n');
  });

  it('rolls back changes across all roots when persisting a reviewed receipt fails', async () => {
    const a = await fixture('first'),
      b = await fixture('second');
    const first = await a.native.applyPatches(a.request),
      second = await b.native.applyPatches(b.request);
    const rename = fs.rename;
    let fail = true;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (
        String(to).endsWith(`${id(second)}.json`) &&
        fail &&
        (await fs.readJSON(String(from))).state === 'rolled-back'
      ) {
        fail = false;
        throw new Error('Simulated receipt failure');
      }
      return rename(from, to);
    });
    await expect(
      reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' })
    ).rejects.toThrow('receipt failure');
    expect(await fs.readFile(a.file, 'utf8')).toBe('changed\n');
    expect(await fs.readFile(b.file, 'utf8')).toBe('changed\n');
    expect((await readStudioNativeTransaction(a.workspacePath, id(first))).state).toBe('applied');
    expect((await readStudioNativeTransaction(b.workspacePath, id(second))).state).toBe('applied');
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' });
    expect(await fs.readFile(a.file, 'utf8')).toBe('original\n');
  });

  it('inspects and edits the dirty working document, saves only request-owned content and restores its original dirty buffer separately from disk', async () => {
    const f = await fixture('source', 'disk original\n');
    const document = { text: 'user unsaved\n', dirty: true, version: 1 };
    const open = new Map([[f.file, document]]);
    buffers(open);
    const observed = await inspectStudioAgentFiles({
      workspacePath: f.workspacePath,
      kind: 'source',
      paths: ['service.ts'],
    });
    expect(observed[0]).toMatchObject({ content: 'user unsaved\n', sha256: sha('user unsaved\n') });
    f.inspectedSource.set('service.ts', observed[0].sha256);
    const applied = await f.native.applyTextEdits!({
      ...f.request,
      edits: [
        { relativePath: 'service.ts', oldText: 'user unsaved', newText: 'user unsaved plus agent' },
      ],
    });
    expect(applied.ok).toBe(true);
    expect(document.text).toBe('user unsaved plus agent\n');
    expect(await fs.readFile(f.file, 'utf8')).toBe('disk original\n');
    await expect(
      f.native.preflightWorkspaceCommand!({
        workspacePath: f.workspacePath,
        request: { executable: 'node', args: ['--version'], purpose: 'test' },
      })
    ).rejects.toThrow('save-workspace-documents');
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: f.native as never,
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      cardId: 'assistant:agent',
    });
    const save = registry.get('save-workspace-documents')!;
    expect(
      await save.execute(
        { paths: ['service.ts'] },
        {
          sessionId: 'chat',
          requestId: 'request',
          toolCallId: 'save',
          workspacePath: f.workspacePath,
          signal: new AbortController().signal,
        }
      )
    ).toMatchObject({ ok: true, changed: true });
    expect(await fs.readFile(f.file, 'utf8')).toBe('user unsaved plus agent\n');
    await f.native.preflightWorkspaceCommand!({
      workspacePath: f.workspacePath,
      request: { executable: 'node', args: ['--version'], purpose: 'test' },
    });
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' });
    expect(await fs.readFile(f.file, 'utf8')).toBe('disk original\n');
    expect(document).toMatchObject({ text: 'user unsaved\n', dirty: true });
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'redo' });
    expect(await fs.readFile(f.file, 'utf8')).toBe('user unsaved plus agent\n');
    expect(document).toMatchObject({ text: 'user unsaved plus agent\n', dirty: false });
    // Real VS Code may retain its dirty indicator after a programmatic Redo
    // even when working text and disk bytes are identical. Checks are safe.
    document.dirty = true;
    await f.native.preflightWorkspaceCommand!({
      workspacePath: f.workspacePath,
      request: { executable: 'node', args: ['--version'], purpose: 'test' },
    });
    expect(
      createStudioAgentWorkspaiToolRegistry({
        host: f.native as never,
        assistantMode: 'ask',
        cardId: 'assistant:ask',
      }).get('save-workspace-documents')
    ).toBeUndefined();
  });

  it('preserves later user buffer/disk edits and cannot save an unrelated dirty document', async () => {
    const f = await fixture('source');
    const document = { text: 'user unsaved\n', dirty: true, version: 1 };
    const unrelated = path.join(f.workspacePath, 'user.ts');
    await fs.writeFile(unrelated, 'saved');
    buffers(
      new Map([
        [f.file, document],
        [unrelated, { text: 'unsaved unrelated', dirty: true, version: 1 }],
      ])
    );
    f.inspectedSource.set('service.ts', sha(document.text));
    await f.native.applyPatches(f.request);
    await expect(f.native.saveFiles!({ ...f.request, paths: ['user.ts'] })).rejects.toThrow(
      'does not own'
    );
    document.text = 'later user change';
    document.version++;
    await expect(
      reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' })
    ).rejects.toThrow('stale');
    expect(document.text).toBe('later user change');
    expect(await fs.readFile(unrelated, 'utf8')).toBe('saved');
  });

  it('rolls back ordinary files when the editor refuses an atomic buffer edit', async () => {
    const f = await fixture('source');
    const document = { text: 'dirty user\n', dirty: true, version: 1 };
    configureStudioNativeDocuments({
      get: (file) => (file === f.file ? document : undefined),
      replace: async () => false,
      save: async () => false,
    });
    f.inspectedSource.set('service.ts', sha(document.text));
    f.inspectedSource.set('added.ts', null);
    await expect(
      f.native.applyPatches({
        ...f.request,
        patches: [
          { ...f.request.patches[0], relativePath: 'added.ts', isNewFile: true },
          ...f.request.patches,
        ],
      })
    ).rejects.toThrow('buffer edits');
    expect(await fs.pathExists(path.join(f.workspacePath, 'added.ts'))).toBe(false);
    expect(document.text).toBe('dirty user\n');
    expect(await fs.readFile(f.file, 'utf8')).toBe('original\n');
  });
});
