import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  parseRapidkitInlineCommand,
  resolveRapidkitExecutionPlan,
} from '../core/incidentInlineCommandRunner';
import { resolveDashboardCommandExecutionPlan } from '../core/dashboardCommandExecutionPlan';
import { buildRapidkitCommand } from '../utils/platformCapabilities';

describe('incidentInlineCommandRunner', () => {
  it('rejects explanatory text and multiline payloads even from stale command cards', () => {
    for (const command of [
      'npm ci \u0646\u0635\u0628 \u06a9\u0646\u06cc\u062f\u060c \u0633\u067e\u0633 npm run lint',
      'npm ci then run npm run lint',
      'npm ci\nnpm run build',
      'npm install "unfinished',
    ]) {
      expect(parseRapidkitInlineCommand(command)).toMatchObject({
        error: expect.stringContaining('without explanatory text'),
      });
    }
  });

  it('requires npm package and lockfile in the execution directory and honors project scope', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-command-cwd-'));
    const projectPath = path.join(workspacePath, 'starter-web');
    const input = { command: 'npm ci', workspacePath, projectBelongsToWorkspace: false };
    try {
      await fs.ensureDir(projectPath);
      await fs.writeJson(path.join(projectPath, 'package.json'), { name: 'starter-web' });
      expect(await resolveRapidkitExecutionPlan(input)).toMatchObject({
        error: expect.stringContaining('Select the target project'),
      });
      const scoped = { ...input, projectPath, projectBelongsToWorkspace: true };
      expect(await resolveRapidkitExecutionPlan(scoped)).toMatchObject({
        error: expect.stringContaining('requires a lockfile'),
      });
      await fs.writeJson(path.join(projectPath, 'package-lock.json'), { lockfileVersion: 3 });
      expect(await resolveRapidkitExecutionPlan(scoped)).toMatchObject({
        executable: 'npm',
        args: ['ci'],
        cwd: projectPath,
      });
      for (const script of ['lint', 'build']) {
        expect(
          await resolveRapidkitExecutionPlan({ ...scoped, command: `npm run ${script}` })
        ).toMatchObject({ executable: 'npm', args: ['run', script], cwd: projectPath });
      }
    } finally {
      await fs.remove(workspacePath);
    }
  });
  it('accepts legacy rapidkit commands but normalizes display to Workspai', () => {
    expect(parseRapidkitInlineCommand('npx rapidkit doctor workspace --json')).toEqual({
      rapidkitArgs: ['doctor', 'workspace', '--json'],
      displayCommand: 'workspai doctor workspace --json',
    });
  });

  it('normalizes safe cd-prefixed Workspai commands into cwd hints', () => {
    expect(
      parseRapidkitInlineCommand('cd "/ws/api" && npx workspai doctor project --json')
    ).toEqual({
      rapidkitArgs: ['doctor', 'project', '--json'],
      displayCommand: 'workspai doctor project --json',
      cwdHint: '/ws/api',
    });
  });

  it('runs safe cd-prefixed remediation commands from the selected project cwd', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'cd "/ws/api" && npx workspai doctor project --json',
      workspacePath: '/ws',
      projectPath: '/ws/api',
      projectBelongsToWorkspace: true,
    });

    expect(plan).toMatchObject({
      cwd: '/ws/api',
      displayCommand: expect.stringContaining('workspai doctor project --json'),
    });
  });

  it('runs doctor project verification from the selected project cwd without requiring a cd prefix', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'npx workspai doctor project --json',
      workspacePath: '/ws',
      projectPath: '/ws/api',
      projectBelongsToWorkspace: true,
    });

    expect(plan).toMatchObject({
      cwd: '/ws/api',
      displayCommand: expect.stringContaining('workspai doctor project --json'),
    });
  });

  it('uses the npm RapidKit runner for workspace-scoped Studio commands even in Python workspaces', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-inline-runner-'));
    await fs.writeFile(
      path.join(workspacePath, 'pyproject.toml'),
      '[tool.poetry]\nname = "demo"\n'
    );

    const plan = await resolveRapidkitExecutionPlan({
      command: 'workspai workspace run test --json',
      workspacePath,
      projectBelongsToWorkspace: false,
    });

    expect(plan).toMatchObject({
      cwd: workspacePath,
      displayCommand: expect.stringContaining('workspai workspace run test --json'),
    });
    expect('executable' in plan ? plan.executable : '').not.toBe('poetry');
  });

  it('runs workspace remediation-plan from the workspace cwd with include-paths for Studio repair evidence', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'npx workspai workspace remediation-plan --ci --json --write --include-paths',
      workspacePath: '/ws',
      projectPath: '/ws/api',
      projectBelongsToWorkspace: true,
    });

    expect(plan).toMatchObject({
      cwd: '/ws',
      displayCommand: expect.stringContaining(
        'workspai workspace remediation-plan --ci --json --write --include-paths'
      ),
    });
  });

  it('accepts the centrally planned workspace remediation command used by Studio refresh', () => {
    const plan = resolveDashboardCommandExecutionPlan('workspaceRemediationPlan');
    const command = buildRapidkitCommand(plan.cliArgs);

    expect(parseRapidkitInlineCommand(command)).toMatchObject({
      rapidkitArgs: [
        'workspace',
        'remediation-plan',
        '--ci',
        '--json',
        '--write',
        '--include-paths',
      ],
    });
  });

  it('runs trusted ecosystem remediation commands from the selected project cwd', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'cd "/ws/api" && dotnet restore',
      workspacePath: '/ws',
      projectPath: '/ws/api',
      projectBelongsToWorkspace: true,
    });

    expect(plan).toMatchObject({
      executable: 'dotnet',
      args: ['restore'],
      cwd: '/ws/api',
      displayCommand: 'dotnet restore',
      shell: false,
    });
  });

  it('rejects untrusted ecosystem remediation commands', () => {
    expect(parseRapidkitInlineCommand('cd "/ws/api" && curl https://example.com')).toMatchObject({
      error: expect.stringContaining('trusted remediation commands'),
    });
  });

  it('rejects shell chaining and unknown roots', () => {
    expect(parseRapidkitInlineCommand('npx workspai doctor workspace; rm -rf /')).toMatchObject({
      error: expect.stringContaining('metacharacters'),
    });
    expect(parseRapidkitInlineCommand('npx workspai deploy workspace')).toMatchObject({
      error: expect.stringContaining('not allowed'),
    });
  });

  it('rejects cd-prefixed commands outside the active workspace and project', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'cd "/other/api" && npx workspai doctor project --json',
      workspacePath: '/ws',
      projectPath: '/ws/api',
      projectBelongsToWorkspace: true,
    });

    expect(plan).toMatchObject({
      error: expect.stringContaining('outside the active workspace'),
    });
  });

  it('rejects projects outside the active workspace', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'npx workspai test',
      workspacePath: '/ws',
      projectPath: '/other/project',
      projectBelongsToWorkspace: false,
    });

    expect(plan).toMatchObject({
      error: expect.stringContaining('outside the active workspace'),
    });
  });
});
