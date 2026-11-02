import { resolveStudioWorkspaceCommandPlan } from '../core/studioWorkspaceCommand.js';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  readStudioNativeComparison,
  readStudioNativeFileChanges,
  reviewStudioNativeCheckpoint,
  rollbackStudioNativeTransaction,
} from '../core/studioNativeWorkspace.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import { hydrateStudioRepairEventFileChanges } from '../core/workspaceRepairCliClient.js';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-native-'));
  roots.push(root);
  configureStudioNativeStorage(path.join(root, 'storage'));
  const workspacePath = path.join(root, 'source');
  await fs.ensureDir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'service.ts'), 'before\n');
  const inspectedSource = new Map<string, string | null>([
    ['service.ts', crypto.createHash('sha256').update('before\n').digest('hex')],
  ]);
  const diagnostics = vi.fn(async () => ({
    ok: true,
    output: { diagnostics: [] as Array<Record<string, unknown>> },
  }));
  const inspectChanges = vi.fn(async () => ({
    ok: true,
    output: { statusExitCode: 128, diffExitCode: 129 },
  }));
  const native = createStudioNativeWorkspaceCapabilities({
    workspacePath,
    inspectedSource,
    diagnostics,
    inspectChanges,
  });
  const request = {
    workspacePath,
    transactionId: 'proposal',
    patches: [
      {
        relativePath: 'service.ts',
        patchedContent: 'after\n',
        isNewFile: false,
        hunks: [],
        status: 'pending' as const,
      },
    ],
  };
  return { root, workspacePath, native, request, diagnostics, inspectedSource };
}
describe('Workspace-native Assistant execution', () => {
  it('restores an entire request from the earliest originals, preserving unrelated user changes', async () => {
    const { workspacePath, native, request, inspectedSource } = await fixture();
    const first = await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
    });
    inspectedSource.set('service.ts', crypto.createHash('sha256').update('after\n').digest('hex'));
    await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
      patches: [{ ...request.patches[0], patchedContent: 'final\n' }],
    });
    await fs.writeFile(path.join(workspacePath, 'user.txt'), 'keep my work');
    const id = (first.output as { transactionId: string }).transactionId;
    const kept = await reviewStudioNativeCheckpoint({
      workspaceTrusted: true,
      sessionId: 'chat',
      requestIds: ['request'],
      transactionIds: [id],
      action: 'keep',
    });
    expect(kept.state).toBe('kept');
    await expect(
      reviewStudioNativeCheckpoint({
        sessionId: 'chat',
        requestIds: ['request'],
        transactionIds: [id],
        action: 'restore',
        workspaceTrusted: false,
      })
    ).rejects.toThrow('Trust the workspace');
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('final\n');
    // The host checkpoint index includes every transaction; a truncated UI history cannot omit one.
    const restored = await reviewStudioNativeCheckpoint({
      workspaceTrusted: true,
      sessionId: 'chat',
      requestIds: ['request'],
      transactionIds: [id],
      action: 'restore',
    });
    expect(restored.transactionIds).toHaveLength(2);
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
    expect(await fs.readFile(path.join(workspacePath, 'user.txt'), 'utf8')).toBe('keep my work');
  });
  it('reapplies a restored request after reload, including created and deleted files', async () => {
    const { root, workspacePath, native, request, inspectedSource } = await fixture();
    inspectedSource.set('added.ts', null);
    await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
      patches: [
        {
          ...request.patches[0],
          relativePath: 'added.ts',
          isNewFile: true,
          patchedContent: 'added\n',
        },
      ],
    });
    await fs.chmod(path.join(workspacePath, 'service.ts'), 0o755);
    const deleted = await native.deleteFiles!({
      workspacePath,
      transactionId: 'delete',
      paths: ['service.ts'],
      sessionId: 'chat',
      requestId: 'request',
    });
    const id = (deleted.output as { transactionId: string }).transactionId;
    const checkpoint = { sessionId: 'chat', requestIds: ['request'], transactionIds: [id] };
    await reviewStudioNativeCheckpoint({
      workspaceTrusted: true,
      ...checkpoint,
      action: 'restore',
    });
    expect(await fs.pathExists(path.join(workspacePath, 'added.ts'))).toBe(false);
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
    if (process.platform !== 'win32')
      expect((await fs.stat(path.join(workspacePath, 'service.ts'))).mode & 0o777).toBe(0o755);
    configureStudioNativeStorage(path.join(root, 'storage'));
    expect(
      await reviewStudioNativeCheckpoint({ workspaceTrusted: true, ...checkpoint, action: 'redo' })
    ).toMatchObject({ state: 'reapplied', transactionIds: expect.any(Array) });
    expect(await fs.readFile(path.join(workspacePath, 'added.ts'), 'utf8')).toBe('added\n');
    expect(await fs.pathExists(path.join(workspacePath, 'service.ts'))).toBe(false);
    await reviewStudioNativeCheckpoint({
      workspaceTrusted: true,
      ...checkpoint,
      action: 'restore',
    });
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
  });
  it('rejects redo if a user changed a restored file and preserves the user content', async () => {
    const { workspacePath, native, request } = await fixture();
    const applied = await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
    });
    const checkpoint = {
      sessionId: 'chat',
      requestIds: ['request'],
      transactionIds: [(applied.output as { transactionId: string }).transactionId],
    };
    await reviewStudioNativeCheckpoint({
      workspaceTrusted: true,
      ...checkpoint,
      action: 'restore',
    });
    await fs.writeFile(path.join(workspacePath, 'service.ts'), 'user change\n');
    await expect(
      reviewStudioNativeCheckpoint({ workspaceTrusted: true, ...checkpoint, action: 'redo' })
    ).rejects.toThrow('stale');
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('user change\n');
  });
  it('preserves a manual executable permission change instead of restoring over it', async () => {
    if (process.platform === 'win32') return;
    const { workspacePath, native, request } = await fixture();
    await fs.chmod(path.join(workspacePath, 'service.ts'), 0o644);
    const applied = await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
    });
    await fs.chmod(path.join(workspacePath, 'service.ts'), 0o755);
    await expect(
      reviewStudioNativeCheckpoint({
        workspaceTrusted: true,
        sessionId: 'chat',
        requestIds: ['request'],
        transactionIds: [(applied.output as { transactionId: string }).transactionId],
        action: 'restore',
      })
    ).rejects.toThrow('stale');
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('after\n');
    expect((await fs.stat(path.join(workspacePath, 'service.ts'))).mode & 0o777).toBe(0o755);
  });
  it('preflights every file before restoring a multi-file checkpoint', async () => {
    const { workspacePath, native, request, inspectedSource } = await fixture();
    inspectedSource.set('extra.ts', null);
    const result = await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
      patches: [
        ...request.patches,
        {
          ...request.patches[0],
          relativePath: 'extra.ts',
          patchedContent: 'generated\n',
          isNewFile: true,
          baseSha256: null,
        },
      ],
    });
    const id = (result.output as { transactionId: string }).transactionId;
    await fs.writeFile(path.join(workspacePath, 'extra.ts'), 'user change\n');
    await expect(
      reviewStudioNativeCheckpoint({
        workspaceTrusted: true,
        sessionId: 'chat',
        requestIds: ['request'],
        transactionIds: [id],
        action: 'restore',
      })
    ).rejects.toThrow('stale');
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('after\n');
    expect(await fs.readFile(path.join(workspacePath, 'extra.ts'), 'utf8')).toBe('user change\n');
  });

  it('rejects a foreign or stale checkpoint before touching any file', async () => {
    const { workspacePath, native, request } = await fixture();
    const result = await native.applyPatches({
      ...request,
      sessionId: 'chat',
      requestId: 'request',
    });
    const id = (result.output as { transactionId: string }).transactionId;
    await expect(
      reviewStudioNativeCheckpoint({
        workspaceTrusted: true,
        sessionId: 'other',
        requestIds: ['request'],
        transactionIds: [id],
        action: 'restore',
      })
    ).rejects.toThrow('owner');
    await fs.writeFile(path.join(workspacePath, 'service.ts'), 'user edit\n');
    await expect(
      reviewStudioNativeCheckpoint({
        workspaceTrusted: true,
        sessionId: 'chat',
        requestIds: ['request'],
        transactionIds: [id],
        action: 'restore',
      })
    ).rejects.toThrow('stale');
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('user edit\n');
  });
  it('reports real totals for full-content edits and rebuilds them on event replay', async () => {
    const { workspacePath, native, request } = await fixture();
    const result = await native.applyPatches(request);
    expect(result).toMatchObject({
      output: { fileChanges: [{ relativePath: 'service.ts', addedLines: 1, removedLines: 1 }] },
    });
    const id = (result.output as { transactionId: string }).transactionId;
    const event = { type: 'tool.completed', data: { output: { transactionId: id } } };
    const replay = await hydrateStudioRepairEventFileChanges({ workspacePath, event });
    expect(replay).toMatchObject({
      data: { output: { fileChanges: [{ addedLines: 1, removedLines: 1 }] } },
    });
    await fs.writeFile(path.join(workspacePath, 'service.ts'), 'user changed it\n');
    expect(await readStudioNativeFileChanges(workspacePath, id)).toMatchObject([
      { stale: true, addedLines: 1, removedLines: 1 },
    ]);
  });
  it('changes and reviews a folder without Git, CLI metadata, bootstrap or Goal, then safely undoes it', async () => {
    const { workspacePath, native, request } = await fixture();
    const result = await native.applyPatches(request);
    expect(result.ok).toBe(true);
    const id = (result.output as { transactionId: string }).transactionId;
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('after\n');
    expect(await fs.pathExists(path.join(workspacePath, '.workspai'))).toBe(false);
    expect(await readStudioNativeComparison(workspacePath, id, 'service.ts')).toMatchObject({
      before: 'before\n',
      after: 'after\n',
    });
    const diff = await native.inspectChanges({ workspacePath });
    expect((diff.output as { nativeDiff: string }).nativeDiff).toContain('+after');
    await rollbackStudioNativeTransaction(workspacePath, id);
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
  });
  it('reviews repeated edits as one net diff from the original source to the current file', async () => {
    const { workspacePath, native, request, inspectedSource } = await fixture();
    await native.applyPatches(request);
    inspectedSource.set('service.ts', crypto.createHash('sha256').update('after\n').digest('hex'));
    await native.applyPatches({
      ...request,
      patches: [{ ...request.patches[0], patchedContent: 'final\n' }],
    });
    const review = await native.inspectChanges({ workspacePath });
    const diff = (review.output as { nativeDiff: string }).nativeDiff;
    expect(diff).toContain('-before');
    expect(diff).toContain('+final');
    expect(diff).not.toContain('-after');
    expect(diff.match(/Index: service.ts/g)).toHaveLength(1);
  });

  it('does not inspect unrelated receipt files when reviewing a selected path', async () => {
    const { workspacePath, native, request, inspectedSource, root } = await fixture();
    inspectedSource.set('other.ts', null);
    await native.applyPatches({
      ...request,
      patches: [
        ...request.patches,
        {
          relativePath: 'other.ts',
          patchedContent: 'other',
          isNewFile: true,
          baseSha256: null,
          hunks: [],
          status: 'pending',
        },
      ],
    });
    await fs.remove(path.join(workspacePath, 'other.ts'));
    await fs.symlink(path.join(root, 'outside.ts'), path.join(workspacePath, 'other.ts'));
    const review = await native.inspectChanges({ workspacePath, paths: ['service.ts'] });
    expect((review.output as { nativeDiff: string }).nativeDiff).toContain('+after');
    expect((review.output as { nativeDiff: string }).nativeDiff).not.toContain('other.ts');
  });

  it('omits net-zero edits after a file is restored to its original content', async () => {
    const { workspacePath, native, request, inspectedSource } = await fixture();
    await native.applyPatches(request);
    inspectedSource.set('service.ts', crypto.createHash('sha256').update('after\n').digest('hex'));
    await native.applyPatches({
      ...request,
      patches: [{ ...request.patches[0], patchedContent: 'before\n' }],
    });
    const review = await native.inspectChanges({ workspacePath });
    expect((review.output as { nativeDiff: string }).nativeDiff).toBe('');
  });

  it('rejects aliased duplicate targets before any source write', async () => {
    const { workspacePath, native, request } = await fixture();
    await expect(
      native.applyPatches({
        ...request,
        patches: [
          ...request.patches,
          { ...request.patches[0], relativePath: './service.ts', patchedContent: 'different' },
        ],
      })
    ).rejects.toThrow('same file');
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
  });

  it('runs a real project-native command without a CLI Goal or workspace metadata', async () => {
    const { workspacePath, native } = await fixture();
    await fs.writeFile(path.join(workspacePath, 'check.cjs'), 'console.log(21 * 2);');
    const request = {
      executable: 'node',
      args: ['check.cjs'],
      purpose: 'test' as const,
    };
    const plan = resolveStudioWorkspaceCommandPlan({ workspacePath, request });
    const result = await native.runWorkspaceCommand!({
      workspacePath,
      request,
      approval: {
        fingerprint: plan.authorizationFingerprint,
        approvedBy: 'test:user',
        approvedAt: new Date().toISOString(),
      },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({ stdout: expect.stringContaining('42'), exitCode: 0 });
    expect(await fs.pathExists(path.join(workspacePath, '.workspai'))).toBe(false);
  });

  it('restores a deleted file and its executable permission through native Undo', async () => {
    const { workspacePath, native } = await fixture();
    await fs.chmod(path.join(workspacePath, 'service.ts'), 0o755);
    const result = await native.deleteFiles!({
      workspacePath,
      transactionId: 'delete',
      paths: ['service.ts'],
    });
    expect(await fs.pathExists(path.join(workspacePath, 'service.ts'))).toBe(false);
    const id = (result.output as { transactionId: string }).transactionId;
    await rollbackStudioNativeTransaction(workspacePath, id);
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
    if (process.platform !== 'win32')
      expect((await fs.stat(path.join(workspacePath, 'service.ts'))).mode & 0o777).toBe(0o755);
  });

  it('retains an exact native review after resuming with a compacted event history', async () => {
    const { workspacePath, native, request, inspectedSource, diagnostics } = await fixture();
    const result = await native.applyPatches(request);
    const id = (result.output as { transactionId: string }).transactionId;
    const resumed = createStudioNativeWorkspaceCapabilities({
      workspacePath,
      inspectedSource,
      diagnostics,
      inspectChanges: async () => ({ ok: true }),
      transactionIds: [id],
    });
    const review = await resumed.inspectChanges({ workspacePath });
    expect((review.output as { nativeDiff: string }).nativeDiff).toContain('-before');
    expect((review.output as { nativeDiff: string }).nativeDiff).toContain('+after');
  });

  it('refuses stale edits and refuses Undo over a later user edit', async () => {
    const { workspacePath, native, request } = await fixture();
    const result = await native.applyPatches(request);
    const id = (result.output as { transactionId: string }).transactionId;
    await fs.writeFile(path.join(workspacePath, 'service.ts'), 'user edit\n');
    await expect(native.applyPatches(request)).rejects.toThrow('changed after inspection');
    await expect(rollbackStudioNativeTransaction(workspacePath, id)).rejects.toThrow(
      'changed since inspection'
    );
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('user edit\n');
  });
  it('does not write any file when another target fails preflight', async () => {
    const { workspacePath, native, request, inspectedSource } = await fixture();
    inspectedSource.set('settings.json', null);
    await expect(
      native.applyPatches({
        ...request,
        patches: [
          ...request.patches,
          {
            relativePath: 'settings.json',
            patchedContent: '{broken',
            isNewFile: true,
            baseSha256: null,
            hunks: [],
            status: 'pending',
          },
        ],
      })
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
  });
  it('keeps pre-existing diagnostics visible while rejecting newly introduced errors', async () => {
    const { workspacePath, diagnostics, inspectedSource } = await fixture();
    const old = { path: 'old.ts', severity: 'error', message: 'Existing error' };
    diagnostics.mockResolvedValue({ ok: true, output: { diagnostics: [old] } });
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath,
      inspectedSource,
      diagnostics,
      inspectChanges: async () => ({ ok: true }),
    });
    await Promise.resolve();
    diagnostics.mockResolvedValue({ ok: true, output: { diagnostics: [{ ...old, line: 20 }] } });
    expect(await native.verify({ workspacePath })).toMatchObject({
      ok: true,
      output: { preExistingErrorCount: 1 },
    });
    diagnostics.mockResolvedValue({
      ok: true,
      output: { diagnostics: [old, { path: 'new.ts', severity: 'error', message: 'New error' }] },
    });
    expect(await native.verify({ workspacePath })).toMatchObject({ ok: false, cardBlocking: true });
  });
  it('runs the real session loop with native mutation, final diff and native verification without fabricating CLI closure', async () => {
    const { workspacePath, native, request } = await fixture();
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: native as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    });
    expect(registry.get('run-governed-command')).toBeUndefined();
    expect(registry.get('verify-goal')).toBeUndefined();
    const actions: StudioAgentModelAction[] = [
      {
        type: 'tool',
        toolName: 'apply-workspace-patch',
        input: { patches: request.patches },
        reason: 'Update the service',
      },
      { type: 'tool', toolName: 'inspect-workspace-changes', input: {}, reason: 'Review result' },
      { type: 'tool', toolName: 'verify-blocker', input: {}, reason: 'Check current diagnostics' },
      {
        type: 'complete',
        summary: 'Updated the service and reviewed native diagnostics. No project tests were run.',
      },
    ];
    const result = await new StudioAgentSession(
      {
        workspacePath,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        workspaceTrusted: true,
        permissionLevel: 'autopilot',
        requiresVerifiedCompletion: true,
      },
      {
        next: async () => {
          const action = actions.shift();
          if (!action) throw new Error('Unexpected model turn');
          return action;
        },
      },
      registry,
      { save: async () => {} }
    ).run('Update the service');
    expect(result.status).toBe('completed');
    expect(result.nativeTransactionIds).toEqual([expect.stringMatching(/^native-/)]);
    expect(
      result.events.find((event) => event.type === 'session.completed')?.data.verificationAuthority
    ).toBe('workspace-evidence');
    expect(result.completionObligations?.canonicalClosureRequiredAfterSequence).toBeUndefined();
    expect(await fs.pathExists(path.join(workspacePath, '.workspai'))).toBe(false);
  });
});
