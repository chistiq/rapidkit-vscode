import type { IncidentProjectSelection } from '@/lib/incidentStudioPayload';

export type AnalysisScopeMode = 'workspace' | 'project';

export type WorkspaceProjectOption = {
  path: string;
  name: string;
  type?: IncidentProjectSelection['type'];
  framework?: string;
};

export type AnalysisScopeNotice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
  dismissible?: boolean;
};

export type WorkspaceStatusProjectSlice = {
  hasProjectSelected?: boolean;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
};

const ANALYSIS_SCOPE_STORAGE_KEY = 'workspai.analysisScopeMode';

export function readPersistedAnalysisScopeMode(): AnalysisScopeMode {
  if (typeof window === 'undefined') {
    return 'workspace';
  }

  const stored = window.sessionStorage.getItem(ANALYSIS_SCOPE_STORAGE_KEY);
  return stored === 'project' ? 'project' : 'workspace';
}

export function persistAnalysisScopeMode(mode: AnalysisScopeMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(ANALYSIS_SCOPE_STORAGE_KEY, mode);
}

export function normalizeProjectType(raw: unknown): IncidentProjectSelection['type'] | undefined {
  if (
    raw === 'fastapi' ||
    raw === 'nestjs' ||
    raw === 'go' ||
    raw === 'springboot' ||
    raw === 'dotnet'
  ) {
    return raw;
  }
  return undefined;
}

export function resolveSidebarProjectSelection(
  workspaceStatus: WorkspaceStatusProjectSlice
): IncidentProjectSelection | null {
  if (
    workspaceStatus.hasProjectSelected !== true ||
    typeof workspaceStatus.projectPath !== 'string' ||
    !workspaceStatus.projectPath.trim()
  ) {
    return null;
  }

  return {
    path: workspaceStatus.projectPath.trim(),
    name:
      typeof workspaceStatus.projectName === 'string' &&
      workspaceStatus.projectName.trim().length > 0
        ? workspaceStatus.projectName.trim()
        : undefined,
    type: normalizeProjectType(workspaceStatus.projectType),
  };
}

export function resolveEffectiveAnalysisScope(input: {
  mode: AnalysisScopeMode;
  analysisProject: IncidentProjectSelection | null;
}): {
  scopeType: 'workspace' | 'project';
  activeProject: IncidentProjectSelection | null;
  pendingProjectSelection: boolean;
} {
  if (input.mode === 'project') {
    if (input.analysisProject?.path) {
      return {
        scopeType: 'project',
        activeProject: input.analysisProject,
        pendingProjectSelection: false,
      };
    }

    return {
      scopeType: 'project',
      activeProject: null,
      pendingProjectSelection: true,
    };
  }

  return {
    scopeType: 'workspace',
    activeProject: null,
    pendingProjectSelection: false,
  };
}

export function buildProjectScopePickNotice(): AnalysisScopeNotice {
  return {
    tone: 'info',
    title: 'Project focus needed',
    message: 'Choose a project from the Scope menu to run analysis against a single service.',
    dismissible: true,
  };
}

export function buildProjectScopeActiveNotice(projectName: string): AnalysisScopeNotice {
  return {
    tone: 'success',
    title: 'Project-scoped analysis',
    message: `Running against ${projectName}. Switch to Workspace in Scope for fleet-level signals.`,
    dismissible: true,
  };
}

export function toWorkspaceProjectOption(
  project: IncidentProjectSelection
): WorkspaceProjectOption {
  return {
    path: project.path,
    name: project.name || project.path.split(/[/\\]/).pop() || project.path,
    type: project.type,
    framework: project.type,
  };
}

/** Shared analysis context shape for Impact Lens + Studio chat brain host. */
export function buildSharedAnalysisContext(input: {
  workspacePath?: string | null;
  workspaceName?: string;
  project?: IncidentProjectSelection | null;
  scopeMode?: AnalysisScopeMode;
}): {
  type: 'workspace' | 'project';
  name: string;
  path?: string;
  framework?: string;
  workspaceRootPath?: string;
  projectRootPath?: string;
} | null {
  const workspacePath =
    typeof input.workspacePath === 'string' && input.workspacePath.trim().length > 0
      ? input.workspacePath.trim()
      : null;
  if (!workspacePath) {
    return null;
  }

  const scopeMode = input.scopeMode ?? (input.project?.path ? 'project' : 'workspace');
  const project = scopeMode === 'project' && input.project?.path ? input.project : null;

  if (project?.path) {
    return {
      type: 'project',
      name: project.name || project.path.split(/[/\\]/).filter(Boolean).pop() || 'Selected project',
      path: project.path,
      framework: project.type,
      workspaceRootPath: workspacePath,
      projectRootPath: project.path,
    };
  }

  return {
    type: 'workspace',
    name:
      input.workspaceName ||
      workspacePath.split(/[/\\]/).filter(Boolean).pop() ||
      'Active workspace',
    path: workspacePath,
    workspaceRootPath: workspacePath,
  };
}

export function normalizeWorkspaceProjectOptions(raw: unknown): WorkspaceProjectOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const options: WorkspaceProjectOption[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const path =
      typeof (entry as { path?: unknown }).path === 'string'
        ? (entry as { path: string }).path.trim()
        : '';
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    const nameRaw = (entry as { name?: unknown }).name;
    const typeRaw = (entry as { type?: unknown }).type;
    options.push({
      path,
      name:
        typeof nameRaw === 'string' && nameRaw.trim().length > 0
          ? nameRaw.trim()
          : path.split(/[/\\]/).pop() || path,
      type: normalizeProjectType(typeRaw),
      framework:
        typeof typeRaw === 'string' && typeRaw.trim().length > 0 ? typeRaw.trim() : undefined,
    });
  }

  return options;
}
