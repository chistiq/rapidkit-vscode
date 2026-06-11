import {
  Archive,
  ArrowLeftRight,
  BrainCircuit,
  Bug,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  HeartPulse,
  Layers,
  Package,
  Play,
  Sparkles,
  ShieldCheck,
  Terminal,
  Upload,
} from 'lucide-react';
import type { WorkspaceStatus } from '@/types';
import { vscode } from '@/vscode';
import { FrameworkIcon } from './FrameworkIcon';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';

type Framework = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

interface EnterpriseDashboardFlowProps {
  workspaceName?: string;
  workspaceProfile?: string;
  workspaceStatus: WorkspaceStatus;
  selectedFramework: Framework;
  onSelectFramework: (framework: Framework) => void;
  onOpenProjectBuilder: (framework: Framework) => void;
  onOpenManualProject: (framework: Framework) => void;
  onRunFixPreview?: () => void;
  onRunChangeImpact?: () => void;
  onRunTerminalBridge?: () => void;
  onOpenIncidentStudio?: () => void;
}

const frameworks: Array<{
  framework: Framework;
  title: string;
  detail: string;
}> = [
  { framework: 'fastapi', title: 'FastAPI', detail: 'Python API' },
  { framework: 'nestjs', title: 'NestJS', detail: 'TypeScript service' },
  { framework: 'go', title: 'Go', detail: 'Go service' },
  { framework: 'springboot', title: 'Spring Boot', detail: 'Java service' },
  { framework: 'dotnet', title: '.NET', detail: 'C# Web API' },
];

export function EnterpriseDashboardFlow({
  workspaceName,
  workspaceProfile,
  workspaceStatus,
  selectedFramework,
  onSelectFramework,
  onOpenProjectBuilder,
  onOpenManualProject,
  onRunFixPreview,
  onRunChangeImpact,
  onRunTerminalBridge,
  onOpenIncidentStudio,
}: EnterpriseDashboardFlowProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const displayName = workspaceName || workspaceStatus.workspaceName || 'No workspace selected';
  const profileLabel = workspaceProfile || workspaceStatus.workspaceProfile;

  const runWorkspaceAction = (command: string, data?: Record<string, unknown>) => {
    if (!hasWorkspace) {
      vscode.postMessage('quickSwitchWorkspace');
      return;
    }
    vscode.postMessage(command, data);
  };

  const runWorkspaceCallback = (callback?: () => void) => {
    if (!hasWorkspace) {
      vscode.postMessage('quickSwitchWorkspace');
      return;
    }
    callback?.();
  };

  return (
    <section className="enterprise-flow">
      <div className="enterprise-flow-header">
        <div>
          <div className="enterprise-flow-kicker">Enterprise flow</div>
          <div className="enterprise-flow-title">{displayName}</div>
          <div className="enterprise-flow-subtitle">
            {profileLabel ? `${profileLabel} profile · ` : ''}
            {hasWorkspace ? 'Governed workspace operations' : 'Select a workspace to unlock actions'}
          </div>
        </div>
        <div className="enterprise-flow-header-actions">
          <button
            type="button"
            className="enterprise-flow-switch"
            onClick={() => vscode.postMessage('quickSwitchWorkspace')}
            title="Quick Switch Workspace"
          >
            <ArrowLeftRight size={13} />
            Switch
          </button>
          <div className="enterprise-flow-status">
            <ShieldCheck size={14} />
            <span>{hasWorkspace ? 'Governed' : 'Setup required'}</span>
          </div>
        </div>
      </div>

      <div className="enterprise-flow-grid">
        <div className="enterprise-flow-column enterprise-flow-column--operate">
          <ColumnHeader
            title="Operate"
            subtitle="Validate, inspect, run, release"
            scope="workspace"
          />
          <ActionTileGrid layout="operate">
            <ActionTile
              icon={<HeartPulse size={15} />}
              label="Doctor"
              detail="Readiness scan"
              onClick={() => runWorkspaceAction('checkWorkspaceHealth')}
            />
            <ActionTile
              icon={<GitBranch size={15} />}
              label="Graph"
              detail="Services and ports"
              onClick={() => runWorkspaceAction('workspaceContractGraph')}
            />
            <ActionTile
              icon={<Play size={15} />}
              label="Test"
              detail="Safe run"
              onClick={() => runWorkspaceAction('workspaceRunTest')}
            />
            <ActionTile
              icon={<CheckCircle2 size={15} />}
              label="Build"
              detail="Affected projects"
              onClick={() => runWorkspaceAction('workspaceRunBuild')}
            />
            <ActionTile
              icon={<Layers size={15} />}
              label="Analyze"
              detail="Evidence scan"
              onClick={() => runWorkspaceAction('workspaceAnalyze')}
            />
            <ActionTile
              icon={<Terminal size={15} />}
              label="Terminal"
              detail="Workspace root"
              onClick={() => runWorkspaceAction('workspaceTerminal')}
            />
            <ActionTile
              icon={<ShieldCheck size={15} />}
              label="Release"
              detail="Autopilot gate"
              onClick={() => runWorkspaceAction('workspaceAutopilotRelease')}
              fullWidth
            />
          </ActionTileGrid>
        </div>

        <div className="enterprise-flow-column enterprise-flow-column--build">
          <ColumnHeader title="Build" subtitle="Project starters, import, modules" scope="workspace" />

          <ActionTile
            variant="builder"
            fullWidth
            icon={<Sparkles size={15} />}
            label="AI Project Builder"
            detail="Plan and scaffold a project inside this workspace"
            onClick={() => {
              if (!hasWorkspace) {
                vscode.postMessage('quickSwitchWorkspace');
                return;
              }
              onOpenProjectBuilder(selectedFramework);
            }}
            title={hasWorkspace ? 'Open AI Project Builder' : 'Select a workspace first'}
          />

          <div className="enterprise-framework-grid" aria-label="Project starters">
            {frameworks.map((item) => (
              <button
                key={item.framework}
                type="button"
                className={selectedFramework === item.framework ? 'is-active' : ''}
                onClick={() => {
                  if (!hasWorkspace) {
                    vscode.postMessage('quickSwitchWorkspace');
                    return;
                  }
                  onSelectFramework(item.framework);
                  onOpenManualProject(item.framework);
                }}
                title={hasWorkspace ? `Create ${item.title} project` : 'Select a workspace first'}
              >
                <FrameworkIcon framework={item.framework} size={16} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="enterprise-framework-grid-wide"
              onClick={() => runWorkspaceAction('importProject')}
            >
              <FolderOpen size={15} />
              <span>
                <strong>Import Project</strong>
                <small>Add an existing service into this workspace</small>
              </span>
            </button>
            <button
              type="button"
              className="enterprise-framework-grid-wide"
              onClick={() => runWorkspaceAction('refreshModules')}
            >
              <Package size={15} />
              <span>
                <strong>Refresh Modules</strong>
                <small>Update the module catalog for this workspace</small>
              </span>
            </button>
          </div>
        </div>

        <div className="enterprise-flow-column enterprise-flow-column--share">
          <ColumnHeader title="Share" subtitle="Archive, handoff, AI operations" scope="workspace" />
          <ActionTileGrid layout="2col">
            <ActionTile
              icon={<Archive size={15} />}
              label="Archive"
              detail="Share safely"
              onClick={() => runWorkspaceAction('workspaceArchive')}
            />
            <ActionTile
              icon={<Upload size={15} />}
              label="Share Bundle"
              detail="Source-safe metadata"
              onClick={() => runWorkspaceAction('workspaceShare')}
            />
            <ActionTile
              icon={<Upload size={15} />}
              label="Export"
              detail="Workspace bundle"
              onClick={() =>
                hasWorkspace
                  ? vscode.postMessage('exportWorkspace', { path: workspaceStatus.workspacePath })
                  : vscode.postMessage('quickSwitchWorkspace')
              }
              title={hasWorkspace ? 'Export Workspace' : 'Select a workspace first'}
            />
            <ActionTile
              icon={<BrainCircuit size={15} />}
              label="Incident Studio"
              detail="Context-aware repair"
              onClick={() => runWorkspaceCallback(onOpenIncidentStudio)}
            />
            <ActionTile
              icon={<Bug size={15} />}
              label="Fix Preview"
              detail="Patch preview"
              onClick={() => runWorkspaceCallback(onRunFixPreview)}
            />
            <ActionTile
              icon={<Layers size={15} />}
              label="Change Impact"
              detail="Blast radius"
              onClick={() => runWorkspaceCallback(onRunChangeImpact)}
            />
            <ActionTile
              icon={<Terminal size={15} />}
              label="Terminal Bridge"
              detail="Terminal context"
              onClick={() => runWorkspaceCallback(onRunTerminalBridge)}
            />
            <ActionTile
              icon={<CheckCircle2 size={15} />}
              label="Verify Archive"
              detail="Archive integrity"
              onClick={() => runWorkspaceAction('workspaceArchiveVerify')}
            />
            <ActionTile
              icon={<HeartPulse size={15} />}
              label="Doctor Archive"
              detail="Import readiness"
              onClick={() => runWorkspaceAction('workspaceArchiveDoctor')}
            />
            <ActionTile
              icon={<Archive size={15} />}
              label="Snapshot"
              detail="Recovery point"
              onClick={() => runWorkspaceAction('workspaceSnapshot')}
            />
          </ActionTileGrid>
        </div>
      </div>

      <div className="enterprise-flow-rail" aria-label="Recommended workflow">
        {['Doctor', 'Analyze', 'Graph', 'Build', 'Archive', 'Release'].map((step, index) => (
          <span key={step}>
            <em>{index + 1}</em>
            {step}
          </span>
        ))}
      </div>
    </section>
  );
}
