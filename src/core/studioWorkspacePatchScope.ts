import path from 'node:path';
import type { FilePatch } from './patchApplyEngine.js';
function isChildPathOf(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function normalizePatchesForWorkspaceScope(input: {
  workspacePath: string;
  projectPath?: string;
  patches: FilePatch[];
}): FilePatch[] {
  const workspacePath = path.resolve(input.workspacePath);
  const projectPath = input.projectPath?.trim() ? path.resolve(input.projectPath) : undefined;
  const projectIsInsideWorkspace = Boolean(
    projectPath && isChildPathOf(workspacePath, projectPath)
  );

  const normalizedByPath = new Map<string, FilePatch>();

  for (const patch of input.patches) {
    const rawRelativePath = patch.relativePath.trim();
    const absoluteFromWorkspace = path.isAbsolute(rawRelativePath)
      ? path.resolve(rawRelativePath)
      : path.resolve(workspacePath, rawRelativePath);

    if (
      projectPath &&
      (!projectIsInsideWorkspace || !isChildPathOf(projectPath, absoluteFromWorkspace))
    ) {
      const absoluteFromProject = path.isAbsolute(rawRelativePath)
        ? absoluteFromWorkspace
        : path.resolve(projectPath, rawRelativePath);
      if (isChildPathOf(projectPath, absoluteFromProject)) {
        const normalizedPatch = {
          ...patch,
          relativePath: path.relative(workspacePath, absoluteFromProject),
        };
        normalizedByPath.set(normalizedPatch.relativePath, normalizedPatch);
        continue;
      }
    }

    if (isChildPathOf(workspacePath, absoluteFromWorkspace)) {
      const normalizedPatch = {
        ...patch,
        relativePath: path.relative(workspacePath, absoluteFromWorkspace),
      };
      normalizedByPath.set(normalizedPatch.relativePath, normalizedPatch);
      continue;
    }

    normalizedByPath.set(patch.relativePath, patch);
  }

  return Array.from(normalizedByPath.values());
}
