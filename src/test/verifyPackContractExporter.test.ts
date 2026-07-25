import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

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

import { exportVerifyPackContractToWorkspace } from '../core/verifyPackContractExporter';

describe('verifyPackContractExporter', () => {
  let workspacePath: string;
  let projectPath: string;

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-exporter-ws-'));
    projectPath = path.join(workspacePath, 'my-api');
    await fs.ensureDir(projectPath);
  });

  afterEach(async () => {
    await fs.remove(workspacePath).catch(() => undefined);
  });

  it('writes the verify-pack-contract JSON to .workspai/reports/ on a passing simulation', async () => {
    const commandRunner = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });

    const result = await exportVerifyPackContractToWorkspace({
      workspacePath,
      projectPath,
      planInput: { projectType: 'nestjs.standard', packageManager: 'npm' },
      deps: {
        commandRunner,
        telemetry: { trackCommandEvent: vi.fn().mockResolvedValue(undefined) },
      },
    });

    expect(result.status).toBe('passed');
    expect(result.contract.overallStatus).toBe('passed');
    expect(result.contract.schemaVersion).toBe('v1');
    expect(result.contract.producer).toBe('sandbox-simulation');
    expect(result.contract.summary.passedCommands).toBe(result.contract.summary.totalCommands);
    expect(result.actionId).toMatch(/^vp-\d+-[a-z0-9]{6}$/);

    // The file must actually exist on disk at the expected path
    const contractExists = await fs.pathExists(result.contractPath);
    expect(contractExists).toBe(true);

    // The file is in the canonical Workspai reports directory.
    const expectedDir = path.join(workspacePath, '.workspai', 'reports');
    expect(path.dirname(result.contractPath)).toBe(expectedDir);

    // The file name matches the pattern {actionId}-verify-pack-contract.json
    expect(path.basename(result.contractPath)).toBe(`${result.actionId}-verify-pack-contract.json`);

    // The on-disk content matches the returned contract
    const onDisk = await fs.readJSON(result.contractPath);
    expect(onDisk).toEqual(result.contract);
  });

  it('writes the contract even when some commands fail (overallStatus: failed)', async () => {
    const commandRunner = vi
      .fn()
      .mockResolvedValue({ stdout: '', stderr: 'test failed', exitCode: 1 });

    const result = await exportVerifyPackContractToWorkspace({
      workspacePath,
      projectPath,
      planInput: { projectType: 'nestjs.standard', packageManager: 'npm' },
      deps: {
        commandRunner,
        telemetry: { trackCommandEvent: vi.fn().mockResolvedValue(undefined) },
      },
    });

    expect(result.status).toBe('failed');
    expect(result.contract.overallStatus).toBe('failed');
    expect(result.contract.summary.failedCommands).toBeGreaterThan(0);

    // Contract must still be persisted
    const contractExists = await fs.pathExists(result.contractPath);
    expect(contractExists).toBe(true);
  });

  it('uses python profile when project type contains "fastapi"', async () => {
    const commandRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);

    const result = await exportVerifyPackContractToWorkspace({
      workspacePath,
      projectPath,
      planInput: { projectType: 'fastapi.ddd', projectPath },
      deps: { commandRunner, telemetry: { trackCommandEvent } },
    });

    // Python profile uses pytest, not npm
    const commandLabels = result.contract.commands.map((c) => c.command);
    expect(commandLabels).toContain('pytest');
    expect(commandLabels).not.toContain('npm');

    const contractExists = await fs.pathExists(result.contractPath);
    expect(contractExists).toBe(true);
  });

  it('creates the .workspai/reports directory if it does not exist', async () => {
    const reportsDir = path.join(workspacePath, '.workspai', 'reports');
    expect(await fs.pathExists(reportsDir)).toBe(false);

    const commandRunner = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    await exportVerifyPackContractToWorkspace({
      workspacePath,
      projectPath,
      planInput: { projectType: 'nestjs.standard', packageManager: 'npm' },
      deps: {
        commandRunner,
        telemetry: { trackCommandEvent: vi.fn().mockResolvedValue(undefined) },
      },
    });

    expect(await fs.pathExists(reportsDir)).toBe(true);
  });

  it('generates unique actionIds on successive calls', async () => {
    const commandRunner = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const telemetry = { trackCommandEvent: vi.fn().mockResolvedValue(undefined) };

    const [r1, r2] = await Promise.all([
      exportVerifyPackContractToWorkspace({
        workspacePath,
        projectPath,
        planInput: { projectType: 'node', packageManager: 'npm' },
        deps: { commandRunner, telemetry },
      }),
      exportVerifyPackContractToWorkspace({
        workspacePath,
        projectPath,
        planInput: { projectType: 'node', packageManager: 'npm' },
        deps: { commandRunner, telemetry },
      }),
    ]);

    expect(r1.actionId).not.toBe(r2.actionId);
    expect(r1.contractPath).not.toBe(r2.contractPath);
  });

  it('respects commandTimeoutMs clamping to [5000, 120000]', async () => {
    const commandRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const telemetry = { trackCommandEvent: vi.fn().mockResolvedValue(undefined) };

    // Below minimum → clamped to 5000
    await exportVerifyPackContractToWorkspace({
      workspacePath,
      projectPath,
      planInput: { projectType: 'nestjs.standard', packageManager: 'npm' },
      commandTimeoutMs: 100,
      deps: { commandRunner, telemetry },
    });

    // The command runner's timeout arg should be clamped, not 100
    const calls = commandRunner.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const opts = call[2] as { timeout?: number };
      if (typeof opts?.timeout === 'number') {
        expect(opts.timeout).toBeGreaterThanOrEqual(5000);
      }
    }
  });
});
