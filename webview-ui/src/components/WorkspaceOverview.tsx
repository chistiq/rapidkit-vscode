import {
  Activity,
  Boxes,
  CheckCircle2,
  Download,
  GitBranch,
  Layers,
  Loader2,
  Package,
  Rocket,
  Shield,
} from 'lucide-react';
import type { ModuleData, WorkspaceStatus } from '@/types';

interface WorkspaceOverviewProps {
  workspaceName?: string;
  workspaceProfile?: string;
  workspaceStatus: WorkspaceStatus;
  moduleCount: number;
  templateCount: number;
  recentWorkspaceCount: number;
  modules: ModuleData[];
  isCreatingWorkspace?: boolean;
  onCreateWorkspace: () => void;
  onImportWorkspace: () => void;
}

function formatValue(value: string | number | undefined | null, fallback = 'Not selected') {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value);
}

export function WorkspaceOverview({
  workspaceName,
  workspaceProfile,
  workspaceStatus,
  moduleCount,
  templateCount,
  recentWorkspaceCount,
  modules,
  isCreatingWorkspace = false,
  onCreateWorkspace,
  onImportWorkspace,
}: WorkspaceOverviewProps) {
  const installedCount = workspaceStatus.installedModules?.length ?? 0;
  const stableModuleCount = modules.filter((module) => module.status !== 'experimental').length;
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const hasProject = Boolean(workspaceStatus.hasProjectSelected && workspaceStatus.projectPath);

  const metrics = [
    {
      label: 'Workspace',
      value: hasWorkspace ? formatValue(workspaceName) : 'Not selected',
      detail: workspaceProfile || 'profile pending',
      icon: Activity,
      state: hasWorkspace ? 'ready' : 'idle',
    },
    {
      label: 'Project scope',
      value: hasProject ? formatValue(workspaceStatus.projectName, 'Selected') : 'No project',
      detail: workspaceStatus.projectType || 'select from sidebar',
      icon: GitBranch,
      state: hasProject ? 'ready' : 'idle',
    },
    {
      label: 'Modules',
      value: `${installedCount}/${moduleCount}`,
      detail: `${stableModuleCount} production-ready`,
      icon: Package,
      state: installedCount > 0 ? 'ready' : 'idle',
    },
    {
      label: 'Catalog',
      value: `${templateCount} templates`,
      detail: `${recentWorkspaceCount} recent workspaces`,
      icon: Boxes,
      state: templateCount > 0 ? 'ready' : 'idle',
    },
    {
      label: 'Governance',
      value: hasWorkspace ? 'Available' : 'Locked',
      detail: 'doctor, graph, archive, release',
      icon: Shield,
      state: hasWorkspace ? 'ready' : 'idle',
    },
  ];

  return (
    <section className="workspace-overview" aria-label="Workspace overview">
      <div className="workspace-overview-title">
        <div className="workspace-overview-heading">
          <CheckCircle2 size={14} />
          <span>Workspace Operations Console</span>
          <small>
            {hasWorkspace ? 'Ready for governed operations' : 'Choose a workspace to begin'}
          </small>
        </div>
        <div className="workspace-overview-actions">
          <button
            type="button"
            onClick={isCreatingWorkspace ? undefined : onCreateWorkspace}
            aria-busy={isCreatingWorkspace}
            title="Create a workspace with AI"
          >
            {isCreatingWorkspace ? <Loader2 className="spinning" size={13} /> : <Rocket size={13} />}
            Create with AI
          </button>
          <button type="button" onClick={onImportWorkspace} title="Import an existing workspace">
            <Download size={13} />
            Import
          </button>
        </div>
      </div>
      <div className="workspace-overview-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={`workspace-metric workspace-metric--${metric.state}`}
            >
              <Icon size={15} />
              <span>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <em>{metric.detail}</em>
              </span>
            </div>
          );
        })}
      </div>
      <div className="workspace-overview-note">
        <Layers size={13} />
        <span>
          Primary flow: select workspace, validate health, inspect contract graph, run tests, share
          archive, then release.
        </span>
      </div>
    </section>
  );
}
