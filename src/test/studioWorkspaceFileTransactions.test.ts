import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import type { FilePatch } from '../core/patchApplyEngine.js';
import {
  authorizeStudioWorkspacePatchTargets,
  compileInspectedStudioDeletePatches,
  compileInspectedStudioTextEdits,
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

  it('never lets a prior inspection bypass canonical control-plane protection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-file-control-plane-'));
    roots.push(root);
    const protectedPaths = [
      '.workspai/workspace.contract.json',
      '.workspai/workspace-registry.v1.json',
      '.workspai/repair/transactions/repair_123/transaction.json',
      '.workspai/goals/goal-1/goal.json',
      '.rapidkit/project.json',
    ];
    const inspected = new Map<string, string | null>(
      protectedPaths.map((relativePath) => [relativePath, 'known-sha'])
    );

    const unauthorized = await authorizeStudioWorkspacePatchTargets({
      workspacePath: root,
      patches: protectedPaths.map((relativePath) => patch(relativePath, 'known-sha')),
      inspectedSource: inspected,
    });

    expect(unauthorized.map((entry) => entry.relativePath)).toEqual(protectedPaths);
  });

  it('authorizes an inspected linked-project path only inside the declared project root', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-linked-workspace-'));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-linked-project-'));
    const sibling = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-linked-sibling-'));
    roots.push(workspace, project, sibling);
    const projectRelative = path
      .relative(workspace, path.join(project, 'src/a.ts'))
      .replace(/\\/g, '/');
    const siblingRelative = path
      .relative(workspace, path.join(sibling, 'src/a.ts'))
      .replace(/\\/g, '/');
    const inspected = new Map<string, string | null>([[projectRelative, 'known-sha']]);

    const unauthorized = await authorizeStudioWorkspacePatchTargets({
      workspacePath: workspace,
      projectPath: project,
      patches: [patch(projectRelative, 'known-sha'), patch(siblingRelative, 'known-sha')],
      inspectedSource: inspected,
    });

    expect(unauthorized.map((entry) => entry.relativePath)).toEqual([siblingRelative]);
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

  it('compiles one identical guarded delete contract for every Agent surface', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-delete-contract-'));
    roots.push(root);
    const relativePath = 'src/obsolete.ts';
    const content = 'export const obsolete = true;';
    await fs.outputFile(path.join(root, relativePath), content);
    const sha = crypto.createHash('sha256').update(content).digest('hex');

    for (const surface of ['assistant', 'card-handoff', 'native-chat']) {
      const patches = await compileInspectedStudioDeletePatches({
        workspacePath: root,
        paths: [relativePath],
        inspectedSource: new Map([[relativePath, sha]]),
      });
      expect(patches, surface).toEqual([
        expect.objectContaining({
          relativePath,
          operation: 'delete',
          baseSha256: sha,
        }),
      ]);
    }
  });

  it('refuses uninspected, stale, sensitive, escaping, missing, and symlinked delete patches', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-delete-policy-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-delete-outside-'));
    roots.push(root, outside);
    const sourcePath = 'src/a.ts';
    await fs.outputFile(path.join(root, sourcePath), 'current');
    await fs.outputFile(path.join(root, '.env'), 'secret');
    const linkPath = 'src/link.ts';
    await fs.symlink(path.join(root, sourcePath), path.join(root, linkPath));
    await fs.outputFile(path.join(outside, 'escaped.ts'), 'outside');
    await fs.symlink(outside, path.join(root, 'linked-outside'));
    const currentSha = crypto.createHash('sha256').update('current').digest('hex');
    const outsideSha = crypto.createHash('sha256').update('outside').digest('hex');

    const compile = (target: string, inspectedSource: Map<string, string | null>) =>
      compileInspectedStudioDeletePatches({
        workspacePath: root,
        paths: [target],
        inspectedSource,
      });

    await expect(compile(sourcePath, new Map())).rejects.toThrow('Inspect every safe');
    await expect(compile(sourcePath, new Map([[sourcePath, 'stale']]))).rejects.toThrow(
      'Source changed'
    );
    await expect(compile('.env', new Map([['.env', currentSha]]))).rejects.toThrow(
      'Inspect every safe'
    );
    await expect(compile('../outside', new Map())).rejects.toThrow('Inspect every safe');
    await expect(
      compile('src/missing.ts', new Map([['src/missing.ts', currentSha]]))
    ).rejects.toThrow('regular file');
    await expect(compile(linkPath, new Map([[linkPath, currentSha]]))).rejects.toThrow(
      'regular file'
    );
    await expect(
      compile('linked-outside/escaped.ts', new Map([['linked-outside/escaped.ts', outsideSha]]))
    ).rejects.toThrow('outside the authorized source boundary');
  });

  it('compiles exact edits for an unchanged inspected linked-project file', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-edit-workspace-'));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-edit-project-'));
    roots.push(workspace, project);
    const relativePath = 'src/large.ts';
    const content = 'export const before = 1;\nexport const keep = true;\n';
    await fs.outputFile(path.join(project, relativePath), content);
    const sha = crypto.createHash('sha256').update(content).digest('hex');

    const patches = await compileInspectedStudioTextEdits({
      workspacePath: workspace,
      projectPath: project,
      edits: [{ relativePath, oldText: 'before = 1', newText: 'before = 2' }],
      inspectedSource: new Map([[relativePath, sha]]),
    });

    expect(patches).toEqual([
      expect.objectContaining({
        relativePath,
        baseSha256: sha,
        patchedContent: 'export const before = 2;\nexport const keep = true;\n',
      }),
    ]);
  });

  it('rejects stale, ambiguous, uninspected, and symlinked exact edits', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-edit-refuse-'));
    roots.push(root);
    const relativePath = 'src/a.ts';
    const content = 'same\nsame\n';
    await fs.outputFile(path.join(root, relativePath), content);
    const sha = crypto.createHash('sha256').update(content).digest('hex');

    await expect(
      compileInspectedStudioTextEdits({
        workspacePath: root,
        edits: [{ relativePath, oldText: 'same', newText: 'changed' }],
        inspectedSource: new Map([[relativePath, sha]]),
      })
    ).rejects.toThrow('ambiguous');
    await expect(
      compileInspectedStudioTextEdits({
        workspacePath: root,
        edits: [{ relativePath, oldText: 'missing', newText: 'changed' }],
        inspectedSource: new Map([[relativePath, sha]]),
      })
    ).rejects.toThrow('stale');
    await expect(
      compileInspectedStudioTextEdits({
        workspacePath: root,
        edits: [{ relativePath, oldText: 'same', newText: 'changed' }],
        inspectedSource: new Map(),
      })
    ).rejects.toThrow('not authorized');

    const target = path.join(root, 'target.ts');
    const link = path.join(root, 'src', 'link.ts');
    await fs.outputFile(target, 'target\n');
    await fs.symlink(target, link);
    const targetSha = crypto.createHash('sha256').update('target\n').digest('hex');
    await expect(
      compileInspectedStudioTextEdits({
        workspacePath: root,
        edits: [{ relativePath: 'src/link.ts', oldText: 'target', newText: 'changed' }],
        inspectedSource: new Map([['src/link.ts', targetSha]]),
      })
    ).rejects.toThrow('regular source file');
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
