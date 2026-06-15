import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined,
  },
}));

import {
  rankWorkspaceProjectCandidates,
  resolveScopedProjectForWorkspace,
} from '../ui/panels/welcomePanelProjectDiscovery';

describe('welcomePanelProjectDiscovery', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
  });

  async function createAdoptedWorkspaceFixture() {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-welcome-ws-'));
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-welcome-next-'));
    tempRoots.push(workspacePath, projectPath);

    await fs.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.writeJSON(
      path.join(workspacePath, '.rapidkit', 'imported-projects.json'),
      {
        version: 1,
        updatedAt: '2026-06-15T10:00:00.000Z',
        projects: [
          {
            name: 'rapidkit-front',
            path: projectPath,
            relationship: 'adopted',
            stack: 'nextjs',
            runtime: 'node',
            framework: 'nextjs',
            frameworkDisplayName: 'Next.js',
            supportTier: 'extended',
            moduleSupport: false,
            confidence: 'high',
            source: 'adopted-local',
            importedAt: '2026-06-15T10:00:00.000Z',
          },
        ],
      },
      { spaces: 2 }
    );

    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJSON(
      path.join(projectPath, '.rapidkit', 'project.json'),
      { kit_name: 'adopted.nextjs' },
      { spaces: 2 }
    );
    await fs.writeJSON(
      path.join(projectPath, 'package.json'),
      { dependencies: { next: '^15.0.0', react: '^19.0.0' } },
      { spaces: 2 }
    );
    await fs.ensureDir(path.join(projectPath, 'src'));

    const deps = {
      workspaceExplorer: {
        getSelectedWorkspace: () => ({
          name: 'default-workspace',
          path: workspacePath,
          projects: [{ name: 'rapidkit-front', path: projectPath }],
        }),
        getWorkspaceByPath: () => ({
          name: 'default-workspace',
          path: workspacePath,
          projects: [{ name: 'rapidkit-front', path: projectPath }],
        }),
      },
      detectProjectType: async () => 'nextjs',
      readInstalledModules: async () => [],
    };

    return { workspacePath, projectPath, deps };
  }

  it('ranks adopted external projects as first-class workspace candidates', async () => {
    const { workspacePath, projectPath, deps } = await createAdoptedWorkspaceFixture();

    const candidates = await rankWorkspaceProjectCandidates(workspacePath, deps);

    expect(candidates[0]).toMatchObject({
      name: 'rapidkit-front',
      path: projectPath,
      type: 'nextjs',
      fromWorkspaceRegistry: true,
    });
    expect(candidates[0].evidenceSources).toEqual(
      expect.arrayContaining(['framework-markers', 'rapidkit-context', 'workspace-registry'])
    );
  });

  it('resolves adopted external projects before falling back to workspace root scope', async () => {
    const { workspacePath, projectPath, deps } = await createAdoptedWorkspaceFixture();

    const scopedProject = await resolveScopedProjectForWorkspace({ workspacePath }, deps);

    expect(scopedProject).toEqual({
      name: 'rapidkit-front',
      path: projectPath,
      type: 'nextjs',
    });
  });
});
