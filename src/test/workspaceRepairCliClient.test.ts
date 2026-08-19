import fs from 'fs-extra';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildWorkspaiCliRuntimeEnv,
  decideCliOwnedRepair,
  executeCliOwnedCanonicalRepair,
  executeCliOwnedPatchRepair,
  hydrateStudioRepairEventFileChanges,
  projectWorkspaceRepairTransactionForConsumer,
  readCliOwnedRepairFileChanges,
  readCliOwnedRepairFileComparison,
  resolveInstalledWorkspaiCli,
  resolveWorkspaiNodeExecutables,
  verifyInstalledWorkspaiRepairCli,
  type WorkspaceRepairCliTransaction,
} from '../core/workspaceRepairCliClient.js';
import { MIN_RAPIDKIT_CLI_VERSION } from '../core/cliVersionPolicy.js';

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

async function installedPackage(root: string, version = MIN_RAPIDKIT_CLI_VERSION) {
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

function repairProtocolRunner(
  handler: (input: {
    entrypoint: { version: string; entrypoint: string };
    args: string[];
  }) => Promise<{ exitCode: number; stdout: string; stderr: string }>,
  runtimeVersion?: (manifestVersion: string, entrypoint: string) => string,
  workflowOverride?: string[],
  invariantOverrides?: Record<string, unknown>
) {
  return async (input: {
    entrypoint: { version: string; entrypoint: string };
    workspacePath: string;
    args: string[];
    timeoutMs: number;
  }) => {
    if (input.args[0] === '--version') {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          schemaVersion: 'rapidkit-version-v1',
          cli: 'workspai',
          version:
            runtimeVersion?.(input.entrypoint.version, input.entrypoint.entrypoint) ??
            input.entrypoint.version,
        }),
        stderr: '',
      };
    }
    if (
      input.args[0] === 'workspace' &&
      input.args[1] === 'repair' &&
      input.args[2] === 'capabilities'
    ) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          schemaVersion: 'workspai.workspace-repair-capabilities.v1',
          workflow: workflowOverride ?? [
            'plan',
            'preconditions',
            'approval',
            'target-precondition',
            'checkpoint',
            'execute',
            'reconcile',
            'audit',
            'test',
            'build',
            'target-producer-verify',
            'canonical-verify',
            'close-or-rollback-or-decision',
          ],
          invariants: {
            consumerHandshakeRequired: true,
            ephemeralProposalsAreEvidence: false,
            mutationAuthority: 'cli-only',
            targetClosure: 'selected-causal-action-set',
            changeReceipt: 'checkpoint-hash-delta',
            consumerTimeline: 'durable-transaction-events',
            typedDecisionCauses: true,
            registeredLinkedProjectMutationBoundary: true,
            sourceProposalIntegrity: 'project-bound-hash-pinned',
            completionAuthority: 'cli-verification-receipt',
            goalSourceTransition: 'closed-integrity-bound-v1',
            goalAttemptBudget: 'durable-serialized-v1',
            ...invariantOverrides,
          },
          consumerProtocol: {
            protocolVersion: 'workspai.workspace-repair-consumer-protocol.v1',
            invocation: {
              workspaceResolution: ['process-cwd', '--workspace'],
              actions: [
                'capabilities',
                'plan',
                'propose',
                'approve',
                'decide',
                'execute',
                'resume',
              ],
            },
            contracts: {
              operationResult: 'workspai-cli-operation-result-v1',
              proposal: 'workspai.workspace-repair-proposal.v1',
              transaction: 'workspai.workspace-repair-transaction.v1',
            },
          },
        }),
        stderr: '',
      };
    }
    expect(input.args).not.toContain('--workspace');
    return handler(input);
  };
}

describe('CLI-owned Workspace Repair client', () => {
  it('projects repair transactions without filesystem or checkpoint identity', () => {
    const artifact = transaction('tx-consumer-safe', 'decision-required');
    artifact.target.projectName = 'grpc';
    artifact.target.projectPath = '../../private/source/grpc';
    artifact.checkpoint.files = [
      { path: '../../private/source/grpc/CMakeLists.txt', existed: true, beforeHash: 'secret' },
    ];
    artifact.adapterEvaluations = [
      {
        adapterId: 'cmake',
        ecosystem: 'CMake',
        projectPath: '../../private/source/grpc',
        manifests: ['../../private/source/grpc/CMakeLists.txt'],
        support: 'full',
        status: 'ready',
        requiredExecutables: ['cmake'],
        missingExecutables: [],
        message: 'ready',
      },
    ];
    artifact.decision = {
      reason: 'Review /opt/fixtures/source/grpc/CMakeLists.txt before continuing.',
      options: ['replan', 'manual-repair', 'cancel'],
      causes: [
        {
          kind: 'source-repair-required',
          id: 'source',
          message: 'Change ../../private/source/grpc/CMakeLists.txt.',
          projectPath: '../../private/source/grpc',
        },
      ],
    };

    const projection = projectWorkspaceRepairTransactionForConsumer(artifact);
    const serialized = JSON.stringify(projection);
    expect(projection).not.toHaveProperty('checkpoint');
    expect(projection).not.toHaveProperty('adapterEvaluations');
    expect(serialized).not.toContain('/opt/fixtures');
    expect(serialized).not.toContain('../../private');
    expect(serialized).toContain('$LOCAL_PATH');
    expect(serialized).toContain('$EXTERNAL_PATH');
  });

  it('keeps embedded producer reports out of consumer transaction projections', () => {
    const artifact = transaction('tx-large-producer-output', 'decision-required');
    const rawEvidence = JSON.stringify({
      workspace: { path: '/home/example/private/workspace' },
      projects: Array.from({ length: 200 }, (_, index) => ({ index, status: 'blocked' })),
    });
    artifact.stages = [
      {
        id: 'target-precondition',
        kind: 'verify',
        status: 'failed',
        summary: `Target precondition failed before checkpoint: ${rawEvidence}`,
      },
    ];
    artifact.decision = {
      reason: `Target precondition failed before checkpoint: ${rawEvidence}`,
      options: ['cancel'],
      causes: [
        {
          kind: 'failed-precondition',
          id: 'runtime:producer-output',
          message: `Target precondition failed before checkpoint: ${rawEvidence}`,
        },
      ],
    };

    const serialized = JSON.stringify(projectWorkspaceRepairTransactionForConsumer(artifact));
    expect(serialized).not.toContain('/home/example');
    expect(serialized).not.toContain('projects');
    expect(serialized.length).toBeLessThan(2_000);
    expect(serialized).toContain('compile a new bounded plan');
  });

  it('resolves Node from the npm installation that owns Workspai instead of the VS Code executable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-node-'));
    const nodeRoot = path.join(root, 'versions', 'node', 'v20.20.2');
    const nodeExecutable = path.join(nodeRoot, 'bin', 'node');
    const manifestPath = path.join(nodeRoot, 'lib', 'node_modules', 'workspai', 'package.json');
    const codeExecutable = path.join(root, 'code-insiders');
    await fs.outputFile(nodeExecutable, '#!/bin/sh\nexit 0\n');
    await fs.chmod(nodeExecutable, 0o755);
    await fs.outputFile(codeExecutable, '#!/bin/sh\nexit 0\n');
    await fs.chmod(codeExecutable, 0o755);
    await fs.outputJson(manifestPath, {
      name: 'workspai',
      version: MIN_RAPIDKIT_CLI_VERSION,
    });

    expect(
      resolveWorkspaiNodeExecutables({
        manifestPath,
        platform: 'linux',
        env: { PATH: '' },
        homeDir: path.join(root, 'home'),
        processExecutable: codeExecutable,
      })
    ).toEqual([nodeExecutable]);
  });

  it('deduplicates linked package discoveries before the runtime handshake', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    let versionProbes = 0;

    await expect(
      verifyInstalledWorkspaiRepairCli({
        workspacePath,
        installedPackages: [metadata, { ...metadata }],
        runner: repairProtocolRunner(
          async () => ({ exitCode: 0, stdout: '', stderr: '' }),
          () => {
            versionProbes += 1;
            return '0.51.0';
          }
        ),
      })
    ).rejects.toThrow(
      `manifest declares ${MIN_RAPIDKIT_CLI_VERSION}, but the selected executable reports 0.51.0`
    );
    expect(versionProbes).toBe(1);
  });

  it('rejects a CLI whose repair workflow omits exact target preflight', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-workflow-'));
    const metadata = await installedPackage(workspacePath);

    await expect(
      verifyInstalledWorkspaiRepairCli({
        workspacePath,
        installedPackages: [metadata],
        runner: repairProtocolRunner(
          async () => ({ exitCode: 0, stdout: '', stderr: '' }),
          undefined,
          [
            'plan',
            'preconditions',
            'approval',
            'checkpoint',
            'execute',
            'reconcile',
            'audit',
            'test',
            'build',
            'canonical-verify',
            'close-or-rollback-or-decision',
          ]
        ),
      })
    ).rejects.toThrow('repair capabilities do not satisfy');
  });

  it('restores user tool bins for CLI repair subprocesses with a stale Extension Host PATH', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-env-'));
    const nodeBin = path.join(root, 'node', 'bin');
    const userBin = path.join(root, 'home', '.local', 'bin');
    await fs.ensureDir(nodeBin);
    await fs.ensureDir(userBin);

    const env = buildWorkspaiCliRuntimeEnv({
      nodeExecutable: path.join(nodeBin, 'node'),
      platform: 'linux',
      homeDir: path.join(root, 'home'),
      baseEnv: { PATH: '/usr/bin' },
    });

    expect(env.PATH?.split(':')).toEqual([nodeBin, '/usr/bin', userBin]);
  });

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
      goalId: 'goal-test-coverage-12345678',
      blockerSignature: 'doctor:fixture:blocker-v1',
      targetActionIds: ['doctor.fixture.environment.file-create'],
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
      runner: repairProtocolRunner(async ({ args }) => {
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
          expect(proposal).toMatchObject({
            goalId: 'goal-test-coverage-12345678',
            blockerSignature: 'doctor:fixture:blocker-v1',
            targetActionIds: ['doctor.fixture.environment.file-create'],
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
        const patchedContent = 'export const ready = true;\n';
        await fs.outputFile(path.join(workspacePath, 'src', 'app.ts'), patchedContent);
        const closed = transaction('tx-1', 'closed');
        closed.checkpoint = {
          status: 'captured',
          files: [
            {
              path: 'src/app.ts',
              existed: false,
              beforeHash: null,
              afterHash: crypto.createHash('sha256').update(patchedContent).digest('hex'),
            },
          ],
        };
        return { exitCode: 0, stdout: operation(closed), stderr: '' };
      }),
    });

    expect(actions).toEqual(['propose', 'approve', 'execute']);
    expect(progress).toEqual(['plan', 'approval', 'execute', 'complete']);
    expect(result.transaction.state).toBe('closed');
    expect(result.changedPaths).toEqual(['src/app.ts']);
    expect(result.fileChanges).toEqual([
      expect.objectContaining({
        relativePath: 'src/app.ts',
        status: 'added',
        isNewFile: true,
        binary: false,
        stale: false,
      }),
    ]);
    expect(result.fileChanges[0]?.diffLines).toContainEqual({
      type: 'added',
      content: 'export const ready = true;',
    });
    expect(await fs.readdir(path.join(workspacePath, '.workspai', 'repair', 'inbox'))).toEqual([]);
  });

  it('rejects Goal mutation when the runtime lacks the post-0.58 Goal repair contract', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    await fs.outputFile(path.join(workspacePath, '.workspai-workspace'), 'name=test\n');
    const metadata = await installedPackage(workspacePath);

    await expect(
      executeCliOwnedPatchRepair({
        workspacePath,
        cardId: 'goal-test-coverage-12345678',
        goalId: 'goal-test-coverage-12345678',
        patches: [
          {
            relativePath: 'tests/app.test.ts',
            baseSha256: null,
            patchedContent: 'export const covered = true;\n',
          },
        ],
        approvedBy: 'vscode:test',
        installedPackages: [metadata],
        runner: repairProtocolRunner(
          async () => ({ exitCode: 0, stdout: '', stderr: '' }),
          undefined,
          undefined,
          {
            goalSourceTransition: 'legacy-goal-binding',
            goalAttemptBudget: 'consumer-local',
          }
        ),
      })
    ).rejects.toThrow('Goal mutation requires closed integrity-bound source transitions');
  });

  it('refuses linked-project mutation when the installed CLI cannot prove the external boundary', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-workspace-'));
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-linked-project-'));
    const metadata = await installedPackage(workspacePath);

    await expect(
      executeCliOwnedPatchRepair({
        workspacePath,
        projectPath,
        projectName: 'api',
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
        runner: repairProtocolRunner(
          async () => ({ exitCode: 0, stdout: '', stderr: '' }),
          undefined,
          undefined,
          {
            registeredLinkedProjectMutationBoundary: false,
            sourceProposalIntegrity: 'legacy-workspace-relative',
            completionAuthority: 'consumer-inferred',
          }
        ),
      })
    ).rejects.toThrow('this linked project requires the registered-project mutation boundary');
  });

  it('accepts linked-project proposals only after the runtime proves project-bound closure', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-workspace-'));
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-linked-project-'));
    const metadata = await installedPackage(workspacePath);
    const actions: string[] = [];

    const result = await executeCliOwnedPatchRepair({
      workspacePath,
      projectPath,
      projectName: 'api',
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
      runner: repairProtocolRunner(async ({ args }) => {
        const action = args[2];
        actions.push(action);
        if (action === 'propose') {
          const proposalPath = path.join(workspacePath, args[args.indexOf('--proposal') + 1]);
          const proposal = await fs.readJson(proposalPath);
          const portableProjectPath = path.relative(workspacePath, projectPath).replace(/\\/g, '/');
          expect(proposal).toMatchObject({
            projectName: 'api',
            projectPath: portableProjectPath,
            changes: [
              expect.objectContaining({
                path: `${portableProjectPath}/src/app.ts`,
                expectedBeforeHash: null,
              }),
            ],
          });
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-linked', 'awaiting-approval')),
            stderr: '',
          };
        }
        if (action === 'approve') {
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-linked', 'approved')),
            stderr: '',
          };
        }
        const closed = transaction('tx-linked', 'closed');
        closed.target.projectName = 'api';
        closed.target.projectPath = path.relative(workspacePath, projectPath).replace(/\\/g, '/');
        return { exitCode: 0, stdout: operation(closed), stderr: '' };
      }),
    });

    expect(actions).toEqual(['propose', 'approve', 'execute']);
    expect(result.transaction.state).toBe('closed');
  });

  it('canonicalizes project-relative and workspace-relative patch inputs to one project boundary', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-workspace-'));
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(projectPath);
    const metadata = await installedPackage(workspacePath);

    await executeCliOwnedPatchRepair({
      workspacePath,
      projectPath,
      projectName: 'api',
      cardId: 'doctor',
      patches: [
        { relativePath: 'src/a.ts', baseSha256: null, patchedContent: 'export {};\n' },
        { relativePath: 'api/src/b.ts', baseSha256: null, patchedContent: 'export {};\n' },
      ],
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      runner: repairProtocolRunner(async ({ args }) => {
        const action = args[2];
        if (action === 'propose') {
          const proposalPath = path.join(workspacePath, args[args.indexOf('--proposal') + 1]);
          const proposal = await fs.readJson(proposalPath);
          expect(proposal.changes.map((change: { path: string }) => change.path)).toEqual([
            'api/src/a.ts',
            'api/src/b.ts',
          ]);
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-project-paths', 'awaiting-approval')),
            stderr: '',
          };
        }
        if (action === 'approve') {
          return {
            exitCode: 0,
            stdout: operation(transaction('tx-project-paths', 'approved')),
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: operation(transaction('tx-project-paths', 'closed')),
          stderr: '',
        };
      }),
    });

    await expect(
      executeCliOwnedPatchRepair({
        workspacePath,
        projectPath,
        projectName: 'api',
        cardId: 'doctor',
        patches: [
          {
            relativePath: '../sibling/unsafe.ts',
            baseSha256: null,
            patchedContent: 'unsafe\n',
          },
        ],
        approvedBy: 'vscode:test',
        installedPackages: [metadata],
      })
    ).rejects.toThrow('escapes the selected project source boundary');
  });

  it('returns decision-required without inventing approval or executing mutations', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const actions: string[] = [];
    const decision = transaction('tx-decision', 'decision-required');
    decision.decision = {
      reason: 'The plan exceeds guarded risk.',
      options: ['approve-invasive', 'replan', 'manual-repair', 'cancel'],
      causes: [
        {
          kind: 'missing-executable',
          id: 'tool:api:python:pip-audit',
          message: 'Required executable(s) unavailable: pip-audit.',
          projectPath: 'api',
          adapterId: 'python',
          executable: 'pip-audit',
        },
      ],
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
      runner: repairProtocolRunner(async ({ args }) => {
        actions.push(args[2]);
        return { exitCode: 2, stdout: operation(decision), stderr: '' };
      }),
    });

    expect(actions).toEqual(['plan']);
    expect(result.transaction).toEqual(decision);
    expect(result.changedPaths).toEqual([]);
    expect(result.fileChanges).toEqual([]);
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
      runner: repairProtocolRunner(async ({ args }) => {
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
      }),
    });

    expect(actions).toEqual(['resume']);
    expect(result.transaction.state).toBe('closed');
    expect(progress.at(-1)).toContain('Other governed workspace findings remain');
  });

  it('replans when the active transaction does not own the requested causal action', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const active = transaction('tx-unrelated', 'approved');
    active.target.actionIds = ['doctor.api:security-guidance'];
    await fs.outputJson(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-repair-last-run.json'),
      active
    );
    const actions: string[] = [];

    const result = await executeCliOwnedCanonicalRepair({
      workspacePath,
      cardId: 'doctor',
      actionId: 'doctor.api:env-copy',
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      runner: repairProtocolRunner(async ({ args }) => {
        const action = args[2];
        actions.push(action);
        const state =
          action === 'plan' ? 'awaiting-approval' : action === 'approve' ? 'approved' : 'closed';
        const next = transaction('tx-causal', state);
        next.target.actionIds = ['doctor.api:env-copy'];
        return { exitCode: 0, stdout: operation(next), stderr: '' };
      }),
    });

    expect(actions).toEqual(['plan', 'approve', 'execute']);
    expect(result.transaction).toMatchObject({
      transactionId: 'tx-causal',
      state: 'closed',
      target: { actionIds: ['doctor.api:env-copy'] },
    });
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
      runner: repairProtocolRunner(async ({ args }) => {
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
      }),
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
      options: ['replan', 'manual-repair', 'cancel'],
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
      runner: repairProtocolRunner(async ({ args }) => {
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
      }),
    });

    expect(actions).toEqual(['plan', 'approve', 'execute']);
    expect(result.transaction).toMatchObject({ transactionId: 'tx-fresh', state: 'closed' });
  });

  it('automatically recompiles one plan when fresh evidence invalidates the approved target', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);
    const actions: string[] = [];
    let planCount = 0;

    const result = await executeCliOwnedCanonicalRepair({
      workspacePath,
      cardId: 'doctor',
      approvedBy: 'vscode:test',
      installedPackages: [metadata],
      runner: repairProtocolRunner(async ({ args }) => {
        const action = args[2];
        actions.push(action);
        if (action === 'plan') {
          planCount += 1;
          return {
            exitCode: 0,
            stdout: operation(transaction(`tx-plan-${planCount}`, 'awaiting-approval')),
            stderr: '',
          };
        }
        if (action === 'approve') {
          return {
            exitCode: 0,
            stdout: operation(transaction(`tx-plan-${planCount}`, 'approved')),
            stderr: '',
          };
        }
        if (planCount === 1) {
          const stale = transaction('tx-plan-1', 'decision-required');
          stale.stages = [
            {
              id: 'target-precondition',
              kind: 'verify',
              status: 'failed',
              summary: 'Fresh evidence changed.',
            },
          ];
          stale.decision = {
            reason: 'Target precondition failed before checkpoint: {"status":"blocked"}',
            options: ['cancel'],
            causes: [
              {
                kind: 'failed-precondition',
                id: 'runtime:stale-target',
                message: 'Fresh evidence changed.',
              },
            ],
          };
          return { exitCode: 2, stdout: operation(stale), stderr: '' };
        }
        return {
          exitCode: 0,
          stdout: operation(transaction('tx-plan-2', 'closed')),
          stderr: '',
        };
      }),
    });

    expect(actions).toEqual(['plan', 'approve', 'execute', 'plan', 'approve', 'execute']);
    expect(result.transaction).toMatchObject({ transactionId: 'tx-plan-2', state: 'closed' });
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

  it('renders an exact checkpoint-backed comparison and rejects a stale native diff', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const transactionId = 'receipt-transaction-0001';
    const relativePath = 'src/service.ts';
    const before = 'export const mode = "before";\n';
    const after = 'export const mode = "after";\n';
    const backupRef = 'checkpoint/0000.bin';
    const artifact = transaction(transactionId, 'closed');
    artifact.checkpoint = {
      status: 'captured',
      files: [
        {
          path: relativePath,
          existed: true,
          beforeHash: crypto.createHash('sha256').update(before).digest('hex'),
          afterHash: crypto.createHash('sha256').update(after).digest('hex'),
          backupRef,
        },
      ],
    };
    await fs.outputFile(
      path.join(workspacePath, '.workspai', 'repair', 'transactions', transactionId, backupRef),
      before
    );
    await fs.outputFile(path.join(workspacePath, relativePath), after);

    const comparison = await readCliOwnedRepairFileComparison({
      workspacePath,
      transaction: artifact,
      relativePath,
    });
    expect(comparison).toMatchObject({
      relativePath,
      status: 'modified',
      binary: false,
      stale: false,
      originalContent: before,
      patchedContent: after,
    });
    expect(comparison.diffLines).toEqual(
      expect.arrayContaining([
        { type: 'removed', content: 'export const mode = "before";' },
        { type: 'added', content: 'export const mode = "after";' },
      ])
    );

    await fs.writeFile(path.join(workspacePath, relativePath), 'export const mode = "later";\n');
    const stale = await readCliOwnedRepairFileComparison({
      workspacePath,
      transaction: artifact,
      relativePath,
    });
    expect(stale).toMatchObject({
      stale: true,
      failReason: 'The file changed again after this repair transaction.',
    });
  });

  it('rebuilds bounded hunks from CLI transaction files without requiring durable source', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-hydrate-'));
    const transactionId = 'receipt-transaction-hydrate';
    const relativePath = 'src/service.ts';
    const before = 'export const mode = "before";\n';
    const after = 'export const mode = "after";\n';
    const backupRef = 'checkpoint/0000.bin';
    const artifact = transaction(transactionId, 'closed');
    artifact.checkpoint = {
      status: 'captured',
      files: [
        {
          path: relativePath,
          existed: true,
          beforeHash: crypto.createHash('sha256').update(before).digest('hex'),
          afterHash: crypto.createHash('sha256').update(after).digest('hex'),
          backupRef,
        },
      ],
    };
    const transactionDirectory = path.join(
      workspacePath,
      '.workspai',
      'repair',
      'transactions',
      transactionId
    );
    await fs.outputFile(path.join(transactionDirectory, backupRef), before);
    await fs.outputFile(path.join(workspacePath, relativePath), after);
    await fs.writeJson(path.join(transactionDirectory, 'transaction.json'), artifact);

    const fileChanges = await readCliOwnedRepairFileChanges({
      workspacePath,
      transaction: artifact,
    });
    expect(fileChanges).toEqual([
      expect.objectContaining({
        relativePath,
        status: 'modified',
        binary: false,
        stale: false,
      }),
    ]);
    expect(fileChanges[0]?.diffLines).toEqual(
      expect.arrayContaining([
        { type: 'removed', content: 'export const mode = "before";' },
        { type: 'added', content: 'export const mode = "after";' },
      ])
    );

    const durableEvent = {
      type: 'tool.completed',
      data: {
        output: {
          transaction: { transactionId },
          changedPaths: [relativePath],
        },
      },
    };
    const hydrated = await hydrateStudioRepairEventFileChanges({
      workspacePath,
      event: durableEvent,
    });
    expect(durableEvent.data.output).not.toHaveProperty('fileChanges');
    expect((hydrated.data.output as { fileChanges: typeof fileChanges }).fileChanges).toEqual(
      fileChanges
    );
  });

  it('opens a linked-project receipt through its portable project-relative display path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-linked-'));
    const workspacePath = path.join(root, 'workspace');
    const projectPath = path.join(root, 'sources', 'grpc');
    const transactionId = 'receipt-transaction-linked-0001';
    const displayPath = 'cmake/cares.cmake';
    const transactionPath = path
      .relative(workspacePath, path.join(projectPath, displayPath))
      .split(path.sep)
      .join('/');
    const before = 'set(CARES_PROVIDER package)\n';
    const after = 'set(CARES_PROVIDER module)\n';
    const backupRef = 'checkpoint/0000.bin';
    const artifact = transaction(transactionId, 'closed');
    artifact.target.projectName = 'grpc';
    artifact.target.projectPath = path
      .relative(workspacePath, projectPath)
      .split(path.sep)
      .join('/');
    artifact.checkpoint = {
      status: 'captured',
      files: [
        {
          path: transactionPath,
          existed: true,
          beforeHash: crypto.createHash('sha256').update(before).digest('hex'),
          afterHash: crypto.createHash('sha256').update(after).digest('hex'),
          backupRef,
        },
      ],
    };
    await fs.outputFile(
      path.join(workspacePath, '.workspai', 'repair', 'transactions', transactionId, backupRef),
      before
    );
    await fs.outputFile(path.join(projectPath, displayPath), after);

    await expect(
      readCliOwnedRepairFileComparison({
        workspacePath,
        transaction: artifact,
        relativePath: displayPath,
      })
    ).resolves.toMatchObject({
      relativePath: displayPath,
      stale: false,
      originalContent: before,
      patchedContent: after,
    });

    artifact.target.projectPath = projectPath;
    await expect(
      readCliOwnedRepairFileComparison({
        workspacePath,
        transaction: artifact,
        relativePath: displayPath,
      })
    ).rejects.toThrow(/not a changed file|outside the authorized transaction boundary/);
  });

  it('rejects stale linked output when manifest and runtime versions differ', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const metadata = await installedPackage(workspacePath);

    await expect(
      verifyInstalledWorkspaiRepairCli({
        workspacePath,
        installedPackages: [metadata],
        runner: repairProtocolRunner(
          async () => ({ exitCode: 0, stdout: '', stderr: '' }),
          () => '0.51.0'
        ),
      })
    ).rejects.toThrow(
      `manifest declares ${MIN_RAPIDKIT_CLI_VERSION}, but the selected executable reports 0.51.0`
    );
  });

  it('falls back to the next verified executable when a preferred link is stale', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-client-'));
    const preferredRoot = path.join(workspacePath, 'preferred');
    const fallbackRoot = path.join(workspacePath, 'fallback');
    const preferred = await installedPackage(preferredRoot, '0.56.1');
    const fallback = {
      ...(await installedPackage(fallbackRoot)),
      source: 'global' as const,
    };

    const resolved = await verifyInstalledWorkspaiRepairCli({
      workspacePath,
      installedPackages: [preferred, fallback],
      runner: repairProtocolRunner(
        async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        (manifestVersion) => (manifestVersion === '0.56.1' ? '0.51.0' : manifestVersion)
      ),
    });

    expect(resolved.version).toBe(MIN_RAPIDKIT_CLI_VERSION);
    expect(resolved.protocolVersion).toBe('workspai.workspace-repair-consumer-protocol.v1');
  });
});
