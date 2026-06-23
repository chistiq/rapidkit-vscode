import * as fs from 'fs-extra';
import * as path from 'path';

export async function readInstalledModulesFromProject(
  projectPath: string
): Promise<{ slug: string; version: string; display_name: string }[]> {
  try {
    const primaryRegistryPath = path.join(projectPath, 'registry.json');
    const legacyRegistryPath = path.join(projectPath, '.rapidkit', 'registry.json');

    const primaryExists = await fs.pathExists(primaryRegistryPath);
    const legacyExists = await fs.pathExists(legacyRegistryPath);

    const registryPath = primaryExists ? primaryRegistryPath : legacyRegistryPath;
    const exists = primaryExists || legacyExists;

    if (exists) {
      const content = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(content);
      return registry.installed_modules || [];
    }
  } catch (error) {
    console.error('[WelcomePanel] Error reading registry.json:', error);
  }
  return [];
}
