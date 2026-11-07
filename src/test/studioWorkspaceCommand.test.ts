import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as nativeFs } from 'node:fs';

import {
  assertStudioWorkspaceCommandApproval,
  describeStudioWorkspaceCommandFailure,
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
} from '../core/studioWorkspaceCommand.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio workspace command capability policy', () => {
  it.each(['shellcheck', 'hadolint'])(
    'classifies %s as analysis without inventing an external-effect obligation',
    (executable) => {
      for (const purpose of ['test', 'inspect', 'diagnose'] as const) {
        const plan = resolveStudioWorkspaceCommandPlan({
          workspacePath: '/workspace',
          request: { executable, args: ['scripts/setup.sh'], purpose },
        });
        expect(plan).toMatchObject({
          externalSideEffects: false,
          repositoryMetadataEffects: false,
          unclassifiedCommand: false,
          mutatesSource: false,
          effectScopes: [],
          observationScopes: [`command:${executable}`],
        });
      }
      const writes = resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable,
          args: ['scripts/setup.sh'],
          purpose: 'test',
          allowSourceChanges: true,
        },
      });
      expect(writes).toMatchObject({ mutatesSource: true, requiresExplicitApproval: true });
    }
  );
  it.each([
    { timedOut: false, terminationSignal: 'SIGSEGV', expected: 'terminated by SIGSEGV' },
    { timedOut: true, terminationSignal: 'SIGTERM', expected: 'timed out after' },
  ])(
    'preserves the process failure despite partial stdout: $expected',
    ({ expected, ...failure }) => {
      const plan = resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'make', args: ['dev-setup'], purpose: 'build' },
      });
      const message = describeStudioWorkspaceCommandFailure({
        ...plan,
        exitCode: null,
        stdout: 'poetry install\n',
        stderr: '',
        ...failure,
      });
      expect(message).toContain(expected);
      expect(message).toContain('poetry install');
    }
  );
  it('reports executable startup failure separately from cancellation and refuses a missing cwd', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-startup-'));
    roots.push(root);
    const request = {
      executable: 'workspai-nonexistent-test-executable',
      args: [],
      purpose: 'inspect' as const,
    };
    const result = await runStudioWorkspaceCommand(
      resolveStudioWorkspaceCommandPlan({ workspacePath: root, request })
    );
    expect(result).toMatchObject({
      exitCode: null,
      startupError: { code: 'ENOENT' },
      timedOut: false,
    });
    expect(describeStudioWorkspaceCommandFailure(result)).toContain('could not start (ENOENT)');
    expect(describeStudioWorkspaceCommandFailure(result)).not.toContain('terminated before');
    await expect(
      runStudioWorkspaceCommand(
        resolveStudioWorkspaceCommandPlan({ workspacePath: path.join(root, 'missing'), request })
      )
    ).rejects.toThrow('not an empty workspace');
    expect(await fs.pathExists(path.join(root, 'missing'))).toBe(false);
  });
  it.each([
    ['npm', ['test'], 'test'],
    ['python3', ['-m', 'pytest'], 'test'],
    ['go', ['test', './...'], 'test'],
    ['cargo', ['check'], 'build'],
    ['dotnet', ['test'], 'test'],
    ['mvn', ['verify'], 'test'],
    ['./gradlew', ['test'], 'test'],
  ] as const)('plans structured no-shell %s commands', (executable, args, purpose) => {
    const plan = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: { executable, args: [...args], cwd: 'service', purpose },
    });
    expect(plan).toMatchObject({
      executable,
      args: [...args],
      cwd: '/workspace/service',
      purpose,
    });
    expect(plan.timeoutMs).toBeGreaterThanOrEqual(1_000);
  });

  it('accepts a repository-specific PATH tool through exact one-run approval and observation', () => {
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'project-validator',
          args: ['check', '--profile', 'enterprise'],
          cwd: 'service',
          purpose: 'test',
        },
      })
    ).toMatchObject({
      executable: 'project-validator',
      args: ['check', '--profile', 'enterprise'],
      cwd: '/workspace/service',
      mutatesSource: false,
      unclassifiedCommand: true,
      externalSideEffects: true,
      effectScopes: ['command:project-validator'],
      requiresExplicitApproval: true,
      allowedApprovalExecutions: ['once'],
    });
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'project-validator',
          args: ['status'],
          cwd: 'service',
          purpose: 'inspect',
        },
      })
    ).toMatchObject({
      externalSideEffects: false,
      effectScopes: [],
      observationScopes: ['command:project-validator'],
      requiresExplicitApproval: true,
      allowedApprovalExecutions: ['once'],
    });
  });

  it('classifies dependency and formatter commands as source mutations', () => {
    const dependencyPlan = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: { executable: 'npm', args: ['install'], purpose: 'dependency' },
    });
    expect(dependencyPlan.mutatesSource).toBe(true);
    expect(dependencyPlan.requiresExplicitApproval).toBe(true);
    expect(dependencyPlan.authorizationFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'prettier', args: ['--write', 'src'], purpose: 'format' },
      }).mutatesSource
    ).toBe(true);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'npm', args: ['test'], purpose: 'test' },
      }).mutatesSource
    ).toBe(false);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'npm', args: ['install'], purpose: 'inspect' },
      }).mutatesSource
    ).toBe(true);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'npm',
          args: ['run', 'lint', '--', '--fix'],
          purpose: 'diagnose',
        },
      }).mutatesSource
    ).toBe(true);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'npm',
          args: ['audit', '--json'],
          purpose: 'inspect',
        },
      }).mutatesSource
    ).toBe(false);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'npm',
          args: ['audit', 'fix', '--audit-level=moderate'],
          purpose: 'dependency',
        },
      }).mutatesSource
    ).toBe(true);
  });

  it('binds invasive approval to one exact command proposal', () => {
    const plan = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: {
        executable: 'npm',
        args: ['install'],
        purpose: 'dependency',
      },
    });
    expect(() => assertStudioWorkspaceCommandApproval({ plan })).toThrow('scoped user approval');
    expect(() =>
      assertStudioWorkspaceCommandApproval({
        plan,
        approval: {
          fingerprint: '0'.repeat(64),
          approvedBy: 'test:user',
          approvedAt: '2026-08-29T00:00:00.000Z',
        },
      })
    ).toThrow('does not match');
    expect(() =>
      assertStudioWorkspaceCommandApproval({
        plan,
        approval: {
          fingerprint: plan.authorizationFingerprint,
          approvedBy: 'test:user',
          approvedAt: '2026-08-29T00:00:00.000Z',
        },
      })
    ).not.toThrow();

    const changedProposal = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: {
        executable: 'npm',
        args: ['install', '--ignore-scripts'],
        purpose: 'dependency',
      },
    });
    expect(changedProposal.authorizationFingerprint).not.toBe(plan.authorizationFingerprint);
  });

  it('binds a source-producing build declaration to separate approval without changing its purpose', () => {
    const request = { executable: 'npm', args: ['run', 'build'], purpose: 'build' as const };
    const plain = resolveStudioWorkspaceCommandPlan({ workspacePath: '/workspace', request });
    const declared = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: { ...request, allowSourceChanges: true },
    });
    expect(plain.requiresExplicitApproval).toBe(false);
    expect(declared).toMatchObject({
      purpose: 'build',
      mutatesSource: true,
      requiresExplicitApproval: true,
    });
    expect(declared.authorizationFingerprint).not.toBe(plain.authorizationFingerprint);
    expect(() => assertStudioWorkspaceCommandApproval({ plan: declared })).toThrow(
      'scoped user approval'
    );
    expect(() =>
      assertStudioWorkspaceCommandApproval({
        plan: declared,
        approval: {
          fingerprint: plain.authorizationFingerprint,
          approvedBy: 'fixture',
          approvedAt: '2026-11-02T00:00:00Z',
        },
      })
    ).toThrow('does not match');
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'npm',
          args: ['install'],
          purpose: 'dependency',
          allowSourceChanges: false,
        },
      }).mutatesSource
    ).toBe(true);
    expect(() =>
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { ...request, allowSourceChanges: 'true' as never },
      })
    ).toThrow('must be a boolean');
  });

  it.each([
    ['dotnet', ['new', 'webapi']],
    ['go', ['generate', './...']],
    ['npm', ['init', '-y']],
    ['cargo', ['new', 'service']],
    ['mvn', ['archetype:generate']],
    ['./gradlew', ['wrapper']],
    ['npx', ['--no-install', 'create-next-app', 'web']],
    ['npm', ['run', 'db:migrate']],
  ] as const)('classifies source-generating %s commands as mutations', (executable, args) => {
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable, args: [...args], purpose: 'diagnose' },
      }).mutatesSource
    ).toBe(true);
  });

  it.each([
    { executable: 'bash', args: ['-lc', 'echo unsafe'], purpose: 'diagnose' as const },
    { executable: 'python3', args: ['-c', 'print(1)'], purpose: 'diagnose' as const },
    { executable: 'node', args: ['--eval', 'process.exit()'], purpose: 'diagnose' as const },
    { executable: 'npm', args: ['login'], purpose: 'build' as const },
    { executable: 'npx', args: ['eslint', '.'], purpose: 'diagnose' as const },
    { executable: 'npm', args: ['test', '--', '../../outside'], purpose: 'test' as const },
    { executable: 'pytest', args: ['--config=/etc/passwd'], purpose: 'test' as const },
    { executable: 'git', args: ['show', 'file:///etc/passwd'], purpose: 'inspect' as const },
  ])('blocks unsafe autonomous invocation $executable $args', (request) => {
    expect(() =>
      resolveStudioWorkspaceCommandPlan({ workspacePath: '/workspace', request })
    ).toThrow();
  });

  it.each([
    {
      executable: 'git',
      args: ['reset', '--hard'],
      purpose: 'diagnose' as const,
      repositoryMetadataEffects: true,
      externalSideEffects: false,
      mutatesSource: true,
    },
    {
      executable: 'npm',
      args: ['publish'],
      purpose: 'build' as const,
      repositoryMetadataEffects: false,
      externalSideEffects: true,
      mutatesSource: false,
    },
    {
      executable: 'terraform',
      args: ['apply'],
      purpose: 'build' as const,
      repositoryMetadataEffects: false,
      externalSideEffects: true,
      mutatesSource: false,
    },
    {
      executable: 'kubectl',
      args: ['delete', 'pod', 'api'],
      purpose: 'diagnose' as const,
      repositoryMetadataEffects: false,
      externalSideEffects: true,
      mutatesSource: false,
    },
    {
      executable: 'helm',
      args: ['upgrade', 'api', './chart'],
      purpose: 'build' as const,
      repositoryMetadataEffects: false,
      externalSideEffects: true,
      mutatesSource: true,
    },
    {
      executable: 'docker',
      args: ['run', 'image'],
      purpose: 'build' as const,
      repositoryMetadataEffects: false,
      externalSideEffects: true,
      mutatesSource: false,
    },
  ])(
    'routes invasive $executable effects through exact one-run approval',
    ({ repositoryMetadataEffects, externalSideEffects, mutatesSource, ...request }) => {
      const plan = resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request,
      });
      expect(plan).toMatchObject({
        requiresExplicitApproval: true,
        repositoryMetadataEffects,
        externalSideEffects,
        mutatesSource,
        allowedApprovalExecutions: ['once'],
      });
      expect(() =>
        assertStudioWorkspaceCommandApproval({
          plan,
          approval: {
            fingerprint: plan.authorizationFingerprint,
            approvedBy: 'test:user',
            approvedAt: '2026-08-29T00:00:00.000Z',
            execution: 'project',
          },
        })
      ).toThrow('not allowed');
    }
  );

  it('permits local-only package execution and read-only git inspection', () => {
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: 'npx',
          args: ['--no-install', 'eslint', '.'],
          purpose: 'diagnose',
        },
      }).displayCommand
    ).toContain('eslint');
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'git', args: ['diff', '--stat'], purpose: 'inspect' },
      }).mutatesSource
    ).toBe(false);
  });

  it('declares machine-readable effect and observation domains for non-source verification', () => {
    const push = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: { executable: 'git', args: ['push', 'origin', 'main'], purpose: 'build' },
    });
    expect(push.effectScopes).toEqual(['git-repository', 'git-remote']);
    expect(push.observationScopes).toEqual(['git-repository']);

    const remoteObservation = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: { executable: 'git', args: ['ls-remote', 'origin'], purpose: 'inspect' },
    });
    expect(remoteObservation.requiresExplicitApproval).toBe(false);
    expect(remoteObservation.effectScopes).toEqual([]);
    expect(remoteObservation.observationScopes).toEqual(['git-repository', 'git-remote']);

    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'kubectl', args: ['get', 'deployment', 'api'], purpose: 'inspect' },
      }).observationScopes
    ).toEqual(['kubernetes-cluster']);
  });

  it('runs bounded diagnostics in a registered linked-project root', () => {
    const plan = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/managed/workspace',
      projectPath: '/linked/grpc',
      request: {
        executable: 'cmake',
        args: ['--fresh', '-S', '.', '-B', 'build'],
        purpose: 'build',
      },
    });
    expect(plan).toMatchObject({
      cwd: '/linked/grpc',
      executable: 'cmake',
      mutatesSource: false,
    });
    expect(() =>
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/managed/workspace',
        projectPath: '/linked/grpc',
        request: {
          executable: 'cmake',
          args: ['--fresh', '-S', '.', '-B', 'build'],
          cwd: '../sibling',
          purpose: 'build',
        },
      })
    ).toThrow('workspace/project');
  });

  it.each([
    ['npx', ['--no-install', 'workspai', 'workspace', 'verify', '--json']],
    ['npx', ['--no-install', 'workspai@0.64.0', 'doctor', 'workspace', '--json']],
    ['pnpm', ['dlx', 'workspai', 'workspace', 'run', 'init']],
    ['npm', ['exec', '--', 'wspai', 'workspace', 'analyze']],
  ] as const)('rejects Workspai commands from the generic %s executor', (executable, args) => {
    expect(() =>
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable,
          args: [...args],
          purpose: 'inspect',
        },
      })
    ).toThrow('run-governed-command');
  });

  it('gives project validation the ten-minute execution budget', () => {
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'pytest', args: ['-q'], purpose: 'test' },
      }).timeoutMs
    ).toBe(600_000);
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'git', args: ['status', '--short'], purpose: 'inspect' },
      }).timeoutMs
    ).toBe(120_000);
  });

  it('reports a timeout instead of the ambiguous no-exit-code message', () => {
    const plan = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: {
        executable: 'pytest',
        args: ['-q'],
        purpose: 'test',
      },
    });
    expect(
      describeStudioWorkspaceCommandFailure({
        ...plan,
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true,
      })
    ).toBe('Workspace command timed out after 600000ms.');
  });

  it('reports an external termination signal instead of an ambiguous exit failure', () => {
    const plan = resolveStudioWorkspaceCommandPlan({
      workspacePath: '/workspace',
      request: { executable: 'pytest', args: ['-q'], purpose: 'test' },
    });
    expect(
      describeStudioWorkspaceCommandFailure({
        ...plan,
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        terminationSignal: 'SIGTERM',
      })
    ).toBe('Workspace command was terminated by SIGTERM.');
  });

  it('rejects cwd and project-local executable escapes', () => {
    expect(() =>
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'npm', args: ['test'], cwd: '../other', purpose: 'test' },
      })
    ).toThrow('cwd escapes');
    expect(() =>
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: {
          executable: '../../outside-tool',
          args: ['test'],
          cwd: 'service',
          purpose: 'test',
        },
      })
    ).toThrow('escapes');
  });

  it('does not let a stalled progress consumer block process completion or cancellation setup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-command-progress-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'probe.js'), 'console.log("done")');
    const result = await runStudioWorkspaceCommand(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: root,
        request: { executable: 'node', args: ['probe.js'], purpose: 'diagnose' },
      }),
      { onProcessEvent: () => new Promise<void>(() => {}) }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('done');
  });

  it('reports exit before output-file reading so postprocessing cannot display an exited process as running', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-command-exit-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'probe.js'), 'console.log("completed-output")');
    let completed = false;
    let outputReadAfterCompletion = false;
    const originalRead = nativeFs.readFile.bind(nativeFs);
    const read = vi.spyOn(nativeFs, 'readFile').mockImplementation((...args) => {
      if (String(args[0]).endsWith('stdout.log')) outputReadAfterCompletion = completed;
      return originalRead(...args);
    });
    try {
      const result = await runStudioWorkspaceCommand(
        resolveStudioWorkspaceCommandPlan({
          workspacePath: root,
          request: { executable: 'node', args: ['probe.js'], purpose: 'diagnose' },
        }),
        {
          onProcessEvent: (event) => {
            if (event.phase === 'completed') completed = true;
          },
        }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('completed-output');
      expect(outputReadAfterCompletion).toBe(true);
    } finally {
      read.mockRestore();
    }
  });

  it('executes without a shell and strips sensitive extension environment values', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-command-run-'));
    roots.push(root);
    await fs.writeFile(
      path.join(root, 'probe.js'),
      'console.log(JSON.stringify({arg:process.argv[2],secret:process.env.WORKSPAI_TEST_SECRET,path:Boolean(process.env.PATH)}));'
    );
    process.env.WORKSPAI_TEST_SECRET = 'must-not-leak';
    try {
      const plan = resolveStudioWorkspaceCommandPlan({
        workspacePath: root,
        request: {
          executable: 'node',
          args: ['probe.js', '; touch shell-was-used'],
          purpose: 'diagnose',
        },
      });
      const result = await runStudioWorkspaceCommand(plan);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        arg: '; touch shell-was-used',
        path: true,
      });
      expect(await fs.pathExists(path.join(root, 'shell-was-used'))).toBe(false);
    } finally {
      delete process.env.WORKSPAI_TEST_SECRET;
    }
  });
});
