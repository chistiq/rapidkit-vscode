import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildStudioUntrackedFileDiffs,
  parseStudioUntrackedPaths,
} from '../core/studioWorkspaceChangeReview.js';

describe('Studio workspace change review', () => {
  it('parses NUL-delimited untracked paths without confusing tracked changes', () => {
    expect(
      parseStudioUntrackedPaths(' M package.json\0?? src/new file.ts\0A  staged.ts\0')
    ).toEqual(['src/new file.ts']);
  });

  it('renders bounded untracked text files as live unified diffs', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-change-review-'));
    await fs.outputFile(
      path.join(workspacePath, 'src', 'new file.ts'),
      'export const ready = true;\n'
    );

    const diff = await buildStudioUntrackedFileDiffs({
      workspacePath,
      statusPorcelainZ: '?? src/new file.ts\0',
      includedPaths: ['src/new file.ts'],
    });

    expect(diff).toContain('diff --git a/src/new file.ts b/src/new file.ts');
    expect(diff).toContain('--- /dev/null');
    expect(diff).toContain('+export const ready = true;');
  });

  it('refuses paths outside the workspace and binary source bodies', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-change-boundary-'));
    await fs.writeFile(path.join(workspacePath, 'binary.bin'), Buffer.from([1, 0, 2]));

    await expect(
      buildStudioUntrackedFileDiffs({
        workspacePath,
        statusPorcelainZ: '?? binary.bin\0?? ../outside.ts\0',
      })
    ).resolves.toBe('');
  });
});
