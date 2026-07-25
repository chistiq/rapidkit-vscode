import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findWorkspaceRootUp,
  hasRapidkitProjectMarkers,
  projectMetadataFileCandidates,
  resolveProjectMetadataFile,
  resolveExplorerFolderContext,
} from '../core/workspacePaths';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.remove(dir);
  }
  tempDirs.length = 0;
});

async function makeTempDir(label: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `rk-explorer-${label}-`));
  tempDirs.push(dir);
  return dir;
}

describe('explorer folder context', () => {
  it('finds workspace root above nested folders', async () => {
    const workspacePath = await makeTempDir('workspace');
    const servicesPath = path.join(workspacePath, 'services');
    await fs.ensureDir(servicesPath);
    await fs.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      name: 'demo-wsp',
      version: 1,
      projects: [],
    });

    expect(findWorkspaceRootUp(servicesPath)).toBe(path.resolve(workspacePath));
  });

  it('detects managed project markers', async () => {
    const projectPath = await makeTempDir('project');
    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJson(path.join(projectPath, '.rapidkit', 'project.json'), {
      name: 'catalog-api',
    });

    expect(hasRapidkitProjectMarkers(projectPath)).toBe(true);
  });

  it('prefers canonical .workspai project metadata over legacy metadata', async () => {
    const projectPath = await makeTempDir('canonical-project');
    await fs.ensureDir(path.join(projectPath, '.workspai'));
    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJson(path.join(projectPath, '.workspai', 'project.json'), { name: 'canonical' });
    await fs.writeJson(path.join(projectPath, '.rapidkit', 'project.json'), { name: 'legacy' });

    expect(projectMetadataFileCandidates(projectPath, 'project.json')).toEqual([
      path.join(projectPath, '.workspai', 'project.json'),
      path.join(projectPath, '.rapidkit', 'project.json'),
    ]);
    expect(resolveProjectMetadataFile(projectPath, 'project.json')).toBe(
      path.join(projectPath, '.workspai', 'project.json')
    );
    expect(hasRapidkitProjectMarkers(projectPath)).toBe(true);
  });

  it('resolves explorer scaffold context inside workspace subfolders', async () => {
    const workspacePath = await makeTempDir('workspace');
    const servicesPath = path.join(workspacePath, 'services');
    await fs.ensureDir(servicesPath);
    await fs.writeJson(path.join(workspacePath, '.rapidkit-workspace'), {
      signature: 'RAPIDKIT_WORKSPACE',
      name: 'demo-wsp',
    });

    expect(resolveExplorerFolderContext(servicesPath)).toEqual({
      folderPath: path.resolve(servicesPath),
      outputParentPath: path.resolve(servicesPath),
      workspaceRoot: path.resolve(workspacePath),
      isStandaloneParent: false,
      isAlreadyManagedProject: false,
    });
  });

  it('marks standalone explorer folders without workspace markers', async () => {
    const folderPath = await makeTempDir('standalone');
    expect(resolveExplorerFolderContext(folderPath)).toMatchObject({
      folderPath: path.resolve(folderPath),
      outputParentPath: path.resolve(folderPath),
      workspaceRoot: undefined,
      isStandaloneParent: true,
      isAlreadyManagedProject: false,
    });
  });
});
