import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
} from '../core/studioWorkspaceCommand.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio workspace command capability policy', () => {
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

  it('classifies dependency and formatter commands as source mutations', () => {
    expect(
      resolveStudioWorkspaceCommandPlan({
        workspacePath: '/workspace',
        request: { executable: 'npm', args: ['install'], purpose: 'dependency' },
      }).mutatesSource
    ).toBe(true);
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

  it.each([
    { executable: 'bash', args: ['-lc', 'echo unsafe'], purpose: 'diagnose' as const },
    { executable: 'python3', args: ['-c', 'print(1)'], purpose: 'diagnose' as const },
    { executable: 'node', args: ['--eval', 'process.exit()'], purpose: 'diagnose' as const },
    { executable: 'git', args: ['reset', '--hard'], purpose: 'diagnose' as const },
    { executable: 'npm', args: ['publish'], purpose: 'build' as const },
    { executable: 'npx', args: ['eslint', '.'], purpose: 'diagnose' as const },
    { executable: 'terraform', args: ['apply'], purpose: 'build' as const },
    { executable: 'kubectl', args: ['delete', 'pod', 'api'], purpose: 'diagnose' as const },
    { executable: 'helm', args: ['upgrade', 'api', './chart'], purpose: 'build' as const },
    { executable: 'docker', args: ['run', 'image'], purpose: 'build' as const },
    { executable: 'npm', args: ['test', '--', '../../outside'], purpose: 'test' as const },
    { executable: 'pytest', args: ['--config=/etc/passwd'], purpose: 'test' as const },
    { executable: 'git', args: ['show', 'file:///etc/passwd'], purpose: 'inspect' as const },
  ])('blocks unsafe autonomous invocation $executable $args', (request) => {
    expect(() =>
      resolveStudioWorkspaceCommandPlan({ workspacePath: '/workspace', request })
    ).toThrow();
  });

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
