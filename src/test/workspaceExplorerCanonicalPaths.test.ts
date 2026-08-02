import { describe, expect, it } from 'vitest';

import {
  PROJECT_MODULE_REGISTRY_RELATIVE_PATHS,
  WORKSPACE_PROFILE_RELATIVE_PATHS,
  WORKSPACE_SCOPED_WATCH_GLOB,
  WORKSPACE_TREE_WATCH_GLOBS,
  projectModuleRegistryCandidates,
} from '../utils/workspaceCanonicalPaths';

describe('primary sidebar canonical workspace paths', () => {
  it('watches canonical workspace, registry, and project artifacts before legacy markers', () => {
    expect(WORKSPACE_TREE_WATCH_GLOBS).toEqual([
      '**/.workspai-workspace',
      '**/.workspai/workspace.json',
      '**/.workspai/workspace-registry.v1.json',
      '**/.workspai/project.json',
      '**/.rapidkit-workspace',
      '**/.rapidkit/workspace.json',
      '**/.rapidkit/project.json',
    ]);
  });

  it('reads canonical profile and project module registries first', () => {
    expect(WORKSPACE_PROFILE_RELATIVE_PATHS[0]).toBe('.workspai/workspace.json');
    expect(PROJECT_MODULE_REGISTRY_RELATIVE_PATHS[0]).toBe('.workspai/registry.json');
    expect(projectModuleRegistryCandidates('/workspace/api')).toEqual([
      '/workspace/api/.workspai/registry.json',
      '/workspace/api/registry.json',
      '/workspace/api/.rapidkit/registry.json',
    ]);
  });

  it('watches managed workspaces even when they are outside VS Code workspace folders', () => {
    expect(WORKSPACE_SCOPED_WATCH_GLOB).toContain('.workspai/workspace.json');
    expect(WORKSPACE_SCOPED_WATCH_GLOB).toContain('.workspai/workspace-registry.v1.json');
    expect(WORKSPACE_SCOPED_WATCH_GLOB).toContain('.workspai/project.json');
    expect(WORKSPACE_SCOPED_WATCH_GLOB).toContain('.workspai/registry.json');
  });
});
