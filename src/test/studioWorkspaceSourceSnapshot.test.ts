import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  captureStudioWorkspaceSourceSnapshot,
  diffStudioWorkspaceSourceSnapshots,
} from '../core/studioWorkspaceSourceSnapshot.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio workspace source snapshots', () => {
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
});
