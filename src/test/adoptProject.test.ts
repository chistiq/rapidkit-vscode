import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

const {
  showWarningMessageMock,
  showInformationMessageMock,
  showErrorMessageMock,
  showQuickPickMock,
  executeCommandMock,
  trackCommandEventMock,
  runMock,
  refreshAfterOnboardMock,
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  showQuickPickMock: vi.fn(),
  executeCommandMock: vi.fn(),
  trackCommandEventMock: vi.fn(),
  runMock: vi.fn(),
  refreshAfterOnboardMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
    showErrorMessage: showErrorMessageMock,
    showQuickPick: showQuickPickMock,
    withProgress: async (
      _options: unknown,
      task: (progress: { report: (value: unknown) => void }) => Promise<unknown>
    ) => {
      return task({ report: vi.fn() });
    },
  },
  commands: {
    executeCommand: executeCommandMock,
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

vi.mock('../utils/exec', () => ({
  run: runMock,
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../utils/constants', () => ({
  getExtensionVersion: () => '0.35.0',
}));

vi.mock('../utils/platformCapabilities', () => ({
  buildNpxRapidkitArgs: (args: string[] = []) => ['--yes', 'rapidkit', ...args],
  warmRapidkitNpmPackageResolution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../core/rapidkitCliCapabilities', () => ({
  gateAdoptCli: vi.fn().mockResolvedValue(true),
}));

vi.mock('../core/moduleEnablementPrompt', () => ({
  resolveEnableModulesPreference: vi.fn().mockResolvedValue(false),
}));

vi.mock('../core/npmProjectOnboardRefresh', () => ({
  refreshExtensionAfterNpmProjectOnboard: refreshAfterOnboardMock,
}));

vi.mock('../utils/workspaceUsageTracker', () => ({
  WorkspaceUsageTracker: {
    getInstance: () => ({
      trackCommandEvent: trackCommandEventMock,
    }),
  },
}));

import { adoptProjectCommand } from '../commands/adoptProject';

describe('adoptProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // no-op
  });

  async function createTempProject(name = 'frontend-app'): Promise<{
    workspacePath: string;
    projectPath: string;
    projectName: string;
  }> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-adopt-'));
    const projectPath = path.join(workspacePath, name);
    await fs.ensureDir(projectPath);
    return { workspacePath, projectPath, projectName: name };
  }

  it('delegates adopt to npm CLI without forcing --workspace on fresh install', async () => {
    const { projectPath, projectName } = await createTempProject('frontend-app');

    await fs.writeJSON(path.join(projectPath, 'package.json'), {
      name: projectName,
      version: '1.0.0',
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
    });

    runMock.mockResolvedValue({
      stdout: JSON.stringify({
        workspacePath: '/home/user/rapidkit/workspaces/workspai',
        workspaceResolution: 'default-auto',
        defaultWorkspaceCreated: true,
        adoptedProject: {
          name: projectName,
          path: projectPath,
          relativePath: projectName,
          relationship: 'adopted',
          stack: 'nextjs',
          runtime: 'node',
          framework: 'nextjs',
          frameworkDisplayName: 'Next.js',
          supportTier: 'extended',
          moduleSupport: false,
          confidence: 'high',
          wroteFiles: true,
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const ok = await adoptProjectCommand({
      projectPath,
      projectName,
      useDefaultWorkspace: true,
    });

    expect(ok).toBe(true);
    expect(runMock).toHaveBeenCalledWith(
      'npx',
      ['--yes', 'rapidkit', 'adopt', projectPath, '--json', '--name', projectName],
      expect.objectContaining({
        cwd: projectPath,
        timeout: 120_000,
      })
    );
    expect(refreshAfterOnboardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: '/home/user/rapidkit/workspaces/workspai',
        projectPath,
        projectName,
      })
    );
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      '/home/user/rapidkit/workspaces/workspai',
      expect.objectContaining({
        result: 'success',
        projectName,
        adoptionEngine: 'rapidkit-npm',
      })
    );
  });

  it('passes explicit workspace when provided', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    runMock.mockResolvedValue({
      stdout: JSON.stringify({
        workspacePath,
        adoptedProject: {
          name: projectName,
          path: projectPath,
          framework: 'unknown',
          stack: 'unknown',
          runtime: 'unknown',
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      useDefaultWorkspace: false,
    });

    expect(ok).toBe(true);
    expect(runMock).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        'rapidkit',
        'adopt',
        projectPath,
        '--json',
        '--workspace',
        workspacePath,
        '--name',
        projectName,
      ],
      expect.any(Object)
    );
  });

  it('fails closed when npm adopt fails', async () => {
    const { projectPath, projectName } = await createTempProject();

    runMock.mockResolvedValue({ stdout: 'npx failed', stderr: 'offline', exitCode: 1 });

    const ok = await adoptProjectCommand({
      projectPath,
      projectName,
      useDefaultWorkspace: true,
    });

    expect(ok).toBe(false);
    expect(showErrorMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to adopt project')
    );
  });

  it('returns early when project is already managed', async () => {
    const { projectPath, projectName } = await createTempProject();

    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJSON(path.join(projectPath, '.rapidkit', 'project.json'), {
      kit_name: 'fastapi.standard',
      runtime: 'python',
    });

    const ok = await adoptProjectCommand({
      projectPath,
      projectName,
      useDefaultWorkspace: true,
    });

    expect(ok).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      `Project "${projectName}" is already managed by Workspai.`
    );
  });
});
