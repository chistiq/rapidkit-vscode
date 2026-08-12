import * as path from 'path';

import { resolveBoundedWorkspaceAbsolutePath } from '../utils/workspacePathBoundary.js';
import {
  readWorkspaceRegistrySummaryFromDisk,
  type WorkspaceRegistrySummary,
} from './workspaceRegistrySummary.js';

export type WorkspaceGraphArtifactResolution = {
  path: string;
  projectRoot: string;
  projectId: string;
};

export function resolveWorkspaceGraphArtifactFromRegistry(
  workspacePath: string,
  artifactPath: string,
  registry: WorkspaceRegistrySummary
): WorkspaceGraphArtifactResolution | null {
  const normalized = artifactPath.trim().replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments[0] !== 'external' || segments.length < 3) {
    return null;
  }
  const projectId = segments[1];
  const relativeArtifactPath = segments.slice(2).join('/');
  if (
    !projectId ||
    !relativeArtifactPath ||
    segments.some((segment) => segment === '..' || segment === '.')
  ) {
    return null;
  }
  const project = registry.projects.find(
    (candidate) => candidate.slug.toLocaleLowerCase() === projectId.toLocaleLowerCase()
  );
  if (!project) {
    return null;
  }
  const projectRoot = path.resolve(workspacePath, project.relativePath);
  return {
    path: resolveBoundedWorkspaceAbsolutePath(projectRoot, relativeArtifactPath),
    projectRoot,
    projectId: project.slug,
  };
}

export async function resolveWorkspaceGraphArtifact(
  workspacePath: string,
  artifactPath: string
): Promise<WorkspaceGraphArtifactResolution | null> {
  if (!artifactPath.trim().replace(/\\/g, '/').startsWith('external/')) {
    return null;
  }
  const registry = await readWorkspaceRegistrySummaryFromDisk(workspacePath);
  return registry
    ? resolveWorkspaceGraphArtifactFromRegistry(workspacePath, artifactPath, registry)
    : null;
}
