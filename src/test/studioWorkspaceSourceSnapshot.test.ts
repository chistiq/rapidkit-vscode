import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginStudioWorkspaceSourceTransaction,
  captureStudioWorkspaceSourceSnapshot,
  disposeStudioWorkspaceSourceTransaction,
  diffStudioWorkspaceSourceSnapshots,
  inspectStudioWorkspaceSourceTransaction,
  rollbackStudioWorkspaceSourceTransaction,
} from '../core/studioWorkspaceSourceSnapshot.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio workspace source snapshots', () => {
  it('rejects an over-limit inventory with a diagnostic before reading or backing up source', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-limit-'));
    roots.push(root);
    const entries = Array.from({ length: 30_001 }, (_, index) => ({
      name: `file-${index}.ts`,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    }));
    const readdir = vi.spyOn(fs, 'readdir').mockResolvedValueOnce(entries as never);
    const readFile = vi.spyOn(fs, 'readFile');
    const diagnostic = vi.fn();
    try {
      expect(
        await beginStudioWorkspaceSourceTransaction({
          workspacePath: root,
          onUnavailable: diagnostic,
        })
      ).toBeUndefined();
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith({
        code: 'file-limit',
        limit: 30_000,
        observed: 30_001,
      });
      expect(readFile).not.toHaveBeenCalled();
    } finally {
      readdir.mockRestore();
      readFile.mockRestore();
    }
  });

  it('detects real project source changes while ignoring governed evidence churn', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-snapshot-'));
    roots.push(root);
    const project = path.join(root, 'api');
    await fs.ensureDir(path.join(project, '.workspai', 'reports'));
    await fs.writeJson(path.join(project, 'package.json'), { name: 'api', version: '1.0.0' });
    await fs.writeJson(path.join(project, '.workspai', 'reports', 'doctor-last-run.json'), {
      generatedAt: 'first',
    });

    const before = await captureStudioWorkspaceSourceSnapshot({
      workspacePath: root,
      scopePath: project,
    });
    await fs.writeJson(path.join(project, '.workspai', 'reports', 'doctor-last-run.json'), {
      generatedAt: 'second',
    });
    const evidenceOnly = await captureStudioWorkspaceSourceSnapshot({
      workspacePath: root,
      scopePath: project,
    });
    expect(diffStudioWorkspaceSourceSnapshots(before, evidenceOnly)).toEqual([]);

    await fs.writeJson(path.join(project, 'package.json'), {
      name: 'api',
      version: '1.0.1',
    });
    const sourceChanged = await captureStudioWorkspaceSourceSnapshot({
      workspacePath: root,
      scopePath: project,
    });
    expect(diffStudioWorkspaceSourceSnapshots(evidenceOnly, sourceChanged)).toEqual([
      'api/package.json',
    ]);
  });

  it('excludes only Python bytecode within __pycache__ while covering source in the same folder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-bytecode-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'main.py'), 'print(1)\n');
    const before = await captureStudioWorkspaceSourceSnapshot({ workspacePath: root });
    await fs.outputFile(
      path.join(root, '__pycache__', 'main.cpython-313.pyc'),
      Buffer.from([0, 1, 2])
    );
    await fs.outputFile(path.join(root, '__pycache__', 'source.py'), 'print(2)\n');
    const after = await captureStudioWorkspaceSourceSnapshot({ workspacePath: root });
    expect(diffStudioWorkspaceSourceSnapshots(before, after)).toEqual(['__pycache__/source.py']);
  });

  it('detects new and removed source files in an untracked workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-untracked-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'existing.ts'), 'export const value = 1;\n');
    const before = await captureStudioWorkspaceSourceSnapshot({ workspacePath: root });

    await fs.remove(path.join(root, 'existing.ts'));
    await fs.writeFile(path.join(root, 'created.ts'), 'export const value = 2;\n');
    const after = await captureStudioWorkspaceSourceSnapshot({ workspacePath: root });

    expect(diffStudioWorkspaceSourceSnapshots(before, after)).toEqual([
      'created.ts',
      'existing.ts',
    ]);
  });

  it('restores modified, deleted, and newly created files from a private checkpoint', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-rollback-'));
    roots.push(root);
    await fs.ensureDir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'modified.ts'), 'before modified\n');
    await fs.writeFile(path.join(root, 'src', 'deleted.ts'), 'before deleted\n');
    const transaction = await beginStudioWorkspaceSourceTransaction({ workspacePath: root });
    expect(transaction).toBeDefined();

    await fs.writeFile(path.join(root, 'src', 'modified.ts'), 'after modified\n');
    await fs.remove(path.join(root, 'src', 'deleted.ts'));
    await fs.writeFile(path.join(root, 'src', 'created.ts'), 'created\n');
    const inspection = await inspectStudioWorkspaceSourceTransaction(transaction!);
    expect(inspection?.changedPaths).toEqual([
      'src/created.ts',
      'src/deleted.ts',
      'src/modified.ts',
    ]);

    const rollback = await rollbackStudioWorkspaceSourceTransaction(
      transaction!,
      inspection?.changedPaths
    );
    expect(rollback.restoredFingerprint).toBe(transaction!.before.fingerprint);
    expect(await fs.readFile(path.join(root, 'src', 'modified.ts'), 'utf8')).toBe(
      'before modified\n'
    );
    expect(await fs.readFile(path.join(root, 'src', 'deleted.ts'), 'utf8')).toBe(
      'before deleted\n'
    );
    expect(await fs.pathExists(path.join(root, 'src', 'created.ts'))).toBe(false);
    await disposeStudioWorkspaceSourceTransaction(transaction!);
  });

  it.skipIf(process.platform === 'win32')(
    'restores symlink identity instead of replacing it with copied target bytes',
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-symlink-'));
      roots.push(root);
      await fs.writeFile(path.join(root, 'target.txt'), 'target\n');
      await fs.symlink('target.txt', path.join(root, 'source-link'));
      const transaction = await beginStudioWorkspaceSourceTransaction({ workspacePath: root });
      expect(transaction?.before.symlinks['source-link']).toBe('target.txt');

      await fs.remove(path.join(root, 'source-link'));
      await fs.writeFile(path.join(root, 'source-link'), 'replacement\n');
      const inspection = await inspectStudioWorkspaceSourceTransaction(transaction!);
      await rollbackStudioWorkspaceSourceTransaction(transaction!, inspection?.changedPaths);

      expect((await fs.lstat(path.join(root, 'source-link'))).isSymbolicLink()).toBe(true);
      expect(await fs.readlink(path.join(root, 'source-link'))).toBe('target.txt');
      await disposeStudioWorkspaceSourceTransaction(transaction!);
    }
  );
});
