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
  icon?: string;
  monogram: string;
  detail: string;
}> = [
  {
    framework: 'fastapi',
    title: 'FastAPI',
    icon: (window as any).FASTAPI_ICON_URI,
    monogram: 'Py',
    detail: 'Python API',
  },
  {
    framework: 'nestjs',
    title: 'NestJS',
    icon: (window as any).NESTJS_ICON_URI,
    monogram: 'TS',
    detail: 'TypeScript service',
  },
  {
    framework: 'go',
    title: 'Go',
    icon: (window as any).GO_ICON_URI,
    monogram: 'Go',
    detail: 'Go service',
  },
  {
    framework: 'springboot',
    title: 'Spring Boot',
    icon: (window as any).SPRINGBOOT_ICON_URI,
    monogram: 'JVM',
    detail: 'Java service',
  },
  {
    framework: 'dotnet',
    title: '.NET',
    monogram: '.NET',
    detail: 'C# Web API',
  },
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
  const projectLabel = workspaceStatus.hasProjectSelected
    ? workspaceStatus.projectName || workspaceStatus.projectType || 'Selected project'
    : 'No project selected';
  const title = hasWorkspace && workspaceName ? workspaceName : 'No workspace selected';

  const runWorkspaceAction = (command: string, requiresWorkspace = true) => {
    if (requiresWorkspace && !hasWorkspace) {
      vscode.postMessage('quickSwitchWorkspace');
      return;
    }
    vscode.postMessage(command);
  };

  const runWorkspaceCallback = (callback: (() => void) | undefined) => {
    if (!hasWorkspace) {
      vscode.postMessage('quickSwitchWorkspace');
      return;
    }
    callback?.();
  };

  return (
    <section className="enterprise-flow" aria-label="Workspai enterprise workflow">
      <div className="enterprise-flow-header">
        <div>
          <div className="enterprise-flow-kicker">Workspace command center</div>
          <div className="enterprise-flow-title">{title}</div>
          <div className="enterprise-flow-subtitle">
            {hasWorkspace
              ? `${projectLabel} · ${workspaceProfile || 'profile pending'}`
              : 'Select a workspace to unlock governed operations.'}
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
          <div className="enterprise-flow-column-head">
            <span>Operate</span>
            <small>Validate, inspect, run, release</small>
          </div>
          <div className="enterprise-action-grid enterprise-action-grid--operate">
            <button type="button" onClick={() => runWorkspaceAction('checkWorkspaceHealth')}>
              <HeartPulse size={15} />
              <span>
                <strong>Doctor</strong>
                <small>Readiness scan</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceContractGraph')}>
              <GitBranch size={15} />
              <span>
                <strong>Graph</strong>
                <small>Services and ports</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceRunTest')}>
              <Play size={15} />
              <span>
                <strong>Test</strong>
                <small>Safe run</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceRunBuild')}>
              <CheckCircle2 size={15} />
              <span>
                <strong>Build</strong>
                <small>Affected projects</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceAnalyze')}>
              <Layers size={15} />
              <span>
                <strong>Analyze</strong>
                <small>Evidence scan</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceTerminal')}>
              <Terminal size={15} />
              <span>
                <strong>Terminal</strong>
                <small>Workspace root</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceAutopilotRelease')}>
              <ShieldCheck size={15} />
              <span>
                <strong>Release</strong>
                <small>Autopilot gate</small>
              </span>
            </button>
          </div>
        </div>

        <div className="enterprise-flow-column enterprise-flow-column--build">
          <div className="enterprise-flow-column-head">
            <span>Build</span>
            <small>Project starters, import, modules</small>
          </div>

          <button
            type="button"
            className="enterprise-project-builder-action"
            onClick={() => {
              if (!hasWorkspace) {
                vscode.postMessage('quickSwitchWorkspace');
                return;
              }
              onOpenProjectBuilder(selectedFramework);
            }}
            title={hasWorkspace ? 'Open AI Project Builder' : 'Select a workspace first'}
          >
            <Sparkles size={15} />
            <span>
              <strong>AI Project Builder</strong>
              <small>Plan and scaffold a project inside this workspace</small>
            </span>
          </button>

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
                {item.icon ? (
                  <img src={item.icon} alt="" />
                ) : (
                  <span className="enterprise-framework-monogram">{item.monogram}</span>
                )}
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
          <div className="enterprise-flow-column-head">
            <span>Share</span>
            <small>Archive, handoff, AI operations</small>
          </div>
          <div className="enterprise-action-grid">
            <button type="button" onClick={() => runWorkspaceAction('workspaceArchive')}>
              <Archive size={15} />
              <span>
                <strong>Archive</strong>
                <small>Share safely</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceShare')}>
              <Upload size={15} />
              <span>
                <strong>Share Bundle</strong>
                <small>Source-safe metadata</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                hasWorkspace
                  ? vscode.postMessage('exportWorkspace', { path: workspaceStatus.workspacePath })
                  : vscode.postMessage('quickSwitchWorkspace')
              }
              title={hasWorkspace ? 'Export Workspace' : 'Select a workspace first'}
            >
              <Upload size={15} />
              <span>
                <strong>Export</strong>
                <small>Workspace bundle</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceCallback(onOpenIncidentStudio)}>
              <BrainCircuit size={15} />
              <span>
                <strong>Incident Studio</strong>
                <small>Context-aware repair</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceCallback(onRunFixPreview)}>
              <Bug size={15} />
              <span>
                <strong>Fix Preview</strong>
                <small>Patch preview</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceCallback(onRunChangeImpact)}>
              <Layers size={15} />
              <span>
                <strong>Change Impact</strong>
                <small>Blast radius</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceCallback(onRunTerminalBridge)}>
              <Terminal size={15} />
              <span>
                <strong>Terminal Bridge</strong>
                <small>Terminal context</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceArchiveVerify')}>
              <CheckCircle2 size={15} />
              <span>
                <strong>Verify Archive</strong>
                <small>Archive integrity</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceArchiveDoctor')}>
              <HeartPulse size={15} />
              <span>
                <strong>Doctor Archive</strong>
                <small>Import readiness</small>
              </span>
            </button>
            <button type="button" onClick={() => runWorkspaceAction('workspaceSnapshot')}>
              <Archive size={15} />
              <span>
                <strong>Snapshot</strong>
                <small>Recovery point</small>
              </span>
            </button>
          </div>
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
