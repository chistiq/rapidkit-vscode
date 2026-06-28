import { useEffect, useState } from 'react';
import { ArrowRight, Settings2 } from 'lucide-react';
import { CommandCheatsheet } from '@/components/CommandCheatsheet';
import { DashboardOperateSubNav } from '@/components/DashboardOperateSubNav';
import { EnterpriseDashboardFlow } from '@/components/EnterpriseDashboardFlow';
import { WorkspaiEmptyState } from '@/components/WorkspaiEmptyState';
import { WorkspaceGovernancePanel } from '@/components/WorkspaceGovernancePanel';
import { WorkspaceIntelligencePanel } from '@/components/WorkspaceIntelligencePanel';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import type { DashboardSection } from '@/lib/dashboardSections';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { dashboardScopeDetail, dashboardScopeLabel } from '@/lib/dashboardScope';
import type { ScaffoldFramework, WorkspaceStatus } from '@/types';

type Framework = ScaffoldFramework;

interface DashboardOperateSectionProps {
  hasWorkspace: boolean;
  scope: DashboardScopeDescriptor;
  workspaceStatus: WorkspaceStatus;
  evidence: DashboardEvidencePayload | null;
  pendingCardIds?: DashboardEvidenceCardId[];
  selectedFramework: Framework;
  onSelectFramework: (framework: Framework) => void;
  onOpenProjectBuilder: (framework: Framework) => void;
  onOpenManualProject: (framework: Framework) => void;
  onRunWorkspaceCommand?: (command: string, data?: Record<string, unknown>) => void;
  onRunFixPreview: () => void;
  onRunChangeImpact: () => void;
  onRunTerminalBridge: () => void;
  onOpenIncidentStudio: () => void;
  onNavigateSection: (section: DashboardSection) => void;
  onOperateZoneSelect?: (zone: DashboardOperateZone) => void;
  onCreateWorkspace: () => void;
  onBootstrap: () => void;
  onSetup: () => void;
  onWorkspaceSync: () => void;
  onFoundationEnsure: () => void;
  onContractInspect: () => void;
  onContractVerify: () => void;
  onReadiness: () => void;
  onAutopilotRelease: () => void;
  onMirrorOps: () => void;
  onCacheStatus: () => void;
  onPolicy: () => void;
  onInfra: () => void;
  onWorkspaceModel: () => void;
  onIntelligenceSnapshot: () => void;
  onWorkspaceDiff: () => void;
  onWorkspaceImpact: () => void;
  onWorkspaceContextAgent: () => void;
  onWorkspaceAgentSync?: () => void;
  onWorkspaceVerify: () => void;
  onWorkspaceExplain?: () => void;
  onWorkspaceWhy?: () => void;
  onWorkspaceTrace?: () => void;
  onWorkspaceWatch?: () => void;
  onWorkspaceMcp?: () => void;
  onWorkspaceImpactLens?: () => void;
  onRunImpactLensCli?: () => void;
  onIntelligenceChain: () => void;
  onSendWorkspaceToCopilot?: () => void;
  onCopyText?: (text: string) => void;
  requestedOperateZone?: DashboardOperateZone | null;
  onRequestedOperateZoneConsumed?: () => void;
}

export function DashboardOperateSection({
  hasWorkspace,
  scope,
  workspaceStatus,
  evidence,
  pendingCardIds = [],
  selectedFramework,
  onSelectFramework,
  onOpenProjectBuilder,
  onOpenManualProject,
  onRunWorkspaceCommand,
  onRunFixPreview,
  onRunChangeImpact,
  onRunTerminalBridge,
  onOpenIncidentStudio,
  onNavigateSection,
  onOperateZoneSelect,
  onCreateWorkspace,
  onBootstrap,
  onSetup,
  onWorkspaceSync,
  onFoundationEnsure,
  onContractInspect,
  onContractVerify,
  onReadiness,
  onAutopilotRelease,
  onMirrorOps,
  onCacheStatus,
  onPolicy,
  onInfra,
  onWorkspaceModel,
  onIntelligenceSnapshot,
  onWorkspaceDiff,
  onWorkspaceImpact,
  onWorkspaceContextAgent,
  onWorkspaceAgentSync,
  onWorkspaceVerify,
  onWorkspaceExplain,
  onWorkspaceWhy,
  onWorkspaceTrace,
  onWorkspaceWatch,
  onWorkspaceMcp,
  onWorkspaceImpactLens,
  onRunImpactLensCli,
  onIntelligenceChain,
  onSendWorkspaceToCopilot,
  onCopyText,
  requestedOperateZone = null,
  onRequestedOperateZoneConsumed,
}: DashboardOperateSectionProps) {
  const [activeZone, setActiveZone] = useState<DashboardOperateZone>('quick');

  const activeZoneLabel =
    activeZone === 'quick'
      ? 'Primary commands'
      : activeZone === 'build'
        ? 'Create project'
        : activeZone === 'share'
          ? 'Share and AI'
          : activeZone === 'intelligence'
            ? 'Workspace intelligence'
            : activeZone === 'governance'
              ? 'Governance'
              : 'CLI reference';
  const workspaceLabel = scope.workspace.active ? dashboardScopeLabel(scope) : 'No workspace';

  useEffect(() => {
    if (!requestedOperateZone || !hasWorkspace) {
      return;
    }
    setActiveZone(requestedOperateZone);
    onRequestedOperateZoneConsumed?.();
  }, [requestedOperateZone, hasWorkspace, onRequestedOperateZoneConsumed]);

  const handleZoneSelect = (zone: DashboardOperateZone) => {
    setActiveZone(zone);
    onOperateZoneSelect?.(zone);
  };

  return (
    <div className="dashboard-operate-layout">
      {!hasWorkspace ? (
        <WorkspaiEmptyState
          icon={<Settings2 size={18} />}
          title="Select a workspace to run commands"
          description={
            <>
              Run actions need an active workspace — doctor, bootstrap, project builders, and
              governance tiles unlock after selection.
            </>
          }
          actions={
            <>
              <button
                type="button"
                className="ws-btn ws-btn--primary"
                onClick={() => onNavigateSection('catalog')}
              >
                Open Library
              </button>
              <button type="button" className="ws-btn" onClick={onCreateWorkspace}>
                + Create workspace
              </button>
            </>
          }
        />
      ) : (
        <>
          <section className="dashboard-operate-summary" aria-label="Run workspace summary">
            <div className="dashboard-operate-summary__scope">
              <span className="ws-kicker">Run workspace</span>
              <strong>{workspaceLabel}</strong>
              <small>{dashboardScopeDetail(scope, { showPaths: false })}</small>
            </div>
            <div className="dashboard-operate-summary__state">
              <span>Current</span>
              <strong>{activeZoneLabel}</strong>
            </div>
            <div className="dashboard-operate-summary__actions">
              <button type="button" className="ws-btn" onClick={() => onNavigateSection('repair')}>
                <ArrowRight size={13} aria-hidden="true" />
                Open Repair
              </button>
            </div>
          </section>

          <DashboardOperateSubNav activeZone={activeZone} onZoneSelect={handleZoneSelect} />

          {activeZone === 'quick' || activeZone === 'build' || activeZone === 'share' ? (
            <EnterpriseDashboardFlow
              workspaceStatus={workspaceStatus}
              evidence={evidence}
              selectedFramework={selectedFramework}
              onSelectFramework={onSelectFramework}
              onOpenProjectBuilder={onOpenProjectBuilder}
              onOpenManualProject={onOpenManualProject}
              onRunWorkspaceCommand={onRunWorkspaceCommand}
              onRunFixPreview={onRunFixPreview}
              onRunChangeImpact={onRunChangeImpact}
              onRunTerminalBridge={onRunTerminalBridge}
              onOpenIncidentStudio={onOpenIncidentStudio}
              pendingCardIds={pendingCardIds}
              activeOperateZone={activeZone}
            />
          ) : null}

          {activeZone === 'intelligence' ? (
            <WorkspaceIntelligencePanel
              workspaceStatus={workspaceStatus}
              evidence={evidence}
              pendingCardIds={pendingCardIds}
              onWorkspaceModel={onWorkspaceModel}
              onIntelligenceSnapshot={onIntelligenceSnapshot}
              onWorkspaceDiff={onWorkspaceDiff}
              onWorkspaceImpact={onWorkspaceImpact}
              onWorkspaceContextAgent={onWorkspaceContextAgent}
              onWorkspaceAgentSync={onWorkspaceAgentSync}
              onWorkspaceVerify={onWorkspaceVerify}
              onWorkspaceExplain={onWorkspaceExplain}
              onWorkspaceWhy={onWorkspaceWhy}
              onWorkspaceTrace={onWorkspaceTrace}
              onWorkspaceWatch={onWorkspaceWatch}
              onWorkspaceMcp={onWorkspaceMcp}
              onWorkspaceImpactLens={onWorkspaceImpactLens}
              onRunImpactLensCli={onRunImpactLensCli}
              onRunFullChain={onIntelligenceChain}
              onSendWorkspaceToCopilot={onSendWorkspaceToCopilot}
            />
          ) : null}

          {activeZone === 'governance' ? (
            <WorkspaceGovernancePanel
              workspaceStatus={workspaceStatus}
              evidence={evidence}
              pendingCardIds={pendingCardIds}
              onBootstrap={onBootstrap}
              onSetup={onSetup}
              onWorkspaceSync={onWorkspaceSync}
              onFoundationEnsure={onFoundationEnsure}
              onContractInspect={onContractInspect}
              onContractVerify={onContractVerify}
              onReadiness={onReadiness}
              onAutopilotRelease={onAutopilotRelease}
              onMirrorOps={onMirrorOps}
              onCacheStatus={onCacheStatus}
              onPolicy={onPolicy}
              onInfra={onInfra}
            />
          ) : null}
        </>
      )}

      {hasWorkspace && activeZone === 'cli' ? (
        <div id="dashboard-operate-cli" className="dashboard-operate-zone dashboard-operate-cli">
          <CommandCheatsheet onCopyText={onCopyText} />
        </div>
      ) : null}
    </div>
  );
}
