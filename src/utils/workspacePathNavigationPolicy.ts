import { resolveBoundedWorkspaceAbsolutePath } from './workspacePathBoundary';

export type WorkspacePathOpenMode = 'editor' | 'reveal';

/** @deprecated Prefer resolveBoundedWorkspaceAbsolutePath for user-supplied paths. */
export function resolveWorkspaceAbsolutePath(
  workspacePath: string,
  relativeOrAbsolutePath: string
): string {
  return resolveBoundedWorkspaceAbsolutePath(workspacePath, relativeOrAbsolutePath);
}

export function inferWorkspacePathOpenMode(resolvedPath: string): WorkspacePathOpenMode {
  const normalized = resolvedPath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.rapidkit/reports/')) {
    return 'reveal';
  }
  return 'editor';
}
