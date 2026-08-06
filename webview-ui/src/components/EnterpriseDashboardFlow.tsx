import {
  Archive,
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
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import { SCAFFOLD_STARTERS } from '@/lib/scaffoldFrameworks';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { findEvidenceCard } from '@/lib/dashboardEvidence';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import type { DashboardCommand } from '@/lib/dashboardCommandRegistry';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import type { ScaffoldFramework, WorkspaceStatus } from '@/types';
import { vscode } from '@/vscode';
import { FrameworkIcon } from './FrameworkIcon';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';
import { ImportAdoptOptionsModal, type ProjectOnboardingMode } from './ImportAdoptOptionsModal';
import {
  WORKSPAI_INCIDENT_STUDIO_LABEL,
  WORKSPAI_INCIDENT_STUDIO_WORKSPACE_TILE_DETAIL,
} from '@/lib/workspaiAiNarrative';

type Framework = ScaffoldFramework;

interface EnterpriseDashboardFlowProps {
  workspaceStatus: WorkspaceStatus;
  evidence?: DashboardEvidencePayload | null;
  selectedFramework: Framework;
  onSelectFramework: (framework: Framework) => void;
  onOpenProjectBuilder: (framework: Framework) => void;
  onOpenManualProject: (framework: Framework) => void;
  onRunWorkspaceCommand?: (command: string, data?: Record<string, unknown>) => void;
  onRunFixPreview?: () => void;
  onRunChangeImpact?: () => void;
  onRunTerminalBridge?: () => void;
  onOpenIncidentStudio?: () => void;
  pendingCardIds?: DashboardEvidenceCardId[];
  activeOperateZone?: Extract<DashboardOperateZone, 'quick' | 'build' | 'share'>;
}
const frameworks = SCAFFOLD_STARTERS;

function workspaceRunStageDetail(
  evidence: DashboardEvidencePayload | null | undefined,
  stage: 'init' | 'test' | 'build' | 'start',
  fallback: string
): string {
  const card = findEvidenceCard(evidence, 'workspaceRun');
  if (!card || card.status === 'missing') {
    return fallback;
  }
  const summary = card.summary?.trim() ?? '';
  if (summary.toLowerCase().startsWith(stage)) {
    return summary;
  }
  return card.blockers?.[0] ?? (summary || fallback);
}

export function EnterpriseDashboardFlow({
  workspaceStatus,
  evidence,
  selectedFramework,
  onSelectFramework,
  onOpenProjectBuilder,
  onOpenManualProject,
  onRunWorkspaceCommand,
  onRunFixPreview,
  onRunChangeImpact,
  onRunTerminalBridge,
  onOpenIncidentStudio,
  pendingCardIds = [],
  activeOperateZone = 'quick',
}: EnterpriseDashboardFlowProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const workspaceRunCard = findEvidenceCard(evidence, 'workspaceRun');
  const archiveCard = findEvidenceCard(evidence, 'archive');
  const workspaceModelCard = findEvidenceCard(evidence, 'workspaceModel');
  const fleetProjectNames =
    typeof workspaceModelCard?.metrics?.projectNames === 'string'
      ? workspaceModelCard.metrics.projectNames
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
  const [fleetScope, setFleetScope] = useState<'all' | string>('all');
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const commandContract = (command: DashboardCommand, disabledReason?: string) =>
    buildDashboardCommandActionContract(command, { evidence, disabledReason });
  const [onboardingModal, setOnboardingModal] = useState<ProjectOnboardingMode | null>(null);
  const modalWorkspaceName =
    workspaceStatus.workspaceName?.trim() || workspaceStatus.workspacePath || 'Workspace';
  const activeHeader =
    activeOperateZone === 'quick'
      ? {
          kicker: 'Primary commands',
          subtitle: hasWorkspace
            ? 'Doctor, pipeline, analyze, and graph for the active workspace'
            : 'Select a workspace to unlock run actions',
        }
      : activeOperateZone === 'build'
        ? {
            kicker: 'Create project',
            subtitle: hasWorkspace
              ? 'Scaffold, import, or adopt a project inside the active workspace'
              : 'Select a workspace to create or adopt projects',
          }
        : {
            kicker: 'Archive and handoff',
            subtitle: hasWorkspace
              ? 'Package workspace evidence and hand it off to Studio or external agents'
              : 'Select a workspace to archive or share evidence',
          };

  const runWorkspaceAction = (command: string, data?: Record<string, unknown>) => {
    if (!hasWorkspace) {
      requestWorkspaceSwitch();
      return;
    }
    const scopePayload =
      fleetScope === 'all'
        ? {}
        : {
            scope: fleetScope.startsWith('project:') ? fleetScope : `project:${fleetScope}`,
          };
    const payload = { ...scopePayload, ...(data ?? {}) };
    if (onRunWorkspaceCommand) {
      onRunWorkspaceCommand(command, payload);
      return;
    }
    vscode.postMessage(command, payload);
  };

  const openOnboardingModal = (mode: ProjectOnboardingMode) => {
    if (!hasWorkspace) {
      requestWorkspaceSwitch();
      return;
    }
    setOnboardingModal(mode);
  };

  const confirmOnboarding = (enableModules: boolean) => {
    if (!onboardingModal || !workspaceStatus.workspacePath) {
      setOnboardingModal(null);
      return;
    }

    if (onboardingModal === 'import') {
      runWorkspaceAction('importProject', {
        path: workspaceStatus.workspacePath,
        name: workspaceStatus.workspaceName,
        enableModules,
        source: 'local-folder',
      });
    } else {
      runWorkspaceAction('adoptProject', {
        path: workspaceStatus.workspacePath,
        name: workspaceStatus.workspaceName,
        enableModules,
      });
    }
    setOnboardingModal(null);
  };

  const runWorkspaceCallback = (callback?: () => void) => {
    if (!hasWorkspace) {
      requestWorkspaceSwitch();
      return;
    }
    callback?.();
  };

  const requestWorkspaceSwitch = () => {
    if (onRunWorkspaceCommand) {
      onRunWorkspaceCommand('quickSwitchWorkspace');
      return;
    }
    vscode.postMessage('quickSwitchWorkspace');
  };

  return (
    <section className="enterprise-flow" aria-label="Workspace run actions">
      <div className="enterprise-flow-header enterprise-flow-header--compact">
        <div>
          <div className="ws-kicker enterprise-flow-kicker">{activeHeader.kicker}</div>
          <div className="enterprise-flow-subtitle">{activeHeader.subtitle}</div>
        </div>
        <div className="enterprise-flow-header-actions">
          <div className="enterprise-flow-status">
            <ShieldCheck size={14} />
            <span>{hasWorkspace ? 'Governed workspace' : 'Setup required'}</span>
          </div>
        </div>
      </div>

      <div className="enterprise-flow-grid enterprise-flow-grid--single">
        {activeOperateZone === 'quick' ? (
          <div
            id="dashboard-operate-quick"
            className="enterprise-flow-column enterprise-flow-column--operate dashboard-operate-zone"
          >
          <ColumnHeader title="Start here" subtitle="Verify, inspect, fix" scope="workspace" />
          <ActionTileGrid layout="operate">
            <ActionTile
              variant="primary"
              fullWidth
              icon={<Workflow size={15} />}
              label="Governance Gate"
              detail="Sync → doctor → analyze → readiness → autopilot"
              pending={isPending('pipeline')}
              onClick={() => runWorkspaceAction('workspacePipeline')}
              actionContract={commandContract(
                'workspacePipeline',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="npx workspai pipeline --json --strict"
            />
            <ActionTile
              icon={<HeartPulse size={15} />}
              label="Doctor"
              detail="Readiness scan"
              pending={isPending('doctor')}
              onClick={() => runWorkspaceAction('checkWorkspaceHealth')}
              actionContract={commandContract(
                'checkWorkspaceHealth',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
            />
            <ActionTile
              icon={<Layers size={15} />}
              label="Analyze"
              detail="Evidence scan — outcomes in Artifacts"
              pending={isPending('analyze')}
              onClick={() => runWorkspaceAction('workspaceAnalyze')}
              actionContract={commandContract(
                'workspaceAnalyze',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
            />
            <ActionTile
              icon={<GitBranch size={15} />}
              label="Graph"
              detail="Services and ports"
              onClick={() => runWorkspaceAction('workspaceContractGraph')}
              actionContract={commandContract(
                'workspaceContractGraph',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
            />
          </ActionTileGrid>
          <details
            className="enterprise-flow-accordion enterprise-flow-secondary"
            data-default-collapsed="true"
          >
            <summary className="enterprise-flow-accordion__summary enterprise-flow-secondary__summary">
              <span>More run commands</span>
              <small>Init, test, build, start, terminal</small>
            </summary>
            <div className="enterprise-flow-accordion__body">
              {fleetProjectNames.length > 0 ? (
                <label className="enterprise-flow-fleet-scope">
                  <span>Fleet scope</span>
                  <select
                    value={fleetScope}
                    onChange={(event) => setFleetScope(event.target.value)}
                    aria-label="Fleet run project scope"
                  >
                    <option value="all">All projects</option>
                    {fleetProjectNames.map((projectName) => (
                      <option key={projectName} value={projectName}>
                        project:{projectName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <ActionTileGrid layout="operate">
                <ActionTile
                  icon={<Package size={15} />}
                  label="Init"
                  detail={workspaceRunStageDetail(evidence, 'init', 'Install deps · safe init')}
                  evidenceStatus={workspaceRunCard?.status}
                  pending={isPending('workspaceRun')}
                  onClick={() => runWorkspaceAction('workspaceRunInit')}
                  actionContract={commandContract(
                    'workspaceRunInit',
                    !hasWorkspace ? 'Select a workspace' : undefined
                  )}
                  title="workspai workspace run init"
                />
                <ActionTile
                  icon={<Play size={15} />}
                  label="Test"
                  detail={workspaceRunStageDetail(evidence, 'test', 'Safe run')}
                  evidenceStatus={workspaceRunCard?.status}
                  pending={isPending('workspaceRun')}
                  onClick={() => runWorkspaceAction('workspaceRunTest')}
                  actionContract={commandContract(
                    'workspaceRunTest',
                    !hasWorkspace ? 'Select a workspace' : undefined
                  )}
                />
                <ActionTile
                  icon={<CheckCircle2 size={15} />}
                  label="Build"
                  detail={workspaceRunStageDetail(evidence, 'build', 'Affected projects')}
                  evidenceStatus={workspaceRunCard?.status}
                  pending={isPending('workspaceRun')}
                  onClick={() => runWorkspaceAction('workspaceRunBuild')}
                  actionContract={commandContract(
                    'workspaceRunBuild',
                    !hasWorkspace ? 'Select a workspace' : undefined
                  )}
                />
                <ActionTile
                  icon={<Play size={15} />}
                  label="Start"
                  detail={workspaceRunStageDetail(evidence, 'start', 'Start affected services')}
                  evidenceStatus={workspaceRunCard?.status}
                  pending={isPending('workspaceRun')}
                  onClick={() => runWorkspaceAction('workspaceRunStart')}
                  actionContract={commandContract(
                    'workspaceRunStart',
                    !hasWorkspace ? 'Select a workspace' : undefined
                  )}
                  title="workspai workspace run start"
                />
                <ActionTile
                  icon={<Terminal size={15} />}
                  label="Terminal"
                  detail="Workspace root"
                  onClick={() => runWorkspaceAction('workspaceTerminal')}
                  actionContract={commandContract(
                    'workspaceTerminal',
                    !hasWorkspace ? 'Select a workspace' : undefined
                  )}
                />
              </ActionTileGrid>
            </div>
          </details>
          </div>
        ) : null}

        {activeOperateZone === 'build' ? (
          <section
            id="dashboard-operate-build"
            className="dashboard-operate-zone enterprise-flow-column enterprise-flow-column--build"
            aria-label="Create project inside workspace"
          >
            <ColumnHeader
              title="Create Project Inside"
              subtitle="Project starters, import, adopt"
              scope="workspace"
            />
            <div className="enterprise-flow-accordion__body">
            <ActionTile
              variant="builder"
              fullWidth
              icon={<Sparkles size={15} />}
              label="AI Project Builder"
              detail="Plan and scaffold a project inside this workspace"
              onClick={() => {
                if (!hasWorkspace) {
                  requestWorkspaceSwitch();
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
                      requestWorkspaceSwitch();
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
                onClick={() => openOnboardingModal('import')}
                title={hasWorkspace ? 'Import Project' : 'Select a workspace first'}
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
                onClick={() => openOnboardingModal('adopt')}
                title={hasWorkspace ? 'Adopt Project' : 'Select a workspace first'}
              >
                <Package size={15} />
                <span>
                  <strong>Adopt Project</strong>
                  <small>Register an on-disk folder with Workspai workspace metadata</small>
                </span>
              </button>
              <button
                type="button"
                className="enterprise-framework-grid-wide"
                onClick={() => runWorkspaceAction('refreshModules')}
                title={hasWorkspace ? 'Refresh Modules' : 'Select a workspace first'}
              >
                <Package size={15} />
                <span>
                  <strong>Refresh Modules</strong>
                  <small>Update the module catalog for this workspace</small>
                </span>
              </button>
            </div>
            </div>
          </section>
        ) : null}

        {activeOperateZone === 'share' ? (
          <section
            id="dashboard-operate-share"
            className="dashboard-operate-zone enterprise-flow-column enterprise-flow-column--share"
            aria-label="Share workspace and AI handoff"
          >
            <ColumnHeader
              title="Share &amp; AI"
              subtitle="Archive, handoff, Studio"
              scope="workspace"
            />
            <div className="enterprise-flow-accordion__body">
            <ActionTileGrid layout="2col">
              <ActionTile
                icon={<Upload size={15} />}
                label="Export for Ship Handoff"
                detail={
                  archiveCard?.status === 'missing'
                    ? 'Create .workspai-archive.zip and refresh ship manifest'
                    : archiveCard?.summary || 'Portable workspace archive'
                }
                evidenceStatus={archiveCard?.status}
                pending={isPending('archive')}
                onClick={() =>
                  runWorkspaceAction('exportWorkspace', { path: workspaceStatus.workspacePath })
                }
                actionContract={commandContract(
                  'exportWorkspace',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
                title={hasWorkspace ? 'Export workspace for ship handoff' : 'Select a workspace first'}
              />
              <ActionTile
                icon={<Archive size={15} />}
                label="Archive Tools"
                detail="Export · inspect · verify · doctor"
                pending={isPending('archive')}
                onClick={() => runWorkspaceAction('workspaceArchive')}
                actionContract={commandContract(
                  'workspaceArchive',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
              />
              <ActionTile
                icon={<Upload size={15} />}
                label="Share Bundle"
                detail="Source-safe metadata"
                pending={isPending('share')}
                onClick={() => runWorkspaceAction('workspaceShare')}
                actionContract={commandContract(
                  'workspaceShare',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
              />
              <ActionTile
                icon={<BrainCircuit size={15} />}
                label={WORKSPAI_INCIDENT_STUDIO_LABEL}
                detail={WORKSPAI_INCIDENT_STUDIO_WORKSPACE_TILE_DETAIL}
                onClick={() => runWorkspaceCallback(onOpenIncidentStudio)}
              />
              <ActionTile
                icon={<Bug size={15} />}
                label="Fix Preview"
                detail="Patch preview"
                onClick={() => runWorkspaceCallback(onRunFixPreview)}
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
                pending={isPending('archive')}
                onClick={() => runWorkspaceAction('workspaceArchiveVerify')}
                actionContract={commandContract(
                  'workspaceArchiveVerify',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
              />
              <ActionTile
                icon={<HeartPulse size={15} />}
                label="Doctor Archive"
                detail="Import readiness"
                pending={isPending('archive')}
                onClick={() => runWorkspaceAction('workspaceArchiveDoctor')}
                actionContract={commandContract(
                  'workspaceArchiveDoctor',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
              />
              <ActionTile
                icon={<Archive size={15} />}
                label="Recovery Snapshot"
                detail="Point-in-time recovery"
                pending={isPending('snapshot')}
                onClick={() => runWorkspaceAction('workspaceSnapshotCreate')}
                actionContract={commandContract(
                  'workspaceSnapshotCreate',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
              />
            </ActionTileGrid>
            </div>
          </section>
        ) : null}
      </div>

      <ImportAdoptOptionsModal
        isOpen={onboardingModal !== null}
        mode={onboardingModal ?? 'import'}
        workspaceName={modalWorkspaceName}
        onClose={() => setOnboardingModal(null)}
        onConfirm={confirmOnboarding}
      />
    </section>
  );
}
