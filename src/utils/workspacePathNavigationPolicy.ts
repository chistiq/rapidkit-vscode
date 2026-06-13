import * as path from 'path';

export type WorkspacePathOpenMode = 'editor' | 'reveal';

export function resolveWorkspaceAbsolutePath(
  workspacePath: string,
  relativeOrAbsolutePath: string
): string {
  const trimmed = relativeOrAbsolutePath.trim();
  return path.isAbsolute(trimmed) ? trimmed : path.join(workspacePath, trimmed);
}

export function inferWorkspacePathOpenMode(resolvedPath: string): WorkspacePathOpenMode {
  const normalized = resolvedPath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.rapidkit/reports/')) {
    return 'reveal';
  }
  return 'editor';
}
