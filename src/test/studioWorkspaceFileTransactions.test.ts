import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import type { FilePatch } from '../core/patchApplyEngine.js';
import {
  authorizeStudioWorkspacePatchTargets,
  deleteInspectedStudioWorkspaceFiles,
} from '../core/studioWorkspaceFileTransactions.js';

const roots: string[] = [];

function patch(relativePath: string, baseSha256?: string | null): FilePatch {
  return {
    relativePath,
    ...(baseSha256 !== undefined ? { baseSha256 } : {}),
    isNewFile: baseSha256 === null,
    patchedContent: 'next',
    hunks: [],
    status: 'pending',
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio workspace file transactions', () => {
  it('authorizes inspected replacements and explicit safe new files only', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-file-auth-'));
    roots.push(root);
    await fs.outputFile(path.join(root, 'src/existing.ts'), 'existing');
    const inspected = new Map<string, string | null>([['src/inspected.ts', 'known-sha']]);
    const patches = [
      patch('src/inspected.ts', 'known-sha'),
      patch('src/new.ts', null),
      patch('src/existing.ts', null),
      patch('.workspai/reports/fake.json', null),
    ];

    const unauthorized = await authorizeStudioWorkspacePatchTargets({
      workspacePath: root,
      patches,
      inspectedSource: inspected,
    });

    expect(unauthorized.map((entry) => entry.relativePath)).toEqual([
      'src/existing.ts',
      '.workspai/reports/fake.json',
    ]);
    expect(inspected.get('src/new.ts')).toBeNull();
  });

  it('deletes only an unchanged inspected regular file and preserves rollback content', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-file-delete-'));
    roots.push(root);
    const relativePath = 'src/obsolete.ts';
    const content = 'export const obsolete = true;';
    await fs.outputFile(path.join(root, relativePath), content);
    const sha = crypto.createHash('sha256').update(content).digest('hex');

    const result = await deleteInspectedStudioWorkspaceFiles({
      workspacePath: root,
      paths: [relativePath],
      inspectedSource: new Map([[relativePath, sha]]),
      actionId: 'delete-1',
    });

    expect(await fs.pathExists(path.join(root, relativePath))).toBe(false);
    expect(result).toMatchObject({ appliedCount: 1, failedCount: 0 });
    expect(result.patches[0]).toMatchObject({
      relativePath,
      operation: 'delete',
      originalContent: content,
      status: 'applied',
    });
  });

  it('refuses stale, uninspected, sensitive, and escaping delete targets', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-file-refuse-'));
    roots.push(root);
    await fs.outputFile(path.join(root, 'src/a.ts'), 'current');
    await fs.outputFile(path.join(root, '.env'), 'secret');

    await expect(
      deleteInspectedStudioWorkspaceFiles({
        workspacePath: root,
        paths: ['src/a.ts'],
        inspectedSource: new Map([['src/a.ts', 'stale-sha']]),
        actionId: 'stale',
      })
    ).rejects.toThrow('Source changed');
    await expect(
      deleteInspectedStudioWorkspaceFiles({
        workspacePath: root,
        paths: ['.env'],
        inspectedSource: new Map([['.env', 'sha']]),
        actionId: 'sensitive',
      })
    ).rejects.toThrow('not authorized');
    await expect(
      deleteInspectedStudioWorkspaceFiles({
        workspacePath: root,
        paths: ['../outside'],
        inspectedSource: new Map(),
        actionId: 'escape',
      })
    ).rejects.toThrow('not authorized');
  });
});
