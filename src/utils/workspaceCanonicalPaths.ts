import * as path from 'path';

export const WORKSPACE_TREE_WATCH_GLOBS = [
  '**/.workspai-workspace',
  '**/.workspai/workspace.json',
  '**/.workspai/workspace-registry.v1.json',
  '**/.workspai/project.json',
  '**/.rapidkit-workspace',
  '**/.rapidkit/workspace.json',
  '**/.rapidkit/project.json',
] as const;

export const WORKSPACE_SCOPED_WATCH_GLOB =
  '**/{.workspai-workspace,.rapidkit-workspace,.workspai/workspace.json,.workspai/workspace-registry.v1.json,.workspai/project.json,.workspai/registry.json,.rapidkit/workspace.json,.rapidkit/project.json,.rapidkit/registry.json}';

export const PROJECT_MODULE_REGISTRY_RELATIVE_PATHS = [
  '.workspai/registry.json',
  'registry.json',
  '.rapidkit/registry.json',
] as const;

export const WORKSPACE_PROFILE_RELATIVE_PATHS = [
  '.workspai/workspace.json',
  '.rapidkit/workspace.json',
] as const;

export function projectModuleRegistryCandidates(projectPath: string): string[] {
  return PROJECT_MODULE_REGISTRY_RELATIVE_PATHS.map((relativePath) =>
    path.join(projectPath, relativePath)
  );
}
