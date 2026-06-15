import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

const {
  showWarningMessageMock,
  showInformationMessageMock,
  showErrorMessageMock,
  executeCommandMock,
  trackCommandEventMock,
  runMock,
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  executeCommandMock: vi.fn(),
  trackCommandEventMock: vi.fn(),
  runMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
    showErrorMessage: showErrorMessageMock,
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

vi.mock('../utils/workspaceUsageTracker', () => ({
  WorkspaceUsageTracker: {
    getInstance: () => ({
      trackCommandEvent: trackCommandEventMock,
    }),
  },
}));

import { adoptProjectCommand } from '../commands/adoptProject';

describe('adoptProjectCommand', () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    executeCommandMock.mockImplementation(async (command: string) => {
      if (command === 'workspai.getSelectedWorkspace') {
        return { path: '/tmp/workspace' };
      }
      return undefined;
    });
    runMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
  });

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
  });

  async function createTempProject(projectName = 'demo-project') {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-adopt-'));
    tempRoots.push(root);

    const workspacePath = path.join(root, 'workspace');
    const projectPath = path.join(root, 'external', projectName);

    await fs.ensureDir(workspacePath);
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), 'workspace\n');
    await fs.ensureDir(projectPath);
    await fs.writeFile(path.join(projectPath, 'README.md'), '# demo\n');

    return { root, workspacePath, projectPath, projectName };
  }

  it('delegates adoption to the canonical npm CLI contract first', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject('web-app');

    await fs.writeJSON(path.join(projectPath, 'package.json'), {
      name: projectName,
      version: '1.0.0',
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
    });

    showWarningMessageMock.mockResolvedValue('Adopt');
    runMock.mockResolvedValue({
      stdout: JSON.stringify({
        workspacePath,
        workspaceResolution: 'explicit',
        dryRun: false,
        adoptedProject: {
          name: projectName,
          path: projectPath,
          relativePath: path.relative(workspacePath, projectPath),
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
      workspacePath,
      projectPath,
      projectName,
      projectType: 'nextjs',
    });

    expect(ok).toBe(true);
    expect(runMock).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        '--package',
        'rapidkit',
        'rapidkit',
        'adopt',
        projectPath,
        '--workspace',
        workspacePath,
        '--name',
        projectName,
        '--json',
      ],
      expect.objectContaining({
        cwd: workspacePath,
        timeout: 120_000,
      })
    );
    expect(executeCommandMock).toHaveBeenCalledWith('workspai.refreshProjects');
    expect(executeCommandMock).toHaveBeenCalledWith('workspai.refreshWorkspaces');
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'success',
        projectName,
        detectedType: 'nextjs',
        runtime: 'node',
        adoptionEngine: 'rapidkit-npm',
      })
    );
  });

  it('falls back to aligned local adoption metadata when npm CLI is unavailable', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject('frontend-app');

    await fs.writeJSON(path.join(projectPath, 'package.json'), {
      name: projectName,
      version: '1.0.0',
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
    });

    showWarningMessageMock.mockResolvedValue('Adopt');
    runMock.mockResolvedValue({ stdout: 'npx failed', stderr: 'offline', exitCode: 1 });

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(true);

    const rapidkitDir = path.join(projectPath, '.rapidkit');
    const projectJson = await fs.readJSON(path.join(rapidkitDir, 'project.json'));
    const adoptJson = await fs.readJSON(path.join(rapidkitDir, 'adopt.json'));
    const readinessJson = await fs.readJSON(path.join(rapidkitDir, 'adopt-readiness.json'));
    const registryJson = await fs.readJSON(
      path.join(workspacePath, '.rapidkit', 'imported-projects.json')
    );

    expect(projectJson.kit_name).toBe('adopted.nextjs');
    expect(projectJson.framework).toBe('nextjs');
    expect(projectJson.runtime).toBe('node');
    expect(projectJson.project_kind).toBe('frontend');
    expect(adoptJson.detection.framework).toBe('nextjs');
    expect(readinessJson.status).toBe('observed');
    expect(registryJson.projects).toEqual([
      expect.objectContaining({
        name: projectName,
        path: projectPath,
        relationship: 'adopted',
        stack: 'nextjs',
        runtime: 'node',
        framework: 'nextjs',
        source: 'adopted-local',
      }),
    ]);
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'success',
        projectName,
        detectedType: 'nextjs',
        adoptionEngine: 'extension-fallback',
      })
    );
  });

  it('does not write markers when user cancels confirmation', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    showWarningMessageMock.mockResolvedValue('Cancel');

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(false);
    expect(await fs.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))).toBe(false);
    expect(runMock).not.toHaveBeenCalled();

    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'cancelled',
        projectName,
      })
    );
  });

  it('returns early when project is already managed', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJSON(path.join(projectPath, '.rapidkit', 'project.json'), {
      kit_name: 'fastapi.standard',
      runtime: 'python',
    });

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      `Project "${projectName}" is already managed by Workspai.`
    );
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'already-managed',
        projectName,
      })
    );
  });
});
