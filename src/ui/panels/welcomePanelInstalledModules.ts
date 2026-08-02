import * as fs from 'fs-extra';
import { projectModuleRegistryCandidates } from '../../utils/workspaceCanonicalPaths';

export async function readInstalledModulesFromProject(
  projectPath: string
): Promise<{ slug: string; version: string; display_name: string }[]> {
  try {
    for (const registryPath of projectModuleRegistryCandidates(projectPath)) {
      if (!(await fs.pathExists(registryPath))) {
        continue;
      }
      const content = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(content);
      return registry.installed_modules || [];
    }
  } catch (error) {
    console.error('[WelcomePanel] Error reading registry.json:', error);
  }
  return [];
}
