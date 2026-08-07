import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  decideCliOwnedRepair,
  executeCliOwnedCanonicalRepair,
  executeCliOwnedPatchRepair,
  resolveInstalledWorkspaiCli,
  type WorkspaceRepairCliTransaction,
} from '../core/workspaceRepairCliClient.js';

function transaction(
  id: string,
  state: WorkspaceRepairCliTransaction['state']
): WorkspaceRepairCliTransaction {
  return {
    schemaVersion: 'workspai.workspace-repair-transaction.v1',
    transactionId: id,
    state,
    target: { cardId: 'doctor', scope: 'workspace', actionIds: [] },
    checkpoint: { status: 'pending', files: [] },
    stages: [],
  };
}

function operation(artifact: WorkspaceRepairCliTransaction): string {
  return JSON.stringify({
    schemaVersion: 'workspai-cli-operation-result-v1',
    operation: 'workspace repair test',
    status: 'success',
    exitCode: 0,
    artifact,
  });
}

async function installedPackage(root: string, version = '0.54.0') {
  const packageRoot = path.join(root, 'node_modules', 'workspai');
  const manifestPath = path.join(packageRoot, 'package.json');
  await fs.outputFile(path.join(packageRoot, 'dist', 'index.js'), '#!/usr/bin/env node\n');
  await fs.writeJson(manifestPath, {
    name: 'workspai',
    version,
    bin: { workspai: 'dist/index.js' },
  });
  return { name: 'workspai', version, manifestPath, source: 'workspace' as const };
}

describe('CLI-owned Workspace Repair client', () => {
  it('resolves a compatible installed entrypoint without using npx or the registry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(root);

    const resolved = await resolveInstalledWorkspaiCli({
      workspacePath: root,
      installedPackages: [metadata],
    });

    expect(resolved.entrypoint).toBe(
      path.join(root, 'node_modules', 'workspai', 'dist', 'index.js')
    );
    expect(resolved.source).toBe('workspace');
  });

  it('routes model changes through propose, approval, execute, and CLI closure', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    await fs.outputFile(path.join(workspacePath, '.workspai-workspace'), 'name=test\n');
    const metadata = await installedPackage(workspacePath);
    const actions: string[] = [];
    const progress: string[] = [];

    const result = await executeCliOwnedPatchRepair({
      workspacePath,
      cardId: 'doctor',
      patches: [
        {
          relativePath: 'src/app.ts',
          baseSha256: null,
          patchedContent: 'export const ready = true;\n',
        },
      ],
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      reportProgress: async (entry) => progress.push(entry.phase),
      runner: async ({ args }) => {
        const action = args[2];
        actions.push(action);
        if (action === 'propose') {
          const relative = args[args.indexOf('--proposal') + 1];
          const proposal = await fs.readJson(path.join(workspacePath, relative));
          expect(proposal.changes[0]).toMatchObject({
            path: 'src/app.ts',
            expectedBeforeHash: null,
            operation: 'write',
          });
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-1', 'awaiting-approval')),
            stderr: '',
          };
        }
        if (action === 'approve') {
          expect(args).toContain('vscode:test');
          return { exitCode: 0, stdout: operation(transaction('tx-1', 'approved')), stderr: '' };
        }
        const closed = transaction('tx-1', 'closed');
        closed.checkpoint = {
          status: 'captured',
          files: [{ path: 'src/app.ts', existed: false, beforeHash: null, afterHash: 'abc' }],
        };
        return { exitCode: 0, stdout: operation(closed), stderr: '' };
      },
    });

    expect(actions).toEqual(['propose', 'approve', 'execute']);
    expect(progress).toEqual(['plan', 'approval', 'execute', 'complete']);
    expect(result.transaction.state).toBe('closed');
    expect(result.changedPaths).toEqual(['src/app.ts']);
    expect(await fs.readdir(path.join(workspacePath, '.workspai', 'repair', 'inbox'))).toEqual([]);
  });

  it('returns decision-required without inventing approval or executing mutations', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const actions: string[] = [];
    const decision = transaction('tx-decision', 'decision-required');
    decision.decision = {
      reason: 'The plan exceeds guarded risk.',
      options: ['approve-invasive', 'manual-repair', 'cancel'],
    };
    decision.adapterEvaluations = [
      {
        adapterId: 'python',
        ecosystem: 'Python',
        projectPath: 'api',
        manifests: ['pyproject.toml'],
        support: 'conditional',
        status: 'partial',
        requiredExecutables: ['poetry', 'pip-audit'],
        missingExecutables: ['pip-audit'],
        message: 'Required executable(s) unavailable: pip-audit.',
      },
    ];

    const result = await executeCliOwnedCanonicalRepair({
      workspacePath,
      cardId: 'doctor',
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      runner: async ({ args }) => {
        actions.push(args[2]);
        return { exitCode: 2, stdout: operation(decision), stderr: '' };
      },
    });

    expect(actions).toEqual(['plan']);
    expect(result.transaction).toEqual(decision);
    expect(result.transaction.adapterEvaluations?.[0]).toMatchObject({
      adapterId: 'python',
      status: 'partial',
      missingExecutables: ['pip-audit'],
    });
  });

  it('resumes the active durable transaction instead of creating a duplicate plan', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const active = transaction('tx-active', 'approved');
    active.verification = {
      status: 'not-run',
      artifact: '.workspai/reports/workspace-intelligence-run-last-run.json',
      exitCode: null,
      summary: 'Legacy v1 receipt without target/workspace outcome fields.',
    };
    await fs.outputJson(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-repair-last-run.json'),
      active
    );
    const actions: string[] = [];
    const progress: string[] = [];

    const result = await executeCliOwnedCanonicalRepair({
      workspacePath,
      cardId: 'doctor',
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      reportProgress: async (entry) => progress.push(entry.message),
      runner: async ({ args }) => {
        actions.push(args[2]);
        const closed = transaction('tx-active', 'closed');
        closed.verification = {
          status: 'passed',
          targetStatus: 'passed',
          workspaceStatus: 'blocked',
          remainingActionIds: [],
          artifact: '.workspai/reports/workspace-intelligence-run-last-run.json',
          exitCode: 2,
          summary: 'Selected repair passed; other findings remain.',
        };
        return { exitCode: 2, stdout: operation(closed), stderr: '' };
      },
    });

    expect(actions).toEqual(['resume']);
    expect(result.transaction.state).toBe('closed');
    expect(progress.at(-1)).toContain('Other governed workspace findings remain');
  });

  it('submits only an explicit CLI decision and binds a fresh plan to fresh approval', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const actions: string[] = [];

    const result = await decideCliOwnedRepair({
      workspacePath,
      transactionId: 'tx-old',
      decision: 'allow-breaking',
      approvedBy: 'vscode:explicit-user-decision',
      installedPackages: [metadata],
      runner: async ({ args }) => {
        const action = args[2];
        actions.push(action);
        if (action === 'decide') {
          expect(args).toEqual(expect.arrayContaining(['tx-old', 'allow-breaking']));
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-fresh', 'awaiting-approval')),
            stderr: '',
          };
        }
        if (action === 'approve') {
          expect(args).toContain('vscode:explicit-user-decision');
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-fresh', 'approved')),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: operation(transaction('tx-fresh', 'closed')), stderr: '' };
      },
    });

    expect(actions).toEqual(['decide', 'approve', 'execute']);
    expect(result.transaction).toMatchObject({ transactionId: 'tx-fresh', state: 'closed' });
  });

  it('replans a stale manual-only decision instead of trapping Resume on it forever', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const stale = transaction('tx-stale', 'decision-required');
    stale.decision = {
      reason: 'No compatible automatic action was available in the previous evidence.',
      options: ['manual-repair', 'cancel'],
    };
    await fs.outputJson(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-repair-last-run.json'),
      stale
    );
    const actions: string[] = [];

    const result = await executeCliOwnedCanonicalRepair({
      workspacePath,
      cardId: 'doctor',
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      runner: async ({ args }) => {
        const action = args[2];
        actions.push(action);
        if (action === 'plan') {
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-fresh', 'awaiting-approval')),
            stderr: '',
          };
        }
        if (action === 'approve') {
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-fresh', 'approved')),
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: operation(transaction('tx-fresh', 'closed')),
          stderr: '',
        };
      },
    });

    expect(actions).toEqual(['plan', 'approve', 'execute']);
    expect(result.transaction).toMatchObject({ transactionId: 'tx-fresh', state: 'closed' });
  });

  it('rejects an uninspected patch before creating a proposal', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);

    await expect(
      executeCliOwnedPatchRepair({
        workspacePath,
        cardId: 'doctor',
        patches: [{ relativePath: 'src/app.ts', patchedContent: 'unsafe\n' }],
        approvedBy: 'vscode:test',
        installedPackages: [metadata],
      })
    ).rejects.toThrow('has no inspected base hash');
  });
});
