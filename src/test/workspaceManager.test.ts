import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined,
  },
  window: {
    showErrorMessage: () => undefined,
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
}));

vi.mock('../utils/registryPath', () => ({
  getRegistryDir: () => path.join(os.tmpdir(), 'rapidkit-vscode-tests', 'registry'),
}));

import { WorkspaceManager } from '../core/workspaceManager';

describe('WorkspaceManager (Go support)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (WorkspaceManager as any).instance = undefined;
  });

  it('includes Go projects in workspace project discovery', async () => {
    const manager = WorkspaceManager.getInstance();
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-workspace-'));

    const fastapiPath = path.join(workspacePath, 'api-fastapi');
    fs.mkdirSync(fastapiPath, { recursive: true });
    fs.writeFileSync(path.join(fastapiPath, 'pyproject.toml'), '[tool.poetry]\nname="api"\n');

    const nestPath = path.join(workspacePath, 'api-nest');
    fs.mkdirSync(nestPath, { recursive: true });
    fs.writeFileSync(
      path.join(nestPath, 'package.json'),
      JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } })
    );

    const goPath = path.join(workspacePath, 'api-go');
    fs.mkdirSync(goPath, { recursive: true });
    fs.writeFileSync(path.join(goPath, 'go.mod'), 'module github.com/acme/api-go\n');

    const springPath = path.join(workspacePath, 'api-spring');
    fs.mkdirSync(springPath, { recursive: true });
    fs.writeFileSync(
      path.join(springPath, 'pom.xml'),
      '<project><groupId>com.acme</groupId><artifactId>api-spring</artifactId></project>'
    );

    const projects = await (manager as any).getWorkspaceProjects(workspacePath);
    const names = projects.map((item: { name: string }) => item.name);

    expect(names).toContain('api-fastapi');
    expect(names).toContain('api-nest');
    expect(names).toContain('api-go');
    expect(names).toContain('api-spring');

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('includes adopted external projects from the workspace imported-projects registry', async () => {
    const manager = WorkspaceManager.getInstance();
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-workspace-'));
    const externalProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-next-app-'));

    fs.mkdirSync(path.join(workspacePath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, '.rapidkit', 'imported-projects.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-06-15T10:00:00.000Z',
          projects: [
            {
              name: 'rapidkit-front',
              path: externalProjectPath,
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
        null,
        2
      )
    );
    fs.mkdirSync(path.join(externalProjectPath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(
      path.join(externalProjectPath, '.rapidkit', 'project.json'),
      JSON.stringify({ kit_name: 'adopted.nextjs' }, null, 2)
    );
    fs.writeFileSync(
      path.join(externalProjectPath, 'package.json'),
      JSON.stringify({ dependencies: { next: '^15.0.0', react: '^19.0.0' } }, null, 2)
    );

    const projects = await (manager as any).getWorkspaceProjects(workspacePath);

    expect(projects).toContainEqual({
      name: 'rapidkit-front',
      path: externalProjectPath,
    });

    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(externalProjectPath, { recursive: true, force: true });
  });
});
