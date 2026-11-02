import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { detectProjectTypeFromPath } from '../ui/panels/welcomePanelProjectTypeDetection';

const temporaryProjects: string[] = [];

async function createProject(metadata: Record<string, unknown>): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-project-type-'));
  temporaryProjects.push(projectPath);
  await fs.ensureDir(path.join(projectPath, '.workspai'));
  await fs.writeJson(path.join(projectPath, '.workspai', 'project.json'), metadata);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryProjects.splice(0).map((projectPath) => fs.remove(projectPath)));
});

describe('welcome panel project type detection', () => {
  it('uses the canonical project marker for Google ADK projects', async () => {
    const projectPath = await createProject({
      kind: 'agent',
      project_type: 'agent',
      runtime: 'python',
      framework: 'google-adk',
    });

    await expect(detectProjectTypeFromPath(projectPath)).resolves.toBe('agent');
  });

  it('preserves supported frontend project types from canonical metadata', async () => {
    const projectPath = await createProject({
      kind: 'application',
      category: 'frontend',
      runtime: 'node',
      framework: 'nextjs',
    });

    await expect(detectProjectTypeFromPath(projectPath)).resolves.toBe('nextjs');
  });
});
