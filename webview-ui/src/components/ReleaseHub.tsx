import { ArrowRight, Rocket, ScanSearch, Server, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidencePayload, DashboardEvidenceStatus } from '@/lib/dashboardEvidence';
import type { EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import {
  evidenceStatusLabel,
  findEvidenceCard,
  releaseHubStageStatus,
} from '@/lib/dashboardEvidence';
import {
  deriveDashboardReleaseGateReadiness,
  isWorkspaceEmptyForRelease,
} from '@/lib/dashboardReleaseReadiness';

interface ReleaseHubProps {
  evidence: DashboardEvidencePayload | null;
  hasWorkspace: boolean;
  viewMode?: EvidenceViewMode;
  onPipeline: () => void;
  onReadiness: () => void;
  onAnalyze: () => void;
  onAutopilotRelease: () => void;
  onWorkspaceVerify?: () => void;
  onOpenStudioVerify?: () => void;
  onOpenRunBuild?: () => void;
  pendingCardIds?: DashboardEvidenceCardId[];
}

type ReleaseStage = {
  id: 'readiness' | 'analyze' | 'verify' | 'release';
  label: string;
  detail: string;
  icon: typeof ShieldCheck;
  status: DashboardEvidenceStatus;
  action: () => void;
  actionLabel: string;
  pending: boolean;
  disabled?: boolean;
};

const statusClass = (status: DashboardEvidenceStatus) =>
  `release-hub__stage--${status === 'missing' ? 'idle' : status}`;

export function ReleaseHub({
  evidence,
  hasWorkspace,
  viewMode = 'expanded',
  onPipeline,
  onReadiness,
  onAnalyze,
  onAutopilotRelease,
  onWorkspaceVerify,
  onOpenStudioVerify,
  onOpenRunBuild,
  pendingCardIds = [],
}: ReleaseHubProps) {
  if (!hasWorkspace) {
    return null;
  }

  const emptyWorkspace = isWorkspaceEmptyForRelease(evidence);
  const releaseGate = deriveDashboardReleaseGateReadiness(evidence);
  const releaseReady = releaseGate.releaseReady;

  if (emptyWorkspace) {
    return (
      <section className="release-hub release-hub--empty" aria-label="Release pipeline">
        <div className="release-hub__head">
          <span className="release-hub__title">Release hub</span>
          <span className="release-hub__meta">Release gates need at least one project</span>
        </div>
        <p className="release-hub__empty-copy">
          This workspace has no registered projects. Scaffold or import a backend service before
          readiness, analyze, and autopilot release.
        </p>
        {onOpenRunBuild ? (
          <button type="button" className="ws-btn ws-btn--primary" onClick={onOpenRunBuild}>
            Open Run — Build
          </button>
        ) : null}
      </section>
    );
  }

  const pipelineCard = findEvidenceCard(evidence, 'pipeline');
  const pipelineStatus = pipelineCard?.status ?? 'missing';
  const pipelinePending = pendingCardIds.includes('pipeline');

  const readinessStatus = releaseHubStageStatus(evidence, 'readiness');
  const analyzeStatus = releaseHubStageStatus(evidence, 'analyze');
  const autopilotStatus = releaseHubStageStatus(evidence, 'release');
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const releaseBlockedDetail =
    releaseGate.blockedReason ?? 'Complete readiness and analyze first';

  const verifyCard = findEvidenceCard(evidence, 'workspaceVerify');
  const verifyStatus = releaseGate.verifyStatus;
  const verifyPending = isPending('workspaceVerify');

  const stages: ReleaseStage[] = [
    {
      id: 'readiness',
      label: viewMode === 'guided' ? 'Readiness' : 'Readiness gate',
      detail:
        viewMode === 'guided'
          ? 'Release policy and bootstrap checks'
          : 'Release policy and bootstrap evidence',
      icon: ShieldCheck,
      status: readinessStatus,
      action: onReadiness,
      actionLabel: readinessStatus === 'missing' ? 'Run readiness' : 'Refresh',
      pending: isPending('readiness'),
    },
    {
      id: 'analyze',
      label: viewMode === 'guided' ? 'Analyze' : 'Analyze evidence',
      detail:
        viewMode === 'guided'
          ? 'Strict workspace analyze report'
          : 'Strict workspace analyze report',
      icon: ScanSearch,
      status: analyzeStatus,
      action: onAnalyze,
      actionLabel: analyzeStatus === 'missing' ? 'Run analyze' : 'Refresh',
      pending: isPending('analyze'),
    },
    {
      id: 'verify',
      label: viewMode === 'guided' ? 'Verify' : 'Verify gates',
      detail: releaseGate.needsStudioVerify
        ? 'Open Studio to run telemetry verify gates before release'
        : verifyCard?.summary ?? 'Workspace verify report and Studio hard gates',
      icon: ShieldAlert,
      status: verifyStatus,
      action: releaseGate.needsStudioVerify
        ? onOpenStudioVerify ?? onWorkspaceVerify ?? onAnalyze
        : onWorkspaceVerify ?? onOpenStudioVerify ?? onAnalyze,
      actionLabel: releaseGate.needsStudioVerify
        ? 'Open Studio'
        : verifyStatus === 'missing'
          ? 'Run verify'
          : 'Refresh',
      pending: verifyPending,
    },
    {
      id: 'release',
      label: viewMode === 'guided' ? 'Release' : 'Autopilot release',
      detail: releaseReady
        ? autopilotStatus === 'pass'
          ? 'Latest autopilot release evidence is green'
          : 'Gates are green enough to attempt release'
        : releaseBlockedDetail,
      icon: Rocket,
      status: autopilotStatus === 'missing' ? (releaseReady ? 'warn' : 'missing') : autopilotStatus,
      action: onAutopilotRelease,
      actionLabel: autopilotStatus === 'missing' ? 'Release' : 'Refresh',
      pending: isPending('autopilot') || isPending('readiness') || isPending('analyze'),
      disabled: !releaseReady,
    },
  ];

  const stageGreenEnough = (status: DashboardEvidenceStatus) =>
    status === 'pass' || status === 'warn';

  const visibleStages =
    viewMode === 'guided'
      ? stages.filter((stage) => {
          if (stage.id === 'verify') {
            return stageGreenEnough(analyzeStatus) && stageGreenEnough(readinessStatus);
          }
          return true;
        })
      : stages;

  const showPipelineOrchestrator = viewMode !== 'guided';

  return (
    <section className="release-hub" aria-label="Release pipeline">
      {showPipelineOrchestrator ? (
        <div
          className={`release-hub__orchestrator ${statusClass(pipelineStatus)}${pipelinePending ? ' release-hub__orchestrator--pending' : ''}`}
          aria-busy={pipelinePending || undefined}
        >
          <Server size={16} aria-hidden="true" />
          <div className="release-hub__orchestrator-copy">
            <strong>Governance pipeline</strong>
            <small>
              {pipelineCard?.status === 'missing'
                ? 'Sync → doctor → analyze → readiness → autopilot'
                : pipelineCard?.summary}
            </small>
          </div>
          <span className="release-hub__badge">{evidenceStatusLabel(pipelineStatus)}</span>
          <button
            type="button"
            className="release-hub__action release-hub__action--primary"
            onClick={onPipeline}
            disabled={pipelinePending}
          >
            {pipelinePending ? 'Running' : pipelineStatus === 'missing' ? 'Run pipeline' : 'Refresh'}
          </button>
        </div>
      ) : null}

      <div className="release-hub__head">
        <span className="release-hub__title">Release hub</span>
        <span className="release-hub__meta">
          {viewMode === 'guided'
            ? 'Core release gates — switch view for full pipeline'
            : 'Outcomes stay here · start full pipeline from Run → Quick'}
        </span>
      </div>
      <div className="release-hub__pipeline">
        {visibleStages.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <div key={stage.id} className="release-hub__stage-wrap">
              <div
                className={`release-hub__stage ${statusClass(stage.status)}${stage.pending ? ' release-hub__stage--pending' : ''}`}
                aria-busy={stage.pending || undefined}
              >
                <Icon size={15} aria-hidden="true" />
                <div className="release-hub__stage-copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </div>
                <span className="release-hub__badge">{evidenceStatusLabel(stage.status)}</span>
                <button
                  type="button"
                  className="release-hub__action"
                  onClick={stage.action}
                  disabled={stage.pending || stage.disabled}
                >
                  {stage.pending ? 'Running' : stage.actionLabel}
                </button>
              </div>
              {index < visibleStages.length - 1 ? (
                <ArrowRight size={14} className="release-hub__connector" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
