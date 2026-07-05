import { ChevronRight, FolderKanban, GitBranch, Repeat2 } from 'lucide-react';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { compactStudioPathText } from '@/lib/studioDisplayText';

interface DashboardContextBarProps {
  scope: DashboardScopeDescriptor;
  showProjectScope?: boolean;
  /** When false, workspace and project cards show hints only — no filesystem paths. */
  showScopePaths?: boolean;
  onSwitchWorkspace?: () => void;
  onOpenWorkspaceInNewWindow?: () => void;
  onRevealWorkspaceFolder?: () => void;
  onOpenWorkspaces?: () => void;
  onOpenProject?: () => void;
  onFocusProjectExplorer?: () => void;
}

function shortenPath(path: string, maxLength = 52): string {
  const compact = compactStudioPathText(path, { keepSegments: 2 }) || path;
  if (compact.length <= maxLength) {
    return compact;
  }
  return `…${compact.slice(-(maxLength - 1))}`;
}

export function DashboardContextBar({
  scope,
  showProjectScope = true,
  showScopePaths = false,
  onSwitchWorkspace,
  onOpenWorkspaceInNewWindow,
  onRevealWorkspaceFolder,
  onOpenWorkspaces,
  onOpenProject,
  onFocusProjectExplorer,
}: DashboardContextBarProps) {
  const workspaceTitle = scope.workspace.active
    ? scope.workspace.name?.trim() || 'Current workspace'
    : 'No workspace selected';

  const workspaceInteractive = Boolean(onOpenWorkspaces || onSwitchWorkspace);
  const projectInteractive = Boolean(onOpenProject || onFocusProjectExplorer);

  const handleWorkspaceActivate = () => {
    if (onOpenWorkspaces) {
      onOpenWorkspaces();
      return;
    }
    onSwitchWorkspace?.();
  };

  const handleProjectActivate = () => {
    if (scope.project.active) {
      onOpenProject?.();
      return;
    }
    if (onFocusProjectExplorer) {
      onFocusProjectExplorer();
      return;
    }
    onOpenProject?.();
  };

  return (
    <header
      className={`ws-dashboard-context-bar${showProjectScope ? ' ws-dashboard-context-bar--dual' : ' ws-dashboard-context-bar--workspace-first'}`}
      aria-label={showProjectScope ? 'Active workspace and project scope' : 'Active workspace scope'}
    >
      <div className="ws-dashboard-context-bar__trail" aria-label="Dashboard scope breadcrumb">
        <div
          className={`ws-dashboard-context-bar__scope ws-dashboard-context-bar__scope--workspace${workspaceInteractive ? ' is-interactive' : ''}`}
        >
          {workspaceInteractive ? (
            <button
              type="button"
              className="ws-dashboard-context-bar__scope-trigger"
              onClick={handleWorkspaceActivate}
              title="Open workspace management"
            >
              <ScopeWorkspaceBody
                workspaceTitle={workspaceTitle}
                workspaceProfile={scope.workspace.profile}
                hasWorkspace={scope.workspace.active}
                workspacePath={scope.workspace.path}
                showScopePaths={showScopePaths}
              />
              <ChevronRight
                size={14}
                className="ws-dashboard-context-bar__chevron"
                aria-hidden="true"
              />
            </button>
          ) : (
            <ScopeWorkspaceBody
              workspaceTitle={workspaceTitle}
              workspaceProfile={scope.workspace.profile}
              hasWorkspace={scope.workspace.active}
              workspacePath={scope.workspace.path}
              showScopePaths={showScopePaths}
            />
          )}
          {scope.workspace.active && onOpenWorkspaceInNewWindow ? (
            <button
              type="button"
              className="ws-dashboard-context-bar__switch"
              onClick={onOpenWorkspaceInNewWindow}
              title="Open workspace in a new VS Code window"
            >
              Open
            </button>
          ) : null}
          {scope.workspace.active && onRevealWorkspaceFolder ? (
            <button
              type="button"
              className="ws-dashboard-context-bar__switch"
              onClick={onRevealWorkspaceFolder}
              title="Reveal workspace in your file manager"
            >
              Folder
            </button>
          ) : null}
          {onSwitchWorkspace ? (
            <button
              type="button"
              className="ws-dashboard-context-bar__switch"
              onClick={onSwitchWorkspace}
              title="Switch or open another workspace"
            >
              <Repeat2 size={12} aria-hidden="true" />
              Switch
            </button>
          ) : null}
        </div>

        {showProjectScope ? (
          <>
            <ChevronRight
              size={13}
              className="ws-dashboard-context-bar__separator"
              aria-hidden="true"
            />

            <div
              className={`ws-dashboard-context-bar__scope ws-dashboard-context-bar__scope--project${scope.project.active ? ' is-active' : ''}${projectInteractive ? ' is-interactive' : ''}`}
            >
              {projectInteractive ? (
                <button
                  type="button"
                  className="ws-dashboard-context-bar__scope-trigger"
                  onClick={handleProjectActivate}
                  title={
                    scope.project.active
                      ? 'Open project lifecycle actions'
                      : 'Focus PROJECTS panel in the sidebar'
                  }
                >
                  <ScopeProjectBody
                    hasProject={scope.project.active}
                    projectName={scope.project.name}
                    projectType={scope.project.frameworkLabel || scope.project.type}
                    projectPath={scope.project.path}
                    projectScopeSource={scope.project.source}
                    showScopePaths={showScopePaths}
                  />
                  <ChevronRight
                    size={14}
                    className="ws-dashboard-context-bar__chevron"
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <ScopeProjectBody
                  hasProject={scope.project.active}
                  projectName={scope.project.name}
                  projectType={scope.project.frameworkLabel || scope.project.type}
                  projectPath={scope.project.path}
                  projectScopeSource={scope.project.source}
                  showScopePaths={showScopePaths}
                />
              )}
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}

function ScopeWorkspaceBody({
  workspaceTitle,
  workspaceProfile,
  hasWorkspace,
  workspacePath,
  showScopePaths,
}: {
  workspaceTitle: string;
  workspaceProfile?: string;
  hasWorkspace: boolean;
  workspacePath?: string | null;
  showScopePaths?: boolean;
}) {
  return (
    <>
      <div className="ws-dashboard-context-bar__icon" aria-hidden="true">
        <FolderKanban size={15} />
      </div>
      <div className="ws-dashboard-context-bar__body">
        <span className="ws-dashboard-context-bar__label">Workspace</span>
        <div className="ws-dashboard-context-bar__title-row">
          <strong className="ws-dashboard-context-bar__title">{workspaceTitle}</strong>
          {workspaceProfile ? (
            <span className="ws-dashboard-context-bar__badge">{workspaceProfile}</span>
          ) : null}
        </div>
        {hasWorkspace && workspacePath && showScopePaths ? (
          <code className="ws-dashboard-context-bar__path" title={workspacePath}>
            {shortenPath(workspacePath)}
          </code>
        ) : (
          <span className="ws-dashboard-context-bar__hint">
            {hasWorkspace
              ? 'Workspace-level command center'
              : 'Open or switch a workspace to unlock dashboard actions'}
          </span>
        )}
      </div>
    </>
  );
}

function ScopeProjectBody({
  hasProject,
  projectName,
  projectType,
  projectPath,
  projectScopeSource,
  showScopePaths,
}: {
  hasProject: boolean;
  projectName?: string;
  projectType?: string;
  projectPath?: string | null;
  projectScopeSource: 'vscode' | 'analysis';
  showScopePaths?: boolean;
}) {
  return (
    <>
      <div className="ws-dashboard-context-bar__icon" aria-hidden="true">
        <GitBranch size={15} />
      </div>
      <div className="ws-dashboard-context-bar__body">
        <span className="ws-dashboard-context-bar__label">Project</span>
        <div className="ws-dashboard-context-bar__title-row">
          <strong
            className={`ws-dashboard-context-bar__title${hasProject ? '' : ' ws-dashboard-context-bar__title--placeholder'}`}
          >
            {hasProject ? projectName?.trim() || 'Selected project' : 'No project selected'}
          </strong>
          {hasProject && projectType ? (
            <span className="ws-dashboard-context-bar__badge ws-dashboard-context-bar__badge--type">
              {projectType}
            </span>
          ) : null}
          {hasProject && projectScopeSource === 'analysis' ? (
            <span className="ws-dashboard-context-bar__badge ws-dashboard-context-bar__badge--scope">
              Studio scope
            </span>
          ) : null}
        </div>
        {hasProject && projectPath && showScopePaths ? (
          <code className="ws-dashboard-context-bar__path" title={projectPath}>
            {shortenPath(projectPath)}
          </code>
        ) : (
          <span className="ws-dashboard-context-bar__hint">
            {hasProject
              ? 'Project lifecycle and module actions'
              : 'Select a project from PROJECTS to unlock project-scoped actions'}
          </span>
        )}
      </div>
    </>
  );
}
