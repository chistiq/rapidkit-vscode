import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
const fake = vi.hoisted(() => ({ register: vi.fn(() => ({ dispose() {} })) }));
vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    dispose() {}
  },
  FileType: { File: 1 },
  FileSystemError: {
    FileNotFound: (uri: unknown) => new Error(String(uri)),
    NoPermissions: (message: string) => new Error(message),
  },
  Uri: { from: (value: unknown) => value },
  workspace: { registerFileSystemProvider: fake.register },
}));
import { studioWorkspaceAssetTools } from '../core/studioWorkspaceAssets.js';
import {
  configureStudioNativeStorage,
  reviewStudioNativeCheckpoint,
  writeStudioNativeAsset,
  createStudioNativeWorkspaceCapabilities,
} from '../core/studioNativeWorkspace.js';
import { StudioHostToolOutputStore } from '../core/studioHostToolOutputStore.js';
import {
  studioNativeSnapshotUri,
  registerStudioNativeBinaryDocuments,
} from '../core/studioNativeBinaryDocuments.js';

let root: string, workspacePath: string, context: vscode.ExtensionContext;
const hash = (bytes: string | Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const owner = () => ({
  sessionId: 'chat',
  requestId: 'request',
  toolCallId: 'asset',
  workspacePath,
  signal: new AbortController().signal,
});
const review = {
  sessionId: 'chat',
  requestIds: ['request'],
  transactionIds: [],
  workspaceTrusted: true,
};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-assets-'));
  workspacePath = path.join(root, 'source');
  await fs.ensureDir(workspacePath);
  configureStudioNativeStorage(path.join(root, 'storage'));
  context = {
    storageUri: { fsPath: path.join(root, 'storage') },
  } as unknown as vscode.ExtensionContext;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(root);
});

describe('Owned byte assets and binary request checkpoints', () => {
  it('copies an owned retained tool image without model base64 and supports readonly byte comparison, Keep, Restore and Redo after reload', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
      'base64'
    );
    const outputRef = `host-output-${crypto.randomUUID()}`;
    await new StudioHostToolOutputStore(path.join(root, 'storage')).save('chat', outputRef, '', 0, [
      { mimeType: 'image/png', base64: png.toString('base64') },
    ]);
    const remembered = vi.fn();
    const tools = studioWorkspaceAssetTools(context, remembered);
    const result = await tools[1].execute(
      { target: 'images/cover.png', expectedTargetHash: null, outputRef },
      owner()
    );
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      output: {
        fileChanges: [{ binary: true, status: 'added', beforeBytes: 0, afterBytes: png.length }],
      },
    });
    expect(JSON.stringify(result)).not.toContain(png.toString('base64'));
    const id = (result.output as { transactionId: string }).transactionId;
    expect(remembered).toHaveBeenCalledExactlyOnceWith(id);
    expect(await fs.readFile(path.join(workspacePath, 'images/cover.png'))).toEqual(png);
    registerStudioNativeBinaryDocuments();
    const [scheme, provider, options] = fake.register.mock.calls.at(-1)!;
    expect(options).toMatchObject({ isReadonly: true });
    expect(scheme).toBe('workspai-checkpoint');
    const uri = studioNativeSnapshotUri({
      workspacePath,
      transactionId: id,
      relativePath: 'images/cover.png',
      side: 'after',
    });
    expect(await provider.readFile(uri)).toEqual(png);
    expect(await provider.stat(uri)).toMatchObject({ size: png.length });
    expect(() => provider.writeFile(uri, Buffer.from('overwrite'))).toThrow('read-only');
    await reviewStudioNativeCheckpoint({ ...review, action: 'keep' });
    configureStudioNativeStorage(path.join(root, 'storage'));
    await reviewStudioNativeCheckpoint({ ...review, action: 'restore' });
    expect(await fs.pathExists(path.join(workspacePath, 'images/cover.png'))).toBe(false);
    await reviewStudioNativeCheckpoint({ ...review, action: 'redo' });
    expect(await fs.readFile(path.join(workspacePath, 'images/cover.png'))).toEqual(png);
  });

  it('uses raw-byte hashes for replacement and preserves unrelated edits and stale targets', async () => {
    const original = Buffer.from([0, 1, 255]),
      replacement = Buffer.from([0, 2, 254, 0]);
    const file = path.join(workspacePath, 'asset.bin');
    await fs.writeFile(file, original);
    await fs.writeFile(path.join(workspacePath, 'source.bin'), replacement);
    const tools = studioWorkspaceAssetTools(context);
    const metadata = await tools[0].execute({ path: 'asset.bin' }, owner());
    expect(metadata).toMatchObject({ output: { sha256: hash(original), bytes: 3, binary: true } });
    await expect(
      tools[1].execute(
        { target: 'asset.bin', expectedTargetHash: null, sourcePath: 'source.bin' },
        owner()
      )
    ).rejects.toThrow('changed since inspection');
    await tools[1].execute(
      { target: 'asset.bin', expectedTargetHash: hash(original), sourcePath: 'source.bin' },
      owner()
    );
    await fs.writeFile(path.join(workspacePath, 'user.txt'), 'preserve');
    await reviewStudioNativeCheckpoint({ ...review, action: 'restore' });
    expect(await fs.readFile(file)).toEqual(original);
    await reviewStudioNativeCheckpoint({ ...review, action: 'redo' });
    expect(await fs.readFile(file)).toEqual(replacement);
    await fs.writeFile(file, Buffer.from([0, 3, 253]));
    await expect(reviewStudioNativeCheckpoint({ ...review, action: 'restore' })).rejects.toThrow(
      'stale'
    );
    expect(await fs.readFile(path.join(workspacePath, 'user.txt'), 'utf8')).toBe('preserve');
  });

  it('restores text-to-binary changes from the earliest request original', async () => {
    await fs.writeFile(path.join(workspacePath, 'asset.bin'), 'original text');
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath,
      inspectedSource: new Map([['asset.bin', hash('original text')]]),
      diagnostics: async () => ({ ok: true }),
      inspectChanges: async () => ({ ok: true }),
    });
    await native.applyPatches({
      workspacePath,
      sessionId: 'chat',
      requestId: 'request',
      transactionId: 'proposal',
      patches: [
        {
          relativePath: 'asset.bin',
          patchedContent: 'intermediate',
          isNewFile: false,
          hunks: [],
          status: 'pending',
        },
      ],
    });
    await writeStudioNativeAsset({
      workspacePath,
      sessionId: 'chat',
      requestId: 'request',
      relativePath: 'asset.bin',
      expectedHash: hash('intermediate'),
      bytes: Buffer.from([0, 1, 2]),
    });
    await reviewStudioNativeCheckpoint({ ...review, action: 'restore' });
    expect(await fs.readFile(path.join(workspacePath, 'asset.bin'), 'utf8')).toBe('original text');
    await reviewStudioNativeCheckpoint({ ...review, action: 'redo' });
    expect(await fs.readFile(path.join(workspacePath, 'asset.bin'))).toEqual(
      Buffer.from([0, 1, 2])
    );
  });

  it('rejects other chats, sensitive files, escaped/symlink paths, MIME mismatches and cancelled writes', async () => {
    const tools = studioWorkspaceAssetTools(context);
    await fs.writeFile(path.join(root, 'outside.bin'), 'private');
    await fs.symlink(path.join(root, 'outside.bin'), path.join(workspacePath, 'link.bin'));
    for (const sourcePath of ['../outside.bin', '.env', 'link.bin']) {
      await expect(
        tools[1].execute({ target: 'out.bin', expectedTargetHash: null, sourcePath }, owner())
      ).rejects.toThrow();
    }
    const outputRef = `host-output-${crypto.randomUUID()}`;
    await new StudioHostToolOutputStore(path.join(root, 'storage')).save(
      'other',
      outputRef,
      '',
      0,
      [{ mimeType: 'image/png', base64: 'YQ==' }]
    );
    await expect(
      tools[1].execute({ target: 'out.png', expectedTargetHash: null, outputRef }, owner())
    ).rejects.toThrow();
    await new StudioHostToolOutputStore(path.join(root, 'storage')).save('chat', outputRef, '', 0, [
      { mimeType: 'image/png', base64: 'YQ==' },
    ]);
    await expect(
      tools[1].execute({ target: 'out.js', expectedTargetHash: null, outputRef }, owner())
    ).rejects.toThrow('MIME');
    await fs.writeFile(path.join(workspacePath, 'source.bin'), Buffer.from([0, 1]));
    const controller = new AbortController();
    controller.abort();
    expect(
      await tools[1].execute(
        { target: 'out.bin', expectedTargetHash: null, sourcePath: 'source.bin' },
        { ...owner(), signal: controller.signal }
      )
    ).toMatchObject({ ok: false });
    expect(await fs.pathExists(path.join(workspacePath, 'out.bin'))).toBe(false);
  });
});
