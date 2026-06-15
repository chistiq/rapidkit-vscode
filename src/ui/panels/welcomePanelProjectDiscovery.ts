import * as fs from 'fs-extra';
import * as path from 'path';
import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import {
  readImportedProjectsRegistry,
  resolveImportedProjectPath,
} from '../../utils/importedProjectsRegistry';

export type WorkspaceMarkerSnapshot = {
  signature?: string;
  createdBy?: string;
  version?: string;
  name?: string;
};

export type DoctorEvidenceSnapshotLike = {
  projects?: Array<{
    path?: string;
    name: string;
    modulesCount?: number;
    modulesHealthy?: boolean;
  }>;
};

export type WorkspaceProjectCandidate = {
  name: string;
  path: string;
  type?: string;
  score: number;
  hasRegistry: boolean;
  fromWorkspaceRegistry: boolean;
  modulesCount?: number;
  evidenceSources: string[];
};

export type WorkspaceExplorerLike = {
  getSelectedWorkspace?: () =>
    | { path: string; name?: string; projects?: Array<{ name: string; path: string }> }
    | null
    | undefined;
  getWorkspaceByPath?: (
    workspacePath: string
  ) =>
    | { path: string; name?: string; projects?: Array<{ name: string; path: string }> }
    | null
    | undefined;
};

export type WorkspaceProjectDiscoveryDeps = {
  workspaceExplorer?: WorkspaceExplorerLike;
  detectProjectType: (projectPath: string) => Promise<string | undefined>;
  readInstalledModules: (
    projectPath: string
  ) => Promise<Array<{ slug: string; version: string; display_name: string }>>;
};

export async function readWorkspaceMarkerSnapshot(
  workspacePath: string
): Promise<WorkspaceMarkerSnapshot | undefined> {
  try {
    const markerPath = path.join(workspacePath, '.rapidkit-workspace');
    if (!(await fs.pathExists(markerPath))) {
      return undefined;
    }

    const marker = (await fs.readJSON(markerPath)) as Record<string, unknown>;
    if (!marker || typeof marker !== 'object') {
      return undefined;
    }

    return {
      signature: typeof marker.signature === 'string' ? marker.signature : undefined,
      createdBy: typeof marker.createdBy === 'string' ? marker.createdBy : undefined,
      version: typeof marker.version === 'string' ? marker.version : undefined,
      name: typeof marker.name === 'string' ? marker.name : undefined,
    };
  } catch {
    return undefined;
  }
}

export async function discoverRapidkitProjectPaths(workspacePath: string): Promise<string[]> {
  const discovered = new Set<string>();
  const queue: string[] = [workspacePath];
  const visited = new Set<string>();
  const ignoredDirNames = new Set([
    '.git',
    '.hg',
    '.svn',
    'node_modules',
    'dist',
    'build',
    'target',
    'coverage',
    'htmlcov',
    '.next',
    '.nuxt',
  ]);

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath || visited.has(currentPath)) {
      continue;
    }
    visited.add(currentPath);

    let entries: Array<{ isDirectory: () => boolean; name: string }> = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.startsWith('.') && entry.name !== '.rapidkit') {
        continue;
      }
      if (ignoredDirNames.has(entry.name)) {
        continue;
      }

      const candidatePath = path.resolve(path.join(currentPath, entry.name));
      if (!isWorkspacePathAncestor(workspacePath, candidatePath)) {
        continue;
      }

      const [hasProjectJson, hasContextJson] = await Promise.all([
        fs.pathExists(path.join(candidatePath, '.rapidkit', 'project.json')),
        fs.pathExists(path.join(candidatePath, '.rapidkit', 'context.json')),
      ]);

      if (hasProjectJson || hasContextJson) {
        discovered.add(candidatePath);
      }

      queue.push(candidatePath);
    }
  }

  return [...discovered].sort((a, b) => a.localeCompare(b));
}

export async function rankWorkspaceProjectCandidates(
  workspacePath: string,
  deps: WorkspaceProjectDiscoveryDeps,
  doctorSnapshot?: DoctorEvidenceSnapshotLike
): Promise<WorkspaceProjectCandidate[]> {
  const selectedWorkspace = deps.workspaceExplorer?.getSelectedWorkspace?.();
  const workspaceRecord =
    selectedWorkspace?.path === workspacePath
      ? selectedWorkspace
      : deps.workspaceExplorer?.getWorkspaceByPath?.(workspacePath);

  const candidateMap = new Map<
    string,
    {
      name: string;
      path: string;
      fromWorkspaceRegistry: boolean;
    }
  >();
  const trustedProjectPaths = new Set<string>();

  const addCandidate = (candidate: {
    name: string;
    path: string;
    fromWorkspaceRegistry: boolean;
  }) => {
    const normalizedPath = path.resolve(candidate.path);
    candidateMap.set(normalizedPath, {
      name: candidate.name || path.basename(normalizedPath),
      path: normalizedPath,
      fromWorkspaceRegistry: candidate.fromWorkspaceRegistry,
    });
    if (candidate.fromWorkspaceRegistry) {
      trustedProjectPaths.add(normalizedPath);
    }
  };

  for (const project of workspaceRecord?.projects || []) {
    if (!project.path) {
      continue;
    }
    const normalizedPath = path.resolve(project.path);
    addCandidate({
      name: project.name || path.basename(normalizedPath),
      path: project.path,
      fromWorkspaceRegistry: true,
    });
  }

  const importedRegistryEntries = await readImportedProjectsRegistry(workspacePath);
  for (const project of importedRegistryEntries) {
    const normalizedPath = resolveImportedProjectPath(workspacePath, project.path);
    addCandidate({
      name: project.name || path.basename(normalizedPath),
      path: normalizedPath,
      fromWorkspaceRegistry: true,
    });
  }

  for (const project of doctorSnapshot?.projects || []) {
    if (!project.path) {
      continue;
    }
    const normalizedPath = path.resolve(project.path);
    if (
      !isWorkspacePathAncestor(workspacePath, normalizedPath) &&
      !trustedProjectPaths.has(normalizedPath)
    ) {
      continue;
    }
    if (!candidateMap.has(normalizedPath)) {
      candidateMap.set(normalizedPath, {
        name: project.name || path.basename(normalizedPath),
        path: normalizedPath,
        fromWorkspaceRegistry: false,
      });
    }
  }

  const discoveredProjectPaths = await discoverRapidkitProjectPaths(workspacePath);
  for (const discoveredPath of discoveredProjectPaths) {
    if (!candidateMap.has(discoveredPath)) {
      candidateMap.set(discoveredPath, {
        name: path.basename(discoveredPath),
        path: discoveredPath,
        fromWorkspaceRegistry: false,
      });
    }
  }

  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const projectPath = path.resolve(path.join(workspacePath, entry.name));
      if (!candidateMap.has(projectPath)) {
        candidateMap.set(projectPath, {
          name: entry.name,
          path: projectPath,
          fromWorkspaceRegistry: false,
        });
      }
    }
  } catch {
    // Ignore unreadable workspace directories.
  }

  const ranked: WorkspaceProjectCandidate[] = [];

  for (const candidate of candidateMap.values()) {
    const candidatePath = candidate.path;
    const doctorProjectMatch = (doctorSnapshot?.projects || []).find(
      (project) =>
        (project.path && path.resolve(project.path) === candidatePath) ||
        project.name.toLowerCase() === candidate.name.toLowerCase()
    );

    const [
      hasPrimaryRegistry,
      hasLegacyRegistry,
      hasProjectJson,
      hasContextJson,
      hasPyproject,
      hasPackageJson,
      hasGoMod,
      hasPom,
      hasGradle,
      hasGradleKts,
      hasSrcDir,
      hasRapidkitScript,
      hasVenv,
      hasNodeModules,
    ] = await Promise.all([
      fs.pathExists(path.join(candidatePath, 'registry.json')),
      fs.pathExists(path.join(candidatePath, '.rapidkit', 'registry.json')),
      fs.pathExists(path.join(candidatePath, '.rapidkit', 'project.json')),
      fs.pathExists(path.join(candidatePath, '.rapidkit', 'context.json')),
      fs.pathExists(path.join(candidatePath, 'pyproject.toml')),
      fs.pathExists(path.join(candidatePath, 'package.json')),
      fs.pathExists(path.join(candidatePath, 'go.mod')),
      fs.pathExists(path.join(candidatePath, 'pom.xml')),
      fs.pathExists(path.join(candidatePath, 'build.gradle')),
      fs.pathExists(path.join(candidatePath, 'build.gradle.kts')),
      fs.pathExists(path.join(candidatePath, 'src')),
      fs.pathExists(path.join(candidatePath, 'rapidkit')),
      fs.pathExists(path.join(candidatePath, '.venv')),
      fs.pathExists(path.join(candidatePath, 'node_modules')),
    ]);

    const hasRegistry = hasPrimaryRegistry || hasLegacyRegistry;
    const hasFrameworkMarkers =
      hasPyproject || hasPackageJson || hasGoMod || hasPom || hasGradle || hasGradleKts;
    const hasRuntimeReadyMarkers = hasVenv || hasNodeModules;
    const inferredType = (await deps.detectProjectType(candidatePath)) || undefined;
    const modulesCount =
      hasRegistry && !doctorProjectMatch?.modulesCount
        ? (await deps.readInstalledModules(candidatePath)).length
        : doctorProjectMatch?.modulesCount;
    const evidenceSources = new Set<string>();

    let score = 0;
    if (candidate.fromWorkspaceRegistry) {
      score += 20;
      evidenceSources.add('workspace-registry');
    }
    if (hasRegistry) {
      score += 40;
      evidenceSources.add('project-registry');
    }
    if (hasProjectJson || hasContextJson) {
      score += 25;
      evidenceSources.add('rapidkit-context');
    }
    if (inferredType) {
      score += 30;
    }
    if (hasFrameworkMarkers) {
      score += 15;
      evidenceSources.add('framework-markers');
    }
    if (hasSrcDir) {
      score += 5;
    }
    if (hasRapidkitScript) {
      score += 5;
      evidenceSources.add('rapidkit-launcher');
    }
    if (hasRuntimeReadyMarkers) {
      score += 5;
    }
    if (typeof modulesCount === 'number' && modulesCount > 0) {
      score += Math.min(20, modulesCount * 2);
      evidenceSources.add('installed-modules');
    }
    if (doctorProjectMatch) {
      score += 35;
      evidenceSources.add('doctor-evidence');
      if (doctorProjectMatch.modulesHealthy) {
        score += 10;
      }
    }

    if (score <= 0) {
      continue;
    }

    ranked.push({
      name: candidate.name,
      path: candidatePath,
      type: inferredType,
      score,
      hasRegistry,
      fromWorkspaceRegistry: candidate.fromWorkspaceRegistry,
      modulesCount,
      evidenceSources: [...evidenceSources].sort((a, b) => a.localeCompare(b)),
    });
  }

  return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export async function buildWorkspaceProjectCandidatesBlock(
  workspacePath: string,
  deps: WorkspaceProjectDiscoveryDeps,
  doctorSnapshot?: DoctorEvidenceSnapshotLike
): Promise<string | undefined> {
  const markerSnapshot = await readWorkspaceMarkerSnapshot(workspacePath);
  const ranked = await rankWorkspaceProjectCandidates(workspacePath, deps, doctorSnapshot);
  if (ranked.length === 0) {
    return undefined;
  }

  const lines = ['WORKSPACE PROJECT CANDIDATES:'];
  if (markerSnapshot?.signature || markerSnapshot?.createdBy) {
    lines.push(
      `- Workspace marker: signature=${markerSnapshot.signature || 'unknown'}, createdBy=${markerSnapshot.createdBy || 'unknown'}`
    );
  }
  for (const candidate of ranked.slice(0, 4)) {
    lines.push(
      `- ${candidate.name} (${candidate.type || 'unknown'}) — path: ${candidate.path} | score: ${candidate.score} | registry: ${candidate.hasRegistry ? 'yes' : 'no'} | modules: ${candidate.modulesCount ?? 'n/a'} | evidence: ${candidate.evidenceSources.join(', ') || 'none'}`
    );
  }

  if (ranked.length > 1) {
    const top = ranked[0];
    const second = ranked[1];
    const gap = top.score - second.score;
    lines.push(
      gap >= 15
        ? '- Scope confidence: clear winner detected from project signals.'
        : '- Scope confidence: ambiguous; avoid definitive per-project claims until a target path is confirmed.'
    );
  }

  return lines.join('\n');
}

export async function resolveScopedProjectForWorkspace(
  options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    doctorSnapshot?: DoctorEvidenceSnapshotLike;
  },
  deps: WorkspaceProjectDiscoveryDeps
): Promise<{ name: string; path: string; type?: string } | null> {
  const workspacePath = options.workspacePath;
  if (!workspacePath) {
    return null;
  }

  if (options.projectPath && isWorkspacePathAncestor(workspacePath, options.projectPath)) {
    const inferredType =
      options.projectType || (await deps.detectProjectType(options.projectPath)) || undefined;
    return {
      name: options.projectName || path.basename(options.projectPath),
      path: options.projectPath,
      type: inferredType,
    };
  }

  if (options.projectPath) {
    const normalizedProjectPath = path.resolve(options.projectPath);
    const selectedWorkspace = deps.workspaceExplorer?.getSelectedWorkspace?.();
    const workspaceRecord =
      selectedWorkspace?.path === workspacePath
        ? selectedWorkspace
        : deps.workspaceExplorer?.getWorkspaceByPath?.(workspacePath);
    const registryProjects = workspaceRecord?.projects || [];
    const importedRegistryEntries = await readImportedProjectsRegistry(workspacePath);
    const isTrustedExternalProject =
      registryProjects.some((project) => path.resolve(project.path) === normalizedProjectPath) ||
      importedRegistryEntries.some(
        (project) =>
          resolveImportedProjectPath(workspacePath, project.path) === normalizedProjectPath
      );

    if (isTrustedExternalProject) {
      const inferredType =
        options.projectType || (await deps.detectProjectType(normalizedProjectPath)) || undefined;
      return {
        name: options.projectName || path.basename(normalizedProjectPath),
        path: normalizedProjectPath,
        type: inferredType,
      };
    }
  }

  const resolveSelectedDescendantProject = () => {
    const selectedWorkspace = deps.workspaceExplorer?.getSelectedWorkspace?.();
    if (
      selectedWorkspace &&
      path.resolve(selectedWorkspace.path) !== path.resolve(workspacePath) &&
      isWorkspacePathAncestor(workspacePath, selectedWorkspace.path)
    ) {
      return {
        name: selectedWorkspace.name || path.basename(selectedWorkspace.path),
        path: selectedWorkspace.path,
        type: undefined,
      };
    }
    return null;
  };

  const rankedCandidates = await rankWorkspaceProjectCandidates(
    workspacePath,
    deps,
    options.doctorSnapshot
  );
  if (rankedCandidates.length === 0) {
    return resolveSelectedDescendantProject();
  }

  const chooseByConfidence = () => {
    if (rankedCandidates.length === 1) {
      return rankedCandidates[0].score >= 35 ? rankedCandidates[0] : null;
    }
    const top = rankedCandidates[0];
    const second = rankedCandidates[1];
    const scoreGap = top.score - second.score;
    const clearWinner = top.score >= 45 && scoreGap >= 15;
    return clearWinner ? top : null;
  };

  const candidate = chooseByConfidence();
  if (!candidate) {
    return resolveSelectedDescendantProject();
  }

  return {
    name: candidate.name || path.basename(candidate.path),
    path: candidate.path,
    type: candidate.type,
  };
}
