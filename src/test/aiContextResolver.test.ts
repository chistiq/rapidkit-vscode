import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES } from './fixtures/incidentStudioGraphFixtures';

// Normalize paths to forward slashes and remove Windows drive letters for cross-platform test assertions
const normalizePath = (p?: string) => p?.replace(/\\/g, '/').replace(/^[A-Z]:(?=\/)/, '');

const { mockExecuteCommand, mockGetWorkspaceFolder } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
  mockGetWorkspaceFolder: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  window: {
    activeTextEditor: undefined,
  },
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: mockGetWorkspaceFolder,
  },
}));

let resolvePreferredAIModalContext: typeof import('../core/aiContextResolver').resolvePreferredAIModalContext;
let buildRapidkitCommandScopeSection: typeof import('../core/aiContextResolver').buildRapidkitCommandScopeSection;
let isWorkspacePathAncestor: typeof import('../core/aiContextResolver').isWorkspacePathAncestor;

beforeAll(async () => {
  const mod = await import('../core/aiContextResolver');
  resolvePreferredAIModalContext = mod.resolvePreferredAIModalContext;
  buildRapidkitCommandScopeSection = mod.buildRapidkitCommandScopeSection;
  isWorkspacePathAncestor = mod.isWorkspacePathAncestor;
});

beforeEach(async () => {
  mockExecuteCommand.mockReset();
  mockGetWorkspaceFolder.mockReset();

  const vscode = await import('vscode');
  (
    vscode.workspace as { workspaceFolders?: Array<{ name: string; uri: { fsPath: string } }> }
  ).workspaceFolders = [];
});

describe('aiContextResolver', () => {
  it('prefers selected project and carries workspace root when project is inside selected workspace', async () => {
    mockExecuteCommand.mockImplementation(async (command: string) => {
      if (command === 'workspai.getSelectedProject') {
        return { name: 'billing-api', path: '/tmp/wsp/billing-api', type: 'springboot' };
      }
      if (command === 'workspai.getSelectedWorkspace') {
        return { name: 'wsp', path: '/tmp/wsp' };
      }
      return null;
    });

    const ctx = await resolvePreferredAIModalContext(undefined);

    expect(ctx.type).toBe('project');
    expect(normalizePath(ctx.path)).toBe('/tmp/wsp/billing-api');
    expect(normalizePath(ctx.projectRootPath)).toBe('/tmp/wsp/billing-api');
    expect(normalizePath(ctx.workspaceRootPath)).toBe('/tmp/wsp');
    expect(ctx.framework).toBe('springboot');
  });

  it('keeps project context without workspace root when selected project is outside selected workspace', async () => {
    mockExecuteCommand.mockImplementation(async (command: string) => {
      if (command === 'workspai.getSelectedProject') {
        return { name: 'billing-api', path: '/tmp/project-billing', type: 'fastapi' };
      }
      if (command === 'workspai.getSelectedWorkspace') {
        return { name: 'wsp', path: '/tmp/wsp' };
      }
      return null;
    });

    const ctx = await resolvePreferredAIModalContext(undefined);

    expect(ctx.type).toBe('project');
    expect(normalizePath(ctx.path)).toBe('/tmp/project-billing');
    expect(ctx.workspaceRootPath).toBeUndefined();
  });

  it('uses the canonical workspace binding for an adopted project outside the workspace tree', async () => {
    mockExecuteCommand.mockImplementation(async (command: string) => {
      if (command === 'workspai.getSelectedProject') {
        return {
          name: 'grpc',
          path: '/tmp/reference/grpc',
          type: 'cpp',
          workspacePath: '/tmp/workspai/workspaces/workspai',
        };
      }
      if (command === 'workspai.getSelectedWorkspace') {
        return { name: 'workspai', path: '/tmp/workspai/workspaces/workspai' };
      }
      return null;
    });

    const ctx = await resolvePreferredAIModalContext(undefined);

    expect(ctx.type).toBe('project');
    expect(normalizePath(ctx.projectRootPath)).toBe('/tmp/reference/grpc');
    expect(normalizePath(ctx.workspaceRootPath)).toBe('/tmp/workspai/workspaces/workspai');
  });

  it('returns selected workspace context when project is not selected', async () => {
    mockExecuteCommand.mockImplementation(async (command: string) => {
      if (command === 'workspai.getSelectedProject') {
        return null;
      }
      if (command === 'workspai.getSelectedWorkspace') {
        return { name: 'workspace-a', path: '/tmp/workspace-a' };
      }
      return null;
    });

    const ctx = await resolvePreferredAIModalContext(undefined);

    expect(ctx.type).toBe('workspace');
    expect(normalizePath(ctx.path)).toBe('/tmp/workspace-a');
    expect(normalizePath(ctx.workspaceRootPath)).toBe('/tmp/workspace-a');
  });

  it('falls back to editor workspace folder when no selected project or workspace exists', async () => {
    mockExecuteCommand.mockResolvedValue(null);
    mockGetWorkspaceFolder.mockReturnValue({
      name: 'editor-folder',
      uri: { fsPath: '/tmp/editor-folder' },
    });

    const editor = {
      document: {
        uri: { scheme: 'file', path: '/tmp/editor-folder/main.ts' },
      },
    } as unknown as import('vscode').TextEditor;

    const ctx = await resolvePreferredAIModalContext(editor);

    expect(ctx.type).toBe('project');
    expect(ctx.name).toBe('editor-folder');
    expect(ctx.path).toBe('/tmp/editor-folder');
    expect(ctx.projectRootPath).toBe('/tmp/editor-folder');
  });

  it('falls back to first workspace folder when no editor context exists', async () => {
    mockExecuteCommand.mockResolvedValue(null);
    const vscode = await import('vscode');
    (
      vscode.workspace as { workspaceFolders?: Array<{ name: string; uri: { fsPath: string } }> }
    ).workspaceFolders = [
      {
        name: 'fallback-wsp',
        uri: { fsPath: '/tmp/fallback-wsp' },
      },
    ];

    const ctx = await resolvePreferredAIModalContext(undefined);

    expect(ctx.type).toBe('workspace');
    expect(ctx.name).toBe('fallback-wsp');
    expect(ctx.path).toBe('/tmp/fallback-wsp');
    expect(ctx.workspaceRootPath).toBe('/tmp/fallback-wsp');
  });

  it('marks project-scoped guidance when selected project root exists', () => {
    const section = buildRapidkitCommandScopeSection({
      type: 'project',
      name: 'billing-api',
      path: '/tmp/wsp/billing-api',
      projectRootPath: '/tmp/wsp/billing-api',
      workspaceRootPath: '/tmp/wsp',
      framework: 'springboot',
    });

    expect(section).toContain('Active workspace root: $WORKSPACE (runtime-private)');
    expect(section).toContain('Selected project root: $PROJECT (runtime-private)');
    expect(section).not.toContain('/tmp/wsp');
    expect(section).toContain('npx workspai readiness');
    expect(section).toContain('prefer project-scoped commands there');
  });

  it('warns when no selected project exists', () => {
    const section = buildRapidkitCommandScopeSection({
      type: 'workspace',
      name: 'workspace',
      path: '/tmp/wsp',
      workspaceRootPath: '/tmp/wsp',
    });

    expect(section).toContain('Selected project root: none');
    expect(section).toContain(
      'avoid project-only commands unless you first ask the user to select or create a project'
    );
  });

  it('detects project path under workspace root', () => {
    expect(isWorkspacePathAncestor('/tmp/wsp', '/tmp/wsp/apps/api')).toBe(true);
  });

  it('rejects unrelated paths as workspace ancestors', () => {
    expect(isWorkspacePathAncestor('/tmp/wsp-a', '/tmp/wsp-b/api')).toBe(false);
  });

  it('preserves project-scoped AI context across supported workspace kits', async () => {
    for (const fixture of INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES) {
      mockExecuteCommand.mockImplementation(async (command: string) => {
        if (command === 'workspai.getSelectedProject') {
          return {
            name: fixture.projectName,
            path: fixture.projectPath,
            type: fixture.projectType,
          };
        }
        if (command === 'workspai.getSelectedWorkspace') {
          return { name: fixture.workspaceName, path: fixture.workspacePath };
        }
        return null;
      });

      const ctx = await resolvePreferredAIModalContext(undefined);

      expect(ctx.type).toBe('project');
      expect(normalizePath(ctx.path)).toBe(normalizePath(fixture.projectPath));
      expect(normalizePath(ctx.projectRootPath)).toBe(normalizePath(fixture.projectPath));
      expect(normalizePath(ctx.workspaceRootPath)).toBe(normalizePath(fixture.workspacePath));
      expect(ctx.framework).toBe(fixture.projectType);
    }
  });
});
