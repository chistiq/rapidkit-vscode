import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executions = vi.hoisted(() => ({
  queue: [] as Array<{
    exitCode: number;
    stdout?: string;
    stderr?: string;
  }>,
}));

vi.mock('../core/studioWorkspaceCommand.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/studioWorkspaceCommand.js')>();
  return {
    ...original,
    runStudioWorkspaceCommand: vi.fn(async (plan) => {
      const next = executions.queue.shift() ?? { exitCode: 0 };
      return {
        ...plan,
        stdout: next.stdout ?? '',
        stderr: next.stderr ?? '',
        exitCode: next.exitCode,
        timedOut: false,
      };
    }),
  };
});

import { completeStudioDependencyTransactions } from '../core/studioDependencyTransaction.js';

const roots: string[] = [];

async function projectFixture(): Promise<{
  workspacePath: string;
  projectPath: string;
}> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-dependency-tx-'));
  roots.push(workspacePath);
  const projectPath = path.join(workspacePath, 'web');
  await fs.ensureDir(projectPath);
  await fs.writeJson(path.join(projectPath, 'package.json'), {
    name: 'web',
    scripts: { test: 'vitest run', build: 'vite build' },
    dependencies: { next: '16.2.10' },
  });
  await fs.writeJson(path.join(projectPath, 'package-lock.json'), { lockfileVersion: 3 });
  return { workspacePath, projectPath };
}

beforeEach(() => {
  executions.queue.splice(0);
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio dependency repair transaction', () => {
  it('discovers a changed manifest without depending on stale Doctor evidence', async () => {
    const { workspacePath, projectPath } = await projectFixture();
    executions.queue.push(
      { exitCode: 0 },
      { exitCode: 0, stdout: JSON.stringify({ vulnerabilities: {} }) },
      { exitCode: 0 },
      { exitCode: 0 }
    );

    const transaction = await completeStudioDependencyTransactions({
      workspacePath,
      changedPaths: ['web/package.json'],
    });

    expect(transaction).toMatchObject({
      state: 'closed',
      closureReady: true,
      projects: [
        {
          projectName: 'web',
          projectPath,
          state: 'closed',
          stages: [
            { id: 'reconcile', status: 'passed' },
            { id: 'audit', status: 'passed' },
            { id: 'test', status: 'passed' },
            { id: 'build', status: 'passed' },
          ],
        },
      ],
    });
  });

  it('uses the active project scope when the model requests transaction closure directly', async () => {
    const { workspacePath, projectPath } = await projectFixture();
    executions.queue.push(
      { exitCode: 0 },
      { exitCode: 0, stdout: JSON.stringify({ vulnerabilities: {} }) },
      { exitCode: 0 },
      { exitCode: 0 }
    );

    const transaction = await completeStudioDependencyTransactions({
      workspacePath,
      projectPath,
    });

    expect(transaction).toMatchObject({
      state: 'closed',
      closureReady: true,
      projects: [{ projectName: 'web', projectPath }],
    });
  });

  it('keeps canonical verification locked when audit evidence still blocks', async () => {
    const { workspacePath } = await projectFixture();
    executions.queue.push(
      { exitCode: 0 },
      {
        exitCode: 1,
        stdout: JSON.stringify({
          vulnerabilities: {
            next: {
              name: 'next',
              severity: 'high',
              isDirect: true,
              fixAvailable: true,
            },
          },
        }),
      },
      { exitCode: 0 },
      { exitCode: 0 }
    );

    const transaction = await completeStudioDependencyTransactions({
      workspacePath,
      changedPaths: ['web/package-lock.json'],
    });

    expect(transaction.state).toBe('blocked');
    expect(transaction.closureReady).toBe(false);
    expect(transaction.projects[0]).toMatchObject({
      state: 'blocked',
      closureReady: false,
      unresolvedCandidates: [
        {
          packageName: 'next',
          disposition: 'no-exact-fix',
          autoExecutable: false,
        },
      ],
    });
  });

  it('reports project-native validation failures separately from an open audit', async () => {
    const { workspacePath } = await projectFixture();
    executions.queue.push(
      { exitCode: 0 },
      { exitCode: 0, stdout: JSON.stringify({ vulnerabilities: {} }) },
      { exitCode: 1, stderr: 'tests failed' },
      { exitCode: 0 }
    );

    const transaction = await completeStudioDependencyTransactions({
      workspacePath,
      changedPaths: ['web/package.json'],
    });

    expect(transaction.state).toBe('failed');
    expect(transaction.closureReady).toBe(false);
    expect(transaction.projects[0].stages).toContainEqual(
      expect.objectContaining({
        id: 'test',
        status: 'failed',
        summary: 'tests failed',
      })
    );
  });
});
