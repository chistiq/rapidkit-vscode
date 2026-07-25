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
