import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const MANAGED_DEFAULT_WORKSPACE_NAME = 'workspai';
export const MANAGED_DEFAULT_WORKSPACE_LABEL = 'Workspai';

export function hasWorkspaceRootMarkers(workspacePath: string): boolean {
  return (
    fs.existsSync(path.join(workspacePath, '.rapidkit-workspace')) ||
    fs.existsSync(path.join(workspacePath, '.rapidkit', 'workspace.json'))
  );
}

export function hasRapidkitProjectMarkers(projectPath: string): boolean {
  return (
    fs.existsSync(path.join(projectPath, '.rapidkit', 'project.json')) ||
    fs.existsSync(path.join(projectPath, '.rapidkit', 'context.json'))
  );
}

export function isPathInsideDirectory(childPath: string, parentPath: string): boolean {
  const child = path.resolve(childPath);
  const parent = path.resolve(parentPath);
  if (child === parent) {
    return true;
  }
  return child.startsWith(`${parent}${path.sep}`);
}

/**
 * Walk upward from startPath and return the nearest RapidKit workspace root.
 */
export function findWorkspaceRootUp(startPath: string, maxDepth = 12): string | undefined {
  let current = path.resolve(startPath);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (hasWorkspaceRootMarkers(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

export interface ExplorerFolderContext {
  folderPath: string;
  outputParentPath: string;
  workspaceRoot?: string;
  isStandaloneParent: boolean;
  isAlreadyManagedProject: boolean;
}

export function resolveExplorerFolderContext(folderPath: string): ExplorerFolderContext {
  const resolvedFolder = path.resolve(folderPath);
  const workspaceRoot = findWorkspaceRootUp(resolvedFolder);
  const isAlreadyManagedProject = hasRapidkitProjectMarkers(resolvedFolder);

  if (workspaceRoot) {
    return {
      folderPath: resolvedFolder,
      outputParentPath: resolvedFolder,
      workspaceRoot,
      isStandaloneParent: false,
      isAlreadyManagedProject,
    };
  }

  if (hasWorkspaceRootMarkers(resolvedFolder)) {
    return {
      folderPath: resolvedFolder,
      outputParentPath: resolvedFolder,
      workspaceRoot: resolvedFolder,
      isStandaloneParent: false,
      isAlreadyManagedProject,
    };
  }

  return {
    folderPath: resolvedFolder,
    outputParentPath: resolvedFolder,
    workspaceRoot: undefined,
    isStandaloneParent: true,
    isAlreadyManagedProject,
  };
}

export function getCanonicalWorkspacesDirectory(homeDir: string = os.homedir()): string {
  return path.join(homeDir, 'rapidkit', 'workspaces');
}

export function getLegacyWorkspacesDirectory(homeDir: string = os.homedir()): string {
  return path.join(homeDir, 'Workspai', 'rapidkits');
}

export function resolveCanonicalWorkspacePath(
  workspaceName: string,
  homeDir: string = os.homedir()
): string {
  return path.join(getCanonicalWorkspacesDirectory(homeDir), workspaceName);
}

export function getKnownWorkspaceLocationCandidates(
  workspaceName: string,
  homeDir: string = os.homedir()
): string[] {
  return [
    resolveCanonicalWorkspacePath(workspaceName, homeDir),
    path.join(getLegacyWorkspacesDirectory(homeDir), workspaceName),
  ];
}

export function resolveNewWorkspacePath(
  workspaceName: string,
  options: { homeDir?: string; outputDir?: string } = {}
): string {
  const homeDir = options.homeDir ?? os.homedir();
  if (options.outputDir) {
    return path.resolve(options.outputDir, workspaceName);
  }
  return resolveCanonicalWorkspacePath(workspaceName, homeDir);
}

export function findExistingWorkspacePath(
  workspaceName: string,
  homeDir: string = os.homedir()
): string | undefined {
  for (const candidate of getKnownWorkspaceLocationCandidates(workspaceName, homeDir)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function getManagedDefaultWorkspaceCandidates(homeDir: string = os.homedir()): string[] {
  return [
    path.join(getCanonicalWorkspacesDirectory(homeDir), MANAGED_DEFAULT_WORKSPACE_NAME),
    path.join(getLegacyWorkspacesDirectory(homeDir), MANAGED_DEFAULT_WORKSPACE_NAME),
  ];
}

export function resolveManagedDefaultImportWorkspacePath(homeDir: string = os.homedir()): string {
  for (const candidate of getManagedDefaultWorkspaceCandidates(homeDir)) {
    if (hasWorkspaceRootMarkers(candidate)) {
      return candidate;
    }
  }

  return resolveCanonicalWorkspacePath(MANAGED_DEFAULT_WORKSPACE_NAME, homeDir);
}

export function isLegacyWorkspacePath(
  workspacePath: string,
  homeDir: string = os.homedir()
): boolean {
  const legacyParent = getLegacyWorkspacesDirectory(homeDir);
  const relativePath = path.relative(legacyParent, path.resolve(workspacePath));
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}

export function isCanonicalWorkspacePath(
  workspacePath: string,
  homeDir: string = os.homedir()
): boolean {
  const canonicalParent = getCanonicalWorkspacesDirectory(homeDir);
  const relativePath = path.relative(canonicalParent, path.resolve(workspacePath));
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}

export function isDefaultWorkspaceCreationPath(
  workspacePath: string,
  workspaceName: string,
  homeDir: string = os.homedir()
): boolean {
  return (
    path.resolve(workspacePath) ===
    path.resolve(resolveNewWorkspacePath(workspaceName, { homeDir }))
  );
}

/** @deprecated Use resolveManagedDefaultImportWorkspacePath */
export const resolveDefaultWorkspacePath = resolveManagedDefaultImportWorkspacePath;
