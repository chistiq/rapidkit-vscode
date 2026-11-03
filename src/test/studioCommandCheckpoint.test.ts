import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  reviewStudioNativeCheckpoint,
  readStudioNativeComparison,
} from '../core/studioNativeWorkspace.js';
import { executeStudioWorkspaceCommandTransaction } from '../core/studioWorkspaceCommandTransaction.js';
import { resolveStudioWorkspaceCommandPlan } from '../core/studioWorkspaceCommand.js';
import {
  captureStudioWorkspaceSourceSnapshot,
  beginStudioWorkspaceSourceTransaction,
} from '../core/studioWorkspaceSourceSnapshot.js';
import {
  buildStudioUntrackedFileDiffs,
  filterStudioSourceDiff,
} from '../core/studioWorkspaceChangeReview.js';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../core/studioWorkspaceCommand.js', async (original) => ({
  ...(await original<object>()),
  runStudioWorkspaceCommand: execute,
}));
let root: string, workspacePath: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'command-receipt-'));
  workspacePath = path.join(root, 'source');
  await fs.ensureDir(workspacePath);
  configureStudioNativeStorage(path.join(root, 'private'));
  execute.mockImplementation(async () => ({
    command: 'npm install',
    cwd: workspacePath,
    exitCode: 0,
    stdout: 'done',
    stderr: '',
    timedOut: false,
  }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  execute.mockReset();
  await fs.remove(root);
});
function request() {
  const request = { executable: 'npm', args: ['install'], purpose: 'dependency' as const };
  const plan = resolveStudioWorkspaceCommandPlan({ workspacePath, request });
  return {
    workspacePath,
    request,
    sessionId: 'chat',
    requestId: 'request',
    approval: {
      fingerprint: plan.authorizationFingerprint,
      approvedBy: 'fixture',
      approvedAt: new Date().toISOString(),
      execution: 'once' as const,
    },
  };
}
describe('Command-produced request checkpoints', () => {
  it('does not treat approval for an external effect as a declaration of source writes', async () => {
    await fs.writeFile(path.join(workspacePath, 'old.txt'), 'original');
    execute.mockImplementationOnce(async () => {
      await fs.writeFile(path.join(workspacePath, 'old.txt'), 'unexpected');
      return { exitCode: 0, stdout: 'external tool returned', stderr: '' };
    });
    const request = {
      executable: 'kubectl',
      args: ['apply', '-f', 'deployment.yaml'],
      purpose: 'build' as const,
    };
    const plan = resolveStudioWorkspaceCommandPlan({ workspacePath, request });
    const result = await executeStudioWorkspaceCommandTransaction({
      workspacePath,
      request,
      approval: {
        fingerprint: plan.authorizationFingerprint,
        approvedBy: 'fixture',
        approvedAt: new Date().toISOString(),
      },
    });
    expect(result).toMatchObject({
      ok: false,
      changed: false,
      terminalReason: 'workspace-command-source-restored-non-source-effects-unverified',
      output: { exitCode: 0, rollback: { reason: 'unapproved-mutation' } },
    });
    expect(result.output?.sourceRecovery).toBeUndefined();
    expect(await fs.readFile(path.join(workspacePath, 'old.txt'), 'utf8')).toBe('original');
  });
  it.skipIf(process.platform === 'win32')(
    'includes ignored local source and detects permission-only command changes',
    async () => {
      const file = path.join(workspacePath, 'local.txt');
      await fs.writeFile(file, 'unchanged bytes');
      await fs.chmod(file, 0o644);
      await fs.writeFile(path.join(workspacePath, '.gitignore'), '.env\n');
      await fs.writeFile(path.join(workspacePath, '.env'), 'LOCAL=before');
      const before = await captureStudioWorkspaceSourceSnapshot({ workspacePath });
      expect(before?.files['.env']).toBeTruthy();
      execute.mockImplementationOnce(async () => {
        await fs.chmod(file, 0o755);
        return { exitCode: 0, stdout: 'mode changed', stderr: '' };
      });
      const native = createStudioNativeWorkspaceCapabilities({
        workspacePath,
        inspectedSource: new Map(),
        diagnostics: async () => ({ ok: true }),
        inspectChanges: async () => ({ ok: true }),
      });
      const result = await native.runWorkspaceCommand(request());
      expect(result).toMatchObject({
        ok: true,
        changed: true,
        output: { changedPaths: ['local.txt'] },
      });
      await reviewStudioNativeCheckpoint({
        sessionId: 'chat',
        requestIds: ['request'],
        transactionIds: [],
        workspaceTrusted: true,
        action: 'restore',
      });
      expect((await fs.stat(file)).mode & 0o777).toBe(0o644);
      expect(await fs.readFile(path.join(workspacePath, '.env'), 'utf8')).toBe('LOCAL=before');
    }
  );
  it('retains generated text, binary, deleted and sensitive files for exact Restore/Redo without exposing private bodies', async () => {
    await fs.writeFile(path.join(workspacePath, 'old.txt'), 'old\n');
    execute.mockImplementationOnce(async () => {
      await fs.remove(path.join(workspacePath, 'old.txt'));
      await fs.writeFile(path.join(workspacePath, 'new.txt'), 'one\ntwo\n');
      await fs.writeFile(path.join(workspacePath, 'image.bin'), Buffer.from([0, 255, 12]));
      await fs.writeFile(path.join(workspacePath, '.env'), 'TOKEN=private-checkpoint-value');
      return { exitCode: 0, stdout: 'created', stderr: '', timedOut: false };
    });
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath,
      inspectedSource: new Map(),
      diagnostics: async () => ({ ok: true }),
      inspectChanges: async () => ({ ok: true }),
    });
    const result = await native.runWorkspaceCommand(request());
    expect(result).toMatchObject({ ok: true, changed: true });
    const output = result.output as {
      transaction: { transactionId: string };
      fileChanges: Array<{ relativePath: string; addedLines: number }>;
    };
    expect(output.fileChanges).toHaveLength(4);
    expect(JSON.stringify(output)).not.toContain('private-checkpoint-value');
    expect(output.fileChanges.find((f) => f.relativePath === 'new.txt')).toMatchObject({
      addedLines: 2,
    });
    await expect(
      readStudioNativeComparison(workspacePath, output.transaction.transactionId, '.env')
    ).rejects.toThrow();
    const checkpoint = {
      sessionId: 'chat',
      requestIds: ['request'],
      transactionIds: [],
      workspaceTrusted: true,
    };
    await expect(
      reviewStudioNativeCheckpoint({ ...checkpoint, sessionId: 'other', action: 'restore' })
    ).rejects.toThrow();
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'restore' });
    expect(await fs.readFile(path.join(workspacePath, 'old.txt'), 'utf8')).toBe('old\n');
    expect(await fs.pathExists(path.join(workspacePath, 'new.txt'))).toBe(false);
    expect(await fs.pathExists(path.join(workspacePath, '.env'))).toBe(false);
    await reviewStudioNativeCheckpoint({ ...checkpoint, action: 'redo' });
    expect(await fs.readFile(path.join(workspacePath, 'image.bin'))).toEqual(
      Buffer.from([0, 255, 12])
    );
    expect(await fs.readFile(path.join(workspacePath, '.env'), 'utf8')).toBe(
      'TOKEN=private-checkpoint-value'
    );
  });
  it('returns the execution receipt and restores source when durable retention fails', async () => {
    execute.mockImplementationOnce(async () => {
      await fs.writeFile(path.join(workspacePath, 'new.txt'), 'created');
      return { exitCode: 0, stdout: 'executed once', stderr: '' };
    });
    const result = await executeStudioWorkspaceCommandTransaction({
      ...request(),
      retainSourceChanges: async () => {
        throw new Error('store full');
      },
    });
    expect(result).toMatchObject({
      ok: false,
      changed: false,
      terminalReason: 'workspace-command-retention-failed-source-restored',
      output: { exitCode: 0, stdout: 'executed once' },
    });
    expect(await fs.pathExists(path.join(workspacePath, 'new.txt'))).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  });
  it('preserves concurrent edits and the recovery backup when retention and rollback cannot complete', async () => {
    await fs.writeFile(path.join(workspacePath, 'old.txt'), 'original');
    execute.mockImplementationOnce(async () => {
      await fs.writeFile(path.join(workspacePath, 'old.txt'), 'command');
      return { exitCode: 0, stdout: 'executed once', stderr: '' };
    });
    const result = await executeStudioWorkspaceCommandTransaction({
      ...request(),
      retainSourceChanges: async () => {
        await fs.writeFile(path.join(workspacePath, 'old.txt'), 'user edit');
        throw new Error('store full');
      },
    });
    expect(result).toMatchObject({
      ok: false,
      changed: true,
      requiresUserDecision: true,
      terminalReason: 'workspace-command-retention-failed-recovery-required',
      output: { exitCode: 0, stdout: 'executed once' },
    });
    expect(await fs.readFile(path.join(workspacePath, 'old.txt'), 'utf8')).toBe('user edit');
    const backup = (result.output as { recoveryCheckpoint: { backupPath: string } })
      .recoveryCheckpoint.backupPath;
    expect(await fs.readFile(path.join(backup, 'old.txt'), 'utf8')).toBe('original');
    await fs.remove(backup);
  });
  it('refuses incomplete or moving source baselines before starting a command', async () => {
    await fs.writeFile(path.join(workspacePath, 'large.bin'), Buffer.alloc(16 * 1024 * 1024 + 1));
    expect(await captureStudioWorkspaceSourceSnapshot({ workspacePath })).toBeUndefined();
    expect(await beginStudioWorkspaceSourceTransaction({ workspacePath })).toBeUndefined();
    const result = await executeStudioWorkspaceCommandTransaction(request());
    expect(result.terminalReason).toBeUndefined();
    expect(result).toMatchObject({
      ok: false,
      changed: false,
      output: {
        executed: false,
        checkpointFailure: { code: 'file-size-limit' },
        recovery: { kind: 'source-scope' },
      },
    });
    expect(execute).not.toHaveBeenCalled();
    await fs.remove(path.join(workspacePath, 'large.bin'));
    await fs.writeFile(path.join(workspacePath, 'moving.txt'), 'before');
    const copy = fs.copyFile.bind(fs);
    vi.spyOn(fs, 'copyFile').mockImplementation(async (...args: Parameters<typeof fs.copyFile>) => {
      await fs.writeFile(path.join(workspacePath, 'moving.txt'), 'concurrent');
      return copy(...args);
    });
    await expect(beginStudioWorkspaceSourceTransaction({ workspacePath })).rejects.toThrow(
      'changed while'
    );
    expect(await fs.readFile(path.join(workspacePath, 'moving.txt'), 'utf8')).toBe('concurrent');
  });
  it('excludes sensitive bodies from tracked and untracked model-facing diffs', async () => {
    await fs.writeFile(path.join(workspacePath, '.env'), 'SECRET=hidden');
    await fs.writeFile(path.join(workspacePath, 'safe.ts'), 'source');
    const untracked = await buildStudioUntrackedFileDiffs({
      workspacePath,
      statusPorcelainZ: '?? .env\0?? safe.ts\0',
    });
    expect(untracked).toContain('+source');
    expect(untracked).not.toContain('hidden');
    const diff =
      'diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n+SECRET=hidden\ndiff --git a/safe.ts b/safe.ts\n--- a/safe.ts\n+++ b/safe.ts\n+source\n';
    expect(filterStudioSourceDiff(diff)).toContain('+source');
    expect(filterStudioSourceDiff(diff)).not.toContain('hidden');
  });
});
