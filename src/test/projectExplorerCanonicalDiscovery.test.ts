import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { executeCommand } = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
}));

vi.mock('vscode', () => {
  class EventEmitter<T> {
    event = vi.fn();
    fire = vi.fn((_value?: T) => undefined);
  }
  class TreeItem {
    constructor(
      public label: string,
      public collapsibleState?: number
    ) {}
  }
  class ThemeIcon {
    static Folder = new ThemeIcon('folder');
    static File = new ThemeIcon('file');
    constructor(public id: string) {}
  }
  return {
    EventEmitter,
    TreeItem,
    ThemeIcon,
    ThemeColor: class ThemeColor {
      constructor(public id: string) {}
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    Uri: { file: (value: string) => ({ fsPath: value }) },
    commands: { executeCommand },
  };
});

import { ProjectExplorerProvider } from '../ui/treeviews/projectExplorer';

const tempRoots: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(tempRoots.splice(0).map((entry) => fs.remove(entry)));
});

describe('primary sidebar canonical project discovery', () => {
  it('discovers a contract-registered project whose only marker is .workspai/project.json', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sidebar-project-'));
    tempRoots.push(workspacePath);
    const projectPath = path.join(workspacePath, 'web-app');
    await fs.ensureDir(path.join(projectPath, '.workspai'));
    await fs.writeJSON(path.join(projectPath, '.workspai', 'project.json'), {
      schema_version: '1.0',
      name: 'web-app',
      kit_name: 'frontend.nextjs',
    });
    await fs.ensureDir(path.join(workspacePath, '.workspai'));
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: new Date().toISOString(),
      workspacePath,
      workspaceName: 'demo',
      projectCount: 1,
      authority: 'workspace.contract.json',
      contractPath: '.workspai/workspace.contract.json',
      registrySummaryPath: '.workspai/workspace-registry.v1.json',
      projects: [
        {
          slug: 'web-app',
          relativePath: 'web-app',
          framework: 'nextjs',
          kit: 'frontend.nextjs',
          source: 'workspace',
        },
      ],
      sources: {
        contract: { exists: true, projectCount: 1 },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: false, projectCount: 0 },
      },
    });

    const provider = new ProjectExplorerProvider();
    (
      provider as unknown as {
        selectedWorkspace: { name: string; path: string; mode: 'full'; projects: [] };
      }
    ).selectedWorkspace = { name: 'demo', path: workspacePath, mode: 'full', projects: [] };

    const projects = await provider.ensureProjectsLoaded();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: 'web-app',
      path: projectPath,
      type: 'nextjs',
      kit: 'frontend.nextjs',
      managed: true,
    });
  });

  it('preserves canonical backend, desktop, and extension taxonomy in the project tree', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sidebar-taxonomy-'));
    tempRoots.push(workspacePath);
    const fixtures = [
      ['rust-api', 'rust.axum', 'rust'],
      ['laravel-api', 'php.laravel', 'laravel'],
      ['tauri-app', 'desktop.tauri', 'tauri'],
      ['electron-app', 'desktop.electron', 'electron'],
      ['editor-extension', 'extension.vscode', 'vscode-extension'],
    ] as const;
    for (const [name, kit] of fixtures) {
      await fs.ensureDir(path.join(workspacePath, name, '.workspai'));
      await fs.writeJSON(path.join(workspacePath, name, '.workspai', 'project.json'), {
        schema_version: '1.0',
        name,
        kit_name: kit,
      });
    }
    await fs.ensureDir(path.join(workspacePath, '.workspai'));
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: new Date().toISOString(),
      workspacePath,
      workspaceName: 'taxonomy',
      projectCount: fixtures.length,
      authority: 'workspace.contract.json',
      contractPath: '.workspai/workspace.contract.json',
      registrySummaryPath: '.workspai/workspace-registry.v1.json',
      projects: fixtures.map(([name, kit]) => ({
        slug: name,
        relativePath: name,
        framework: kit,
        kit,
        source: 'workspace',
      })),
      sources: {
        contract: { exists: true, projectCount: fixtures.length },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: false, projectCount: 0 },
      },
    });

    const provider = new ProjectExplorerProvider();
    (
      provider as unknown as {
        selectedWorkspace: { name: string; path: string; mode: 'full'; projects: [] };
      }
    ).selectedWorkspace = { name: 'taxonomy', path: workspacePath, mode: 'full', projects: [] };

    const projects = await provider.ensureProjectsLoaded();

    expect(projects.map((project) => [project.name, project.type, project.kit]).sort()).toEqual(
      fixtures.map(([name, kit, type]) => [name, type, kit]).sort()
    );
  });
});
