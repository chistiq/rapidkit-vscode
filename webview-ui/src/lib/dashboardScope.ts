import type { WorkspaceStatus } from '@/types';

export type DashboardProjectScopeSource = 'vscode' | 'analysis';
export type DashboardScopeLevel = 'workspace' | 'project' | 'workspace-project' | 'none';

export interface DashboardScopeDescriptor {
  level: DashboardScopeLevel;
  workspace: {
    active: boolean;
    name?: string;
    profile?: string;
    path?: string;
  };
  project: {
    active: boolean;
    name?: string;
    type?: string;
    path?: string;
    frameworkLabel?: string;
    source: DashboardProjectScopeSource;
  };
}

export interface DashboardScopeInput {
  workspaceStatus: WorkspaceStatus;
  activeWorkspaceName?: string;
  activeWorkspaceProfile?: string;
  selectedProjectForAnalysis?: {
    name?: string;
    type?: string;
    path?: string;
  } | null;
}

function clean(value?: string | null): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildDashboardScopeDescriptor({
  workspaceStatus,
  activeWorkspaceName,
  activeWorkspaceProfile,
  selectedProjectForAnalysis,
}: DashboardScopeInput): DashboardScopeDescriptor {
  const projectPath =
    workspaceStatus.hasProjectSelected === true
      ? clean(workspaceStatus.projectPath)
      : clean(selectedProjectForAnalysis?.path);
  const projectSource: DashboardProjectScopeSource =
    workspaceStatus.hasProjectSelected === true ? 'vscode' : projectPath ? 'analysis' : 'vscode';
  const projectType =
    workspaceStatus.hasProjectSelected === true
      ? clean(workspaceStatus.projectType)
      : clean(selectedProjectForAnalysis?.type);
  const frameworkLabel =
    clean(workspaceStatus.projectCapabilities?.frameworkDisplayName) || projectType;
  const hasWorkspace = Boolean(
    workspaceStatus.hasWorkspace && clean(workspaceStatus.workspacePath)
  );
  const hasProject = Boolean(projectPath);

  return {
    level: hasWorkspace && hasProject ? 'workspace-project' : hasWorkspace ? 'workspace' : 'none',
    workspace: {
      active: hasWorkspace,
      name: clean(activeWorkspaceName) || clean(workspaceStatus.workspaceName),
      profile: clean(activeWorkspaceProfile),
      path: clean(workspaceStatus.workspacePath),
    },
    project: {
      active: hasProject,
      name:
        workspaceStatus.hasProjectSelected === true
          ? clean(workspaceStatus.projectName)
          : clean(selectedProjectForAnalysis?.name),
      type: projectType,
      path: projectPath,
      frameworkLabel,
      source: projectSource,
    },
  };
}

export function dashboardScopeLabel(scope: DashboardScopeDescriptor): string {
  if (scope.project.active && scope.workspace.active) {
    return `${scope.workspace.name || 'Workspace'} / ${scope.project.name || 'Project'}`;
  }
  if (scope.workspace.active) {
    return scope.workspace.name || 'Workspace';
  }
  return 'No workspace selected';
}

export function dashboardScopeDetail(
  scope: DashboardScopeDescriptor,
  options?: { showPaths?: boolean }
): string {
  const showPaths = options?.showPaths ?? true;
  if (scope.project.active) {
    return [
      scope.project.frameworkLabel || scope.project.type || 'Project',
      scope.project.source === 'analysis' ? 'analysis scope' : 'selected in VS Code',
    ].join(' · ');
  }
  if (scope.workspace.active) {
    return [scope.workspace.profile || 'workspace', showPaths ? scope.workspace.path : undefined]
      .filter(Boolean)
      .join(' · ');
  }
  return 'Select a workspace to unlock scoped actions';
}
