import { resolveBoundedWorkspaceAbsolutePath } from './workspacePathBoundary';

export type WorkspacePathOpenMode = 'editor' | 'reveal';

/** @deprecated Prefer resolveBoundedWorkspaceAbsolutePath for user-supplied paths. */
export function resolveWorkspaceAbsolutePath(
  workspacePath: string,
  relativeOrAbsolutePath: string
): string {
  return resolveBoundedWorkspaceAbsolutePath(workspacePath, relativeOrAbsolutePath);
}

export function inferWorkspacePathOpenMode(_resolvedPath?: string): WorkspacePathOpenMode {
  return 'editor';
}
