import path from 'node:path';

export type ChatBrainContextHost = {
  resolveTelemetryWorkspacePath: () => string | undefined;
  resolveScopedProjectForWorkspace: (input: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
  }) => Promise<{ path: string; name?: string; type?: string } | null>;
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>;
};

export async function buildChatBrainAIContext(
  host: ChatBrainContextHost,
  options?: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeIntent?: 'workspace' | 'project';
  }
): Promise<import('../../core/aiService').AIModalContext> {
  const resolvedWorkspacePath = options?.workspacePath || host.resolveTelemetryWorkspacePath();
  const explicitProjectPath = options?.projectPath?.trim();
  const isProjectScope = Boolean(explicitProjectPath) || options?.scopeIntent === 'project';
  const selectedProject = isProjectScope
    ? await host.resolveScopedProjectForWorkspace({
        workspacePath: resolvedWorkspacePath,
        projectPath: explicitProjectPath,
        projectName: options?.projectName,
        projectType: options?.projectType,
      })
    : null;
  const selectedProjectBelongsToWorkspace = Boolean(selectedProject);
  const effectiveContextPath =
    selectedProjectBelongsToWorkspace && selectedProject
      ? selectedProject.path
      : resolvedWorkspacePath;
  const framework = selectedProjectBelongsToWorkspace
    ? selectedProject?.type ||
      (effectiveContextPath
        ? await host.inferFrameworkFromWorkspace(effectiveContextPath)
        : 'unknown')
    : resolvedWorkspacePath
      ? 'mixed'
      : 'unknown';

  return {
    type: selectedProjectBelongsToWorkspace ? 'project' : 'workspace',
    name:
      selectedProjectBelongsToWorkspace && selectedProject
        ? selectedProject.name || path.basename(selectedProject.path)
        : resolvedWorkspacePath
          ? path.basename(resolvedWorkspacePath)
          : 'Workspace',
    path: effectiveContextPath,
    framework,
    workspaceRootPath: resolvedWorkspacePath,
    projectRootPath:
      selectedProjectBelongsToWorkspace && selectedProject ? selectedProject.path : undefined,
  };
}
