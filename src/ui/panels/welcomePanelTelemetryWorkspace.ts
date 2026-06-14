/**
 * Pure helper functions for resolving telemetry workspace paths.
 * These helpers extract logic from the WelcomePanel class for workspace path resolution
 * used in tracking and experiment seeding.
 */

/**
 * Resolve the workspace path for telemetry tracking.
 * Uses multiple fallback strategies to find the workspace root.
 *
 * @param selectedProject - The currently selected project path (or null)
 * @param selectedWorkspacePath - The selected workspace path from explorer
 * @returns The resolved workspace path, or undefined if none found
 */
export function resolveTelemetryWorkspacePath(
  selectedProject: { path: string; workspacePath?: string } | null | undefined,
  selectedWorkspacePath: string | undefined,
  workspaceFolders: readonly { uri: { fsPath: string } }[] | undefined
): string | undefined {
  if (selectedWorkspacePath) {
    return selectedWorkspacePath;
  }

  if (selectedProject) {
    if (selectedProject.workspacePath) {
      return selectedProject.workspacePath;
    }

    // Import path module inline to avoid top-level dependency
    const path = require('path');
    return path.dirname(selectedProject.path);
  }

  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}
