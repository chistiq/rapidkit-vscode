import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  loadWorkspaces: vi.fn(),
  getWorkspaces: vi.fn(),
  addWorkspace: vi.fn(),
  touchWorkspace: vi.fn(),
}));

vi.mock('../core/rapidkitCLI', () => ({
  WorkspaiCLI: class {
    createWorkspace = mocks.createWorkspace;
  },
}));

vi.mock('../core/workspaceManager', () => ({
  WorkspaceManager: {
    getInstance: () => ({
      loadWorkspaces: mocks.loadWorkspaces,
      getWorkspaces: mocks.getWorkspaces,
      addWorkspace: mocks.addWorkspace,
      touchWorkspace: mocks.touchWorkspace,
    }),
  },
}));

import { ensureWorkspaceSkeletonViaNpm } from '../core/ensureManagedDefaultWorkspace';

describe('managed default workspace creation', () => {
  let fixtureRoot = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-managed-default-'));
    mocks.loadWorkspaces.mockResolvedValue(undefined);
    mocks.getWorkspaces.mockReturnValue([]);
    mocks.addWorkspace.mockResolvedValue(true);
  });

  afterEach(async () => {
    await fs.remove(fixtureRoot);
  });

  it('creates a missing managed parent before invoking the canonical CLI', async () => {
    const workspacePath = path.join(fixtureRoot, '.workspai', 'workspaces', 'workspai');
    mocks.createWorkspace.mockImplementation(async (options: { parentPath: string }) => {
      expect(await fs.pathExists(options.parentPath)).toBe(true);
      await fs.ensureDir(workspacePath);
      await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), 'profile=minimal\n');
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await ensureWorkspaceSkeletonViaNpm(workspacePath, 'workspai');

    expect(mocks.createWorkspace).toHaveBeenCalledWith({
      name: 'workspai',
      parentPath: path.dirname(workspacePath),
      profile: 'minimal',
      skipPythonEngine: true,
      skipGit: true,
    });
    expect(mocks.addWorkspace).toHaveBeenCalledWith(workspacePath);
  });

  it('deduplicates concurrent creation for the same managed workspace', async () => {
    const workspacePath = path.join(fixtureRoot, '.workspai', 'workspaces', 'workspai');
    mocks.createWorkspace.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await fs.ensureDir(workspacePath);
      await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), 'profile=minimal\n');
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await Promise.all([
      ensureWorkspaceSkeletonViaNpm(workspacePath, 'workspai'),
      ensureWorkspaceSkeletonViaNpm(workspacePath, 'workspai'),
    ]);

    expect(mocks.createWorkspace).toHaveBeenCalledTimes(1);
  });

  it('reports the subprocess diagnostic instead of an unknown error', async () => {
    const workspacePath = path.join(fixtureRoot, '.workspai', 'workspaces', 'workspai');
    mocks.createWorkspace.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
      shortMessage: 'spawn npx ENOENT',
    });

    await expect(ensureWorkspaceSkeletonViaNpm(workspacePath, 'workspai')).rejects.toThrow(
      'spawn npx ENOENT'
    );
  });

  it('rejects a false-success CLI response when no workspace marker exists', async () => {
    const workspacePath = path.join(fixtureRoot, '.workspai', 'workspaces', 'workspai');
    mocks.createWorkspace.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await expect(ensureWorkspaceSkeletonViaNpm(workspacePath, 'workspai')).rejects.toThrow(
      'did not create a workspace marker'
    );
    expect(mocks.addWorkspace).not.toHaveBeenCalled();
  });
});
