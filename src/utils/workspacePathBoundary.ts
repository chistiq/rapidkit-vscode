import * as path from 'path';

const SHELL_METACHAR_PATTERN = /[;|`$]|&&|\|\||\$\(/;

export function isPathWithinWorkspaceRoot(workspacePath: string, candidatePath: string): boolean {
  const normalizedWorkspace = path.resolve(workspacePath.trim());
  const normalizedCandidate = path.resolve(candidatePath.trim());
  return (
    normalizedCandidate === normalizedWorkspace ||
    normalizedCandidate.startsWith(`${normalizedWorkspace}${path.sep}`)
  );
}

export function resolveBoundedWorkspaceAbsolutePath(
  workspacePath: string,
  relativeOrAbsolutePath: string
): string {
  const trimmedWorkspace = workspacePath.trim();
  const trimmedPath = relativeOrAbsolutePath.trim();

  if (!trimmedWorkspace || !trimmedPath) {
    throw new Error('Workspace path is not available.');
  }

  if (SHELL_METACHAR_PATTERN.test(trimmedPath)) {
    throw new Error('Path contains unsupported characters.');
  }

  const resolved = path.isAbsolute(trimmedPath)
    ? path.resolve(trimmedPath)
    : path.resolve(trimmedWorkspace, trimmedPath);

  if (!isPathWithinWorkspaceRoot(trimmedWorkspace, resolved)) {
    throw new Error('Path is outside the active workspace boundary.');
  }

  return resolved;
}
