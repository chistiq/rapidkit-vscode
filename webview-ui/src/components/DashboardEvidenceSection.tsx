import { ArrowRight, ClipboardCheck, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CommandActivityPanel } from '@/components/CommandActivityPanel';
import { EvidenceAttentionInbox } from '@/components/EvidenceAttentionInbox';
import { EvidenceViewModeToggle } from '@/components/EvidenceViewModeToggle';
import { ReleaseHub } from '@/components/ReleaseHub';
import { DashboardTrendChart } from '@/components/DashboardTrendChart';
import { WorkspaiEmptyState } from '@/components/WorkspaiEmptyState';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import { evidenceIsSparse } from '@/lib/dashboardEvidence';
import type { DashboardSection } from '@/lib/dashboardSections';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { dashboardScopeDetail, dashboardScopeLabel } from '@/lib/dashboardScope';
import type { EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import { EVIDENCE_VIEW_MODE_HINTS } from '@/lib/dashboardEvidenceViewMode';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import { buildDashboardEvidenceBrief, type EvidenceBriefView } from '@/lib/dashboardEvidenceBrief';

interface DashboardEvidenceSectionProps {
  evidence: DashboardEvidencePayload | null;
  hasWorkspace: boolean;
  hasProject?: boolean;
  scope: DashboardScopeDescriptor;
  workspace?: { path?: string; name?: string };
  evidenceViewMode: EvidenceViewMode;
  onEvidenceViewModeChange: (mode: EvidenceViewMode) => void;
  pendingCardIds?: DashboardEvidenceCardId[];
  pendingRunCardIds?: DashboardEvidenceCardId[];
  pendingRefreshCardIds?: DashboardEvidenceCardId[];
  isEvidenceFullRefreshPending?: boolean;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidence: () => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onCopyEvidenceAgentHandoff: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput: () => void;
  onClearActivity: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenIncidentStudio: (card: DashboardEvidenceCard) => void;
  onPipeline: () => void;
  onReadiness: () => void;
  onAnalyze: () => void;
  onAutopilotRelease: () => void;
  onWorkspaceVerify?: () => void;
  onOpenStudioVerify?: () => void;
  onNavigateSection: (section: DashboardSection) => void;
  onOpenRunZone?: (zone: DashboardOperateZone) => void;
}

function EvidenceBrief({
  brief,
  evidenceViewMode,
  onOpenRepairFlow,
  onRefreshEvidence,
  onEvidenceViewModeChange,
  isRefreshing = false,
}: {
  brief: EvidenceBriefView;
  evidenceViewMode: EvidenceViewMode;
  onOpenRepairFlow: () => void;
  onRefreshEvidence: () => void;
  onEvidenceViewModeChange: (mode: EvidenceViewMode) => void;
  isRefreshing?: boolean;
}) {
  const Icon = brief.posture === 'healthy' ? ShieldCheck : ShieldAlert;
  const canShowDetails = evidenceViewMode === 'guided';

  return (
    <section
      className={`evidence-brief evidence-brief--${brief.posture}`}
      aria-label="Artifacts brief"
    >
      <div className="evidence-brief__main">
        <span className="evidence-brief__icon" aria-hidden="true">
          <Icon size={17} />
        </span>
        <div className="evidence-brief__copy">
          <span className="ws-kicker">Artifacts brief</span>
          <h3>{brief.label}</h3>
          <p>{brief.summary}</p>
          <small>{brief.detail}</small>
        </div>
      </div>
      <div className="evidence-brief__metrics" aria-label="Evidence counters">
        {brief.metrics.map((metric) => (
          <span
            key={metric.label}
            className={`evidence-brief__metric evidence-brief__metric--${metric.tone}`}
          >
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </span>
        ))}
      </div>
      <div className="evidence-brief__actions">
        <button
          type="button"
          className="ws-btn ws-btn--primary"
          onClick={onRefreshEvidence}
          disabled={isRefreshing}
          aria-busy={isRefreshing || undefined}
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            className={isRefreshing ? 'spinning' : undefined}
          />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="ws-btn ws-btn--ghost" onClick={onOpenRepairFlow}>
          <ArrowRight size={13} aria-hidden="true" />
          Repair flow
        </button>
        {canShowDetails ? (
          <button
            type="button"
            className="ws-btn ws-btn--ghost"
            onClick={() => onEvidenceViewModeChange('balanced')}
          >
            View details
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardEvidenceSection({
  evidence,
  hasWorkspace,
  hasProject = false,
  scope,
  workspace,
  evidenceViewMode,
  onEvidenceViewModeChange,
  pendingCardIds = [],
  pendingRunCardIds = pendingCardIds,
  pendingRefreshCardIds = [],
  isEvidenceFullRefreshPending = false,
  onRunCommand,
  onRefreshEvidence,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onCopyEvidenceAgentHandoff,
  onShowEvidenceOutput,
  onClearActivity,
  onRevealArtifact,
  onOpenIncidentStudio,
  onPipeline,
  onReadiness,
  onAnalyze,
  onAutopilotRelease,
  onWorkspaceVerify,
  onOpenStudioVerify,
  onNavigateSection,
  onOpenRunZone,
}: DashboardEvidenceSectionProps) {
  if (!hasWorkspace) {
    return (
      <WorkspaiEmptyState
        icon={<ClipboardCheck size={18} />}
        title="No workspace selected"
        description={
          <>
            Artifacts unlock after you create, import, or switch to a workspace. Command cards stay
            hidden until there is a real workspace target.
          </>
        }
        actions={
          <button
            type="button"
            className="ws-btn ws-btn--primary"
            onClick={() => onNavigateSection('overview')}
          >
            Back to Home
          </button>
        }
      />
    );
  }

  const cards = evidence?.cards ?? [];
  const activity = evidence?.activity ?? [];
  const sparseWorkspaceEvidence = evidenceIsSparse(evidence, hasWorkspace);
  const hasEvidenceContent = cards.length > 0 || activity.length > 0 || hasWorkspace;
  const showAttentionInbox = evidenceViewMode !== 'expanded';
  const showActivityPanel = evidenceViewMode === 'expanded';
  const showReleaseHub = evidenceViewMode === 'balanced';
  const brief = buildDashboardEvidenceBrief({ evidence, hasWorkspace, hasProject });

  if (!hasEvidenceContent) {
    return (
      <WorkspaiEmptyState
        icon={<ClipboardCheck size={18} />}
        title="No artifacts yet"
        description={
          <>
            Select a workspace to populate the artifact archive. Doctor, analyze, readiness, and
            release command outputs are stored here.
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
            <button type="button" className="ws-btn" onClick={() => onNavigateSection('operate')}>
              Open Run
            </button>
          </>
        }
      />
    );
  }

  if (sparseWorkspaceEvidence) {
    const bootstrapContract = buildDashboardEvidenceActionContract(
      {
        id: 'bootstrap',
        label: 'Bootstrap compliance',
        status: 'missing',
        summary: '',
        scope: 'workspace',
      },
      { workspace }
    );
    const bootstrapAction = bootstrapContract.commandAction;
    const doctorContract = buildDashboardEvidenceActionContract(
      {
        id: 'doctor',
        label: 'Workspace Doctor',
        status: 'missing',
        summary: '',
        scope: 'workspace',
      },
      { workspace }
    );
    const doctorAction = doctorContract.commandAction;

    return (
      <WorkspaiEmptyState
        icon={<ClipboardCheck size={18} />}
        title="No governance artifacts yet"
        description={
          <>
            This workspace has no doctor, analyze, or readiness artifacts yet. Use Repair flow or
            Run to generate the first command records.
          </>
        }
        actions={
          <>
            <button
              type="button"
              className="ws-btn ws-btn--primary"
              onClick={() =>
                bootstrapAction &&
                onRunCommand(bootstrapAction.command, bootstrapAction.commandData)
              }
            >
              Bootstrap workspace
            </button>
            <button
              type="button"
              className="ws-btn"
              onClick={() =>
                doctorAction && onRunCommand(doctorAction.command, doctorAction.commandData)
              }
            >
              Run doctor
            </button>
            <button type="button" className="ws-btn" onClick={() => onNavigateSection('operate')}>
              Open Run
            </button>
          </>
        }
      />
    );
  }

  const isRefreshingEvidence = isEvidenceFullRefreshPending || pendingRefreshCardIds.length > 0;

  return (
    <div className="ws-dashboard-evidence-layout" data-evidence-view={evidenceViewMode}>
      <EvidenceBrief
        brief={brief}
        evidenceViewMode={evidenceViewMode}
        onOpenRepairFlow={() => onNavigateSection('repair')}
        onRefreshEvidence={onRefreshEvidence}
        onEvidenceViewModeChange={onEvidenceViewModeChange}
        isRefreshing={isRefreshingEvidence}
      />

      {evidenceViewMode !== 'guided' ? <DashboardTrendChart trend={evidence?.trend} /> : null}

      <div className="ws-dashboard-evidence-toolbar">
        <div>
          <span className="ws-kicker">
            {evidenceViewMode === 'expanded'
              ? 'Evidence archive'
              : evidenceViewMode === 'balanced'
                ? 'Release evidence'
                : 'Attention queue'}
          </span>
          <p>
            {dashboardScopeLabel(scope)} · {dashboardScopeDetail(scope, { showPaths: false })} ·{' '}
            {EVIDENCE_VIEW_MODE_HINTS[evidenceViewMode]}
          </p>
        </div>
        <div className="ws-dashboard-evidence-toolbar__actions">
          <EvidenceViewModeToggle value={evidenceViewMode} onChange={onEvidenceViewModeChange} />
        </div>
      </div>

      {showAttentionInbox ? (
        <EvidenceAttentionInbox
          evidence={evidence}
          pendingCardIds={pendingCardIds}
          pendingRunCardIds={pendingRunCardIds}
          pendingRefreshCardIds={pendingRefreshCardIds}
          maxItems={evidenceViewMode === 'guided' ? 3 : 5}
          showItemActions
          workspace={workspace}
          onSelectCard={onAskStudioAboutCard}
          onRunCommand={onRunCommand}
          onRefreshEvidenceCard={onRefreshEvidenceCard}
          onAskStudioAboutCard={onAskStudioAboutCard}
          onSendEvidenceToCopilot={onSendEvidenceToCopilot}
          onCopyEvidenceAgentHandoff={onCopyEvidenceAgentHandoff}
          onRevealArtifact={onRevealArtifact}
          onOpenProjectLifecycle={() => onNavigateSection('console')}
          onShowAll={() => onEvidenceViewModeChange('balanced')}
        />
      ) : null}

      {showReleaseHub ? (
        <div className="ws-dashboard-evidence-layout__split release-only">
          <ReleaseHub
            evidence={evidence}
            hasWorkspace={hasWorkspace}
            viewMode={evidenceViewMode}
            pendingCardIds={pendingCardIds}
            onPipeline={onPipeline}
            onReadiness={onReadiness}
            onAnalyze={onAnalyze}
            onAutopilotRelease={onAutopilotRelease}
            onWorkspaceVerify={onWorkspaceVerify}
            onOpenStudioVerify={onOpenStudioVerify}
            onOpenRunBuild={onOpenRunZone ? () => onOpenRunZone('build') : undefined}
          />
        </div>
      ) : null}

      {showActivityPanel ? (
        <CommandActivityPanel
          evidence={evidence}
          pendingCardIds={pendingCardIds}
          pendingRunCardIds={pendingRunCardIds}
          pendingRefreshCardIds={pendingRefreshCardIds}
          viewMode={evidenceViewMode}
          workspace={workspace}
          onRunCommand={onRunCommand}
          onRefreshEvidenceCard={onRefreshEvidenceCard}
          onAskStudioAboutCard={onAskStudioAboutCard}
          onSendEvidenceToCopilot={onSendEvidenceToCopilot}
          onCopyEvidenceAgentHandoff={onCopyEvidenceAgentHandoff}
          onShowEvidenceOutput={onShowEvidenceOutput}
          onClearActivity={onClearActivity}
          onRevealArtifact={onRevealArtifact}
        />
      ) : null}
    </div>
  );
}
