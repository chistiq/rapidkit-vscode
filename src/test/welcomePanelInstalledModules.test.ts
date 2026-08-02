import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { readInstalledModulesFromProject } from '../ui/panels/welcomePanelInstalledModules';

const temporaryPaths: string[] = [];

async function projectFixture(): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-installed-modules-'));
  temporaryPaths.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((temporaryPath) => fs.remove(temporaryPath)));
});

describe('welcome panel installed module authority', () => {
  it('prefers the canonical Workspai registry over root and legacy compatibility files', async () => {
    const projectPath = await projectFixture();
    const registries = [
      ['.workspai/registry.json', 'canonical'],
      ['registry.json', 'root'],
      ['.rapidkit/registry.json', 'legacy'],
    ] as const;
    for (const [relativePath, slug] of registries) {
      const registryPath = path.join(projectPath, relativePath);
      await fs.ensureDir(path.dirname(registryPath));
      await fs.writeJSON(registryPath, {
        installed_modules: [{ slug, version: '1.0.0', display_name: slug }],
      });
    }

    await expect(readInstalledModulesFromProject(projectPath)).resolves.toEqual([
      { slug: 'canonical', version: '1.0.0', display_name: 'canonical' },
    ]);
  });

  it('retains the legacy registry as a compatibility fallback', async () => {
    const projectPath = await projectFixture();
    const legacyPath = path.join(projectPath, '.rapidkit/registry.json');
    await fs.ensureDir(path.dirname(legacyPath));
    await fs.writeJSON(legacyPath, {
      installed_modules: [{ slug: 'legacy', version: '1.0.0', display_name: 'legacy' }],
    });

    await expect(readInstalledModulesFromProject(projectPath)).resolves.toEqual([
      { slug: 'legacy', version: '1.0.0', display_name: 'legacy' },
    ]);
  });
});
