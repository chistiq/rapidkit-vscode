import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

// Mock vscode so patchApplyEngine (via WorkspaceUsageTracker) can be imported
vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      hide: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
  workspace: {
    workspaceFolders: undefined,
    getWorkspaceFolder: () => undefined,
  },
}));

import {
  extractPatchesFromAiResponse,
  normalizePatchesForWorkspaceScope,
  applyPatches,
  rollbackAppliedPatches,
  parseLogTrace,
  type FilePatch,
  type PatchApplyDeps,
} from '../../src/core/patchApplyEngine';

// ─── extractPatchesFromAiResponse ────────────────────────────────────────────

describe('extractPatchesFromAiResponse', () => {
  const opts = { actionId: 'test-action', workspacePath: '/workspace' };

  it('extracts a single fenced block with fence header path', () => {
    const text = ['```typescript path: src/foo.ts', 'export const foo = 1;', '```'].join('\n');

    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches).toHaveLength(1);
    expect(patches[0].relativePath).toBe('src/foo.ts');
    expect(patches[0].language).toBe('typescript');
    expect(patches[0].patchedContent).toContain('export const foo = 1;');
    expect(patches[0].status).toBe('pending');
  });

  it('extracts a block with inline // path: comment', () => {
    const text = ['```python', '// path: app/main.py', 'print("hello")', '```'].join('\n');

    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches).toHaveLength(1);
    expect(patches[0].relativePath).toBe('app/main.py');
    expect(patches[0].language).toBe('python');
  });

  it('extracts multiple files and deduplicates by last occurrence', () => {
    const text = [
      '```typescript path: src/a.ts',
      'const a = 1;',
      '```',
      '',
      '```typescript path: src/b.ts',
      'const b = 2;',
      '```',
      '',
      '```typescript path: src/a.ts',
      'const a = 99;',
      '```',
    ].join('\n');

    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches).toHaveLength(2);
    const aFile = patches.find((p) => p.relativePath === 'src/a.ts');
    expect(aFile?.patchedContent).toContain('const a = 99;');
  });

  it('skips blocks without a discernible file path', () => {
    const text = ['```typescript', 'no path here', '```'].join('\n');
    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches).toHaveLength(0);
  });

  it('prevents path traversal outside workspace', () => {
    const text = ['```typescript path: ../../etc/passwd', 'hack', '```'].join('\n');

    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches).toHaveLength(0);
  });

  it('rejects absolute sibling paths that only share a workspace prefix', () => {
    const text = ['```typescript path: /workspace2/src/escape.ts', 'hack', '```'].join('\n');

    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches).toHaveLength(0);
  });

  it('produces one hunk per file', () => {
    const text = ['```ts path: src/x.ts', 'const x = 1;', '```'].join('\n');
    const patches = extractPatchesFromAiResponse(text, opts);
    expect(patches[0].hunks).toHaveLength(1);
    expect(patches[0].hunks[0].startLine).toBe(1);
  });
});

describe('normalizePatchesForWorkspaceScope', () => {
  function patch(relativePath: string): FilePatch {
    return {
      relativePath,
      language: 'text',
      isNewFile: false,
      patchedContent: 'x',
      hunks: [{ startLine: 1, removedLines: [], addedLines: ['x'] }],
      status: 'pending',
    };
  }

  it('converts project-relative AI patch paths to workspace-relative paths', () => {
    const patches = normalizePatchesForWorkspaceScope({
      workspacePath: '/workspace',
      projectPath: '/workspace/fastapi-service',
      patches: [patch('.gitignore'), patch('src/main.py')],
    });

    expect(patches.map((entry) => entry.relativePath)).toEqual([
      'fastapi-service/.gitignore',
      'fastapi-service/src/main.py',
    ]);
  });

  it('preserves workspace-relative patch paths that already point at the project', () => {
    const patches = normalizePatchesForWorkspaceScope({
      workspacePath: '/workspace',
      projectPath: '/workspace/fastapi-service',
      patches: [patch('fastapi-service/.gitignore')],
    });

    expect(patches[0].relativePath).toBe('fastapi-service/.gitignore');
  });

  it('normalizes absolute patch paths inside the workspace', () => {
    const patches = normalizePatchesForWorkspaceScope({
      workspacePath: '/workspace',
      projectPath: '/workspace/fastapi-service',
      patches: [patch('/workspace/fastapi-service/Makefile')],
    });

    expect(patches[0].relativePath).toBe('fastapi-service/Makefile');
  });

  it('deduplicates patches that normalize to the same workspace path by last occurrence', () => {
    const first = patch('.gitignore');
    first.patchedContent = 'first';
    const second = patch('fastapi-service/.gitignore');
    second.patchedContent = 'second';

    const patches = normalizePatchesForWorkspaceScope({
      workspacePath: '/workspace',
      projectPath: '/workspace/fastapi-service',
      patches: [first, second],
    });

    expect(patches).toHaveLength(1);
    expect(patches[0].relativePath).toBe('fastapi-service/.gitignore');
    expect(patches[0].patchedContent).toBe('second');
  });
});

// ─── applyPatches ─────────────────────────────────────────────────────────────

describe('applyPatches', () => {
  function makeDeps(
    existingFiles: Record<string, string | null> = {},
    written: Record<string, string> = {}
  ): PatchApplyDeps {
    const telemetry = {
      trackCommandEvent: vi.fn().mockResolvedValue(undefined),
    };
    const commandRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'main', stderr: '' });
    return {
      readFile: async (p: string) => existingFiles[p] ?? null,
      writeFile: async (p: string, content: string) => {
        written[p] = content;
      },
      commandRunner,
      telemetry,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      patchId: () => 'fixed-patch-id',
    };
  }

  function makePatch(relativePath: string, content: string): FilePatch {
    return {
      relativePath,
      language: 'typescript',
      isNewFile: false,
      patchedContent: content,
      hunks: [{ startLine: 1, removedLines: [], addedLines: [content] }],
      status: 'pending',
    };
  }

  it('applies accepted patches and returns correct counts', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({}, written);

    const result = await applyPatches(
      {
        actionId: 'act-1',
        workspacePath: '/workspace',
        patches: [makePatch('src/a.ts', 'const a = 1;'), makePatch('src/b.ts', 'const b = 2;')],
      },
      deps
    );

    expect(result.appliedCount).toBe(2);
    expect(result.rejectedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(written['/workspace/src/a.ts']).toBe('const a = 1;');
    expect(written['/workspace/src/b.ts']).toBe('const b = 2;');
  });

  it('respects acceptedPaths filter', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({}, written);

    const result = await applyPatches(
      {
        actionId: 'act-2',
        workspacePath: '/workspace',
        patches: [makePatch('src/a.ts', 'const a = 1;'), makePatch('src/b.ts', 'const b = 2;')],
        acceptedPaths: ['src/a.ts'],
      },
      deps
    );

    expect(result.appliedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(written['/workspace/src/a.ts']).toBe('const a = 1;');
    expect(written['/workspace/src/b.ts']).toBeUndefined();
  });

  it('marks patch as isNewFile when original not found', async () => {
    const deps = makeDeps({}, {});

    const result = await applyPatches(
      {
        actionId: 'act-3',
        workspacePath: '/workspace',
        patches: [makePatch('src/new.ts', 'export {}')],
      },
      deps
    );

    const newPatch = result.patches.find((p) => p.relativePath === 'src/new.ts');
    expect(newPatch?.isNewFile).toBe(true);
  });

  it('marks patch as failed when writeFile throws', async () => {
    const deps: PatchApplyDeps = {
      readFile: async () => null,
      writeFile: async () => {
        throw new Error('disk full');
      },
      telemetry: { trackCommandEvent: vi.fn().mockResolvedValue(undefined) },
      commandRunner: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      now: () => new Date(),
      patchId: () => 'x',
    };

    const result = await applyPatches(
      {
        actionId: 'act-4',
        workspacePath: '/workspace',
        patches: [makePatch('src/z.ts', 'const z = 1;')],
      },
      deps
    );

    expect(result.failedCount).toBe(1);
    expect(result.patches[0].status).toBe('failed');
    expect(result.patches[0].failReason).toContain('disk full');
  });

  it('rejects stale AI patches before any workspace write', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({ '/workspace/src/value.ts': 'const value = 2;' }, written);
    const result = await applyPatches(
      {
        actionId: 'stale-source',
        workspacePath: '/workspace',
        patches: [makePatch('src/value.ts', 'const value = 3;')],
        expectedBaseSha256: {
          'src/value.ts': crypto.createHash('sha256').update('const value = 1;').digest('hex'),
        },
      },
      deps
    );

    expect(result.appliedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.patches[0].failReason).toContain('Source changed after AI grounding');
    expect(written).toEqual({});
  });

  it('rejects malformed JSON before mutating any transaction target', async () => {
    const written: Record<string, string> = {};
    const result = await applyPatches(
      {
        actionId: 'invalid-json',
        workspacePath: '/workspace',
        patches: [makePatch('config.json', '{broken'), makePatch('src/a.ts', 'new-a')],
      },
      makeDeps({}, written)
    );

    expect(result.appliedCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(result.patches[0].failReason).toContain('Invalid JSON patch');
    expect(written).toEqual({});
  });

  it('rolls back prior files when a later write fails', async () => {
    const state: Record<string, string | null> = {
      '/workspace/src/a.ts': 'old-a',
      '/workspace/src/b.ts': 'old-b',
    };
    let failedOnce = false;
    const result = await applyPatches(
      {
        actionId: 'transactional-write',
        workspacePath: '/workspace',
        patches: [makePatch('src/a.ts', 'new-a'), makePatch('src/b.ts', 'new-b')],
      },
      {
        readFile: async (filePath) => state[filePath] ?? null,
        writeFile: async (filePath, content) => {
          if (filePath.endsWith('/b.ts') && content === 'new-b' && !failedOnce) {
            failedOnce = true;
            throw new Error('disk full');
          }
          state[filePath] = content;
        },
        deleteFile: async (filePath) => {
          state[filePath] = null;
        },
        telemetry: { trackCommandEvent: vi.fn().mockResolvedValue(undefined) },
        commandRunner: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      }
    );

    expect(result.appliedCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(state['/workspace/src/a.ts']).toBe('old-a');
    expect(state['/workspace/src/b.ts']).toBe('old-b');
  });

  it('rolls back an applied AI patch only while its written content is unchanged', async () => {
    const state: Record<string, string | null> = { '/workspace/src/a.ts': 'new-a' };
    const appliedPatch = {
      ...makePatch('src/a.ts', 'new-a'),
      originalContent: 'old-a',
      status: 'applied' as const,
    };
    const deps = {
      readFile: async (filePath: string) => state[filePath] ?? null,
      writeFile: async (filePath: string, content: string) => {
        state[filePath] = content;
      },
      deleteFile: async (filePath: string) => {
        state[filePath] = null;
      },
    };

    expect(
      await rollbackAppliedPatches({ workspacePath: '/workspace', patches: [appliedPatch] }, deps)
    ).toMatchObject({ ok: true, restoredPaths: ['src/a.ts'] });
    expect(state['/workspace/src/a.ts']).toBe('old-a');

    state['/workspace/src/a.ts'] = 'user-edit';
    expect(
      await rollbackAppliedPatches({ workspacePath: '/workspace', patches: [appliedPatch] }, deps)
    ).toMatchObject({ ok: false, restoredPaths: [] });
    expect(state['/workspace/src/a.ts']).toBe('user-edit');
  });

  it('restores an inspected delete transaction only while the target remains absent', async () => {
    const state: Record<string, string | null> = { '/workspace/src/old.ts': null };
    const deletedPatch = {
      ...makePatch('src/old.ts', ''),
      operation: 'delete' as const,
      originalContent: 'export const old = true;',
      status: 'applied' as const,
    };
    const deps = {
      readFile: async (filePath: string) => state[filePath] ?? null,
      writeFile: async (filePath: string, content: string) => {
        state[filePath] = content;
      },
      deleteFile: async (filePath: string) => {
        state[filePath] = null;
      },
    };

    expect(
      await rollbackAppliedPatches({ workspacePath: '/workspace', patches: [deletedPatch] }, deps)
    ).toMatchObject({ ok: true, restoredPaths: ['src/old.ts'] });
    expect(state['/workspace/src/old.ts']).toBe('export const old = true;');

    state['/workspace/src/old.ts'] = 'a user recreated this file';
    expect(
      await rollbackAppliedPatches({ workspacePath: '/workspace', patches: [deletedPatch] }, deps)
    ).toMatchObject({ ok: false, restoredPaths: [] });
  });

  it('refuses to apply patches outside the workspace boundary', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({}, written);

    const result = await applyPatches(
      {
        actionId: 'act-boundary',
        workspacePath: '/workspace',
        patches: [makePatch('/workspace2/src/escape.ts', 'const escape = true;')],
      },
      deps
    );

    expect(result.appliedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.patches[0].status).toBe('failed');
    expect(result.patches[0].failReason).toContain('outside workspace boundary');
    expect(Object.keys(written)).toHaveLength(0);
  });

  it('refuses production writes through a symlink outside the workspace', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-patch-symlink-'));
    const outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-patch-outside-'));
    await fs.symlink(outsidePath, path.join(workspacePath, 'linked'), 'dir');
    try {
      const result = await applyPatches({
        actionId: 'symlink-boundary',
        workspacePath,
        patches: [makePatch('linked/escape.txt', 'blocked')],
      });
      expect(result.appliedCount).toBe(0);
      expect(result.patches[0].failReason).toContain('symbolic link');
      await expect(fs.readFile(path.join(outsidePath, 'escape.txt'), 'utf8')).rejects.toThrow();
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
      await fs.rm(outsidePath, { recursive: true, force: true });
    }
  });

  it('creates a branch when branchSafeApply is true and git succeeds', async () => {
    const deps = makeDeps({}, {});
    const result = await applyPatches(
      {
        actionId: 'my-action',
        workspacePath: '/workspace',
        patches: [makePatch('src/x.ts', 'const x = 1;')],
        branchSafeApply: true,
      },
      deps
    );

    expect(result.branchCreated).toBe('workspai/apply-my-action');
  });

  it('fails closed without writes when required branch isolation fails', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({}, written);
    (deps.commandRunner as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'not a git repo',
    });

    const result = await applyPatches(
      {
        actionId: 'act-5',
        workspacePath: '/workspace',
        patches: [makePatch('src/x.ts', 'x')],
        branchSafeApply: true,
      },
      deps
    );

    expect(result.branchCreated).toBeUndefined();
    expect(result.appliedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(Object.keys(written)).toHaveLength(0);
  });

  it('sets patchId and generatedAt in result', async () => {
    const deps = makeDeps({}, {});
    const result = await applyPatches(
      {
        actionId: 'act-6',
        workspacePath: '/workspace',
        patches: [],
      },
      deps
    );

    expect(result.patchId).toBe('fixed-patch-id');
    expect(result.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ─── parseLogTrace ───────────────────────────────────────────────────────────

describe('parseLogTrace', () => {
  it('detects Python tracebacks', () => {
    const text = [
      'Traceback (most recent call last):',
      '  File "app/main.py", line 42, in run',
      '    foo()',
      '  File "app/foo.py", line 10, in foo',
      '    raise ValueError("bad")',
      'ValueError: bad',
    ].join('\n');

    const trace = parseLogTrace(text);
    expect(trace.language).toBe('python');
    expect(trace.errorType).toBe('ValueError');
    expect(trace.errorMessage).toBe('bad');
    expect(trace.frames).toHaveLength(2);
    expect(trace.frames[0].file).toBe('app/main.py');
    expect(trace.frames[0].line).toBe(42);
    expect(trace.frames[0].symbol).toBe('run');
    expect(trace.relatedFiles).toContain('app/main.py');
    expect(trace.relatedFiles).toContain('app/foo.py');
  });

  it('detects Node.js stack traces', () => {
    const text = [
      'TypeError: Cannot read properties of undefined',
      '    at someFunc (src/index.ts:10:5)',
      '    at Object.<anonymous> (src/app.ts:20:3)',
    ].join('\n');

    const trace = parseLogTrace(text);
    expect(trace.language).toBe('node');
    expect(trace.errorType).toBe('TypeError');
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(trace.frames[0].file).toBe('src/index.ts');
    expect(trace.frames[0].line).toBe(10);
  });

  it('detects Java stack traces', () => {
    const text = [
      'java.lang.NullPointerException: null',
      '\tat com.example.Foo.bar(Foo.java:42)',
      '\tat com.example.Main.main(Main.java:10)',
    ].join('\n');

    const trace = parseLogTrace(text);
    expect(trace.language).toBe('java');
    expect(trace.frames).toHaveLength(2);
    expect(trace.frames[0].line).toBe(42);
  });

  it('handles unknown/empty text gracefully', () => {
    const trace = parseLogTrace('Some random log line with no traceback');
    expect(trace.language).toBe('unknown');
    expect(trace.frames).toHaveLength(0);
    expect(trace.relatedFiles).toHaveLength(0);
  });

  it('skips node internal frames', () => {
    const text = [
      'Error: test',
      '    at internal (node:internal/modules/cjs/loader:1000:10)',
      '    at realCode (src/app.ts:5:1)',
    ].join('\n');

    const trace = parseLogTrace(text);
    const nodeFrames = trace.frames.filter((f) => f.file?.startsWith('node:'));
    expect(nodeFrames).toHaveLength(0);
    expect(trace.frames).toHaveLength(1);
    expect(trace.frames[0].file).toBe('src/app.ts');
  });
});
