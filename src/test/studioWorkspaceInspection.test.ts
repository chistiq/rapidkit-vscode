import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import {
  fingerprintStudioWorkspaceSourceState,
  planStudioWorkspaceSearch,
} from '../core/studioWorkspaceInspection.js';

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio workspace source fingerprint', () => {
  it('detects tracked, repeated, and untracked source changes deterministically', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-fingerprint-'));
    roots.push(root);
    await exec('git', ['init'], { cwd: root });
    await exec('git', ['config', 'user.email', 'studio@example.invalid'], { cwd: root });
    await exec('git', ['config', 'user.name', 'Studio Test'], { cwd: root });
    await exec('git', ['config', 'commit.gpgsign', 'false'], { cwd: root });
    await fs.outputFile(path.join(root, 'src/index.ts'), 'export const value = 1;\n');
    await exec('git', ['add', '.'], { cwd: root });
    await exec('git', ['commit', '-m', 'fixture'], { cwd: root });

    const clean = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });
    const cleanAgain = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });
    expect(clean).not.toBeNull();
    expect(cleanAgain?.fingerprint).toBe(clean?.fingerprint);

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export const value = 2;\n');
    const firstEdit = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });
    expect(firstEdit?.fingerprint).not.toBe(clean?.fingerprint);

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export const value = 3;\n');
    const repeatedEdit = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });
    expect(repeatedEdit?.fingerprint).not.toBe(firstEdit?.fingerprint);

    await fs.outputFile(path.join(root, 'src/new.ts'), 'export const added = true;\n');
    const untracked = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });
    expect(untracked?.fingerprint).not.toBe(repeatedEdit?.fingerprint);
    expect(untracked?.status).toContain('src/new.ts');
    expect(untracked?.diff).toContain('export const added = true;');
  });

  it('detects repeated edits to an untracked binary omitted from the display diff', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-binary-fingerprint-'));
    roots.push(root);
    await exec('git', ['init'], { cwd: root });
    await exec('git', ['config', 'user.email', 'studio@example.invalid'], { cwd: root });
    await exec('git', ['config', 'user.name', 'Studio Test'], { cwd: root });
    await fs.writeFile(path.join(root, 'asset.bin'), Buffer.from([0, 1, 2]));
    const before = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });

    await fs.writeFile(path.join(root, 'asset.bin'), Buffer.from([0, 1, 3]));
    const after = await fingerprintStudioWorkspaceSourceState({ workspacePath: root });

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after?.diff).not.toContain('asset.bin');
    expect(after?.fingerprint).not.toBe(before?.fingerprint);
  });
});

describe('Studio workspace search planning', () => {
  it('prefers CI workflow globs over a lexical content scan', () => {
    expect(planStudioWorkspaceSearch('github workflow')).toEqual(
      expect.objectContaining({
        pathGlobs: expect.arrayContaining(['.github/workflows/**/*.{yml,yaml}', '.gitlab-ci.yml']),
      })
    );
    expect(planStudioWorkspaceSearch('ci.yml').pathGlobs).toContain('**/*ci.yml*');
  });
});
