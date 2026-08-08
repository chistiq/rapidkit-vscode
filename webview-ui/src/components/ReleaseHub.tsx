import { ArrowRight } from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type {
  DashboardEvidenceCard,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from '@/lib/dashboardEvidence';
import type { EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import {
  evidenceCardStatusLabel,
  findEvidenceCard,
  releaseHubStageStatus,
  resolveEvidenceCardPosture,
} from '@/lib/dashboardEvidence';
import {
  deriveDashboardReleaseGateReadiness,
  isWorkspaceEmptyForRelease,
} from '@/lib/dashboardReleaseReadiness';
import { EvidencePostureIcon } from './EvidencePostureIcon';
import type { DashboardEvidencePosture } from '@workspai-contracts/dashboardEvidencePosture';

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
  status: DashboardEvidenceStatus;
  card?: DashboardEvidenceCard;
  action: () => void;
  actionLabel: string;
  pending: boolean;
  disabled?: boolean;
};

const stagePosture = (
  card: DashboardEvidenceCard | undefined,
  status: DashboardEvidenceStatus
): DashboardEvidencePosture =>
  card ? resolveEvidenceCardPosture(card) : status === 'pass' ? 'healthy' : 'attention';

const statusClass = (posture: DashboardEvidencePosture) => `release-hub__stage--${posture}`;

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
  const readinessCard = findEvidenceCard(evidence, 'readiness');
  const analyzeCard = findEvidenceCard(evidence, 'analyze');
  const autopilotCard = findEvidenceCard(evidence, 'autopilot');
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const releaseBlockedDetail = releaseGate.blockedReason ?? 'Complete readiness and analyze first';

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
      status: readinessStatus,
      card: readinessCard,
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
      status: analyzeStatus,
      card: analyzeCard,
      action: onAnalyze,
      actionLabel: analyzeStatus === 'missing' ? 'Run analyze' : 'Refresh',
      pending: isPending('analyze'),
    },
    {
      id: 'verify',
      label: viewMode === 'guided' ? 'Verify' : 'Verify gates',
      detail: releaseGate.needsStudioVerify
        ? 'Open Studio to run telemetry verify gates before release'
        : (verifyCard?.summary ?? 'Workspace verify report and Studio hard gates'),
      status: verifyStatus,
      card: verifyCard,
      action: releaseGate.needsStudioVerify
        ? (onOpenStudioVerify ?? onWorkspaceVerify ?? onAnalyze)
        : (onWorkspaceVerify ?? onOpenStudioVerify ?? onAnalyze),
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
      status: autopilotStatus === 'missing' ? (releaseReady ? 'warn' : 'missing') : autopilotStatus,
      card: autopilotCard,
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
  const pipelinePosture = stagePosture(pipelineCard, pipelineStatus);

  return (
    <section className="release-hub" aria-label="Release pipeline">
      {showPipelineOrchestrator ? (
        <div
          className={`release-hub__orchestrator ${statusClass(pipelinePosture)}${pipelinePending ? ' release-hub__orchestrator--pending' : ''}`}
          aria-busy={pipelinePending || undefined}
        >
          <EvidencePostureIcon posture={pipelinePosture} size={17} />
          <div className="release-hub__orchestrator-copy">
            <strong>Governance pipeline</strong>
            <small>
              {pipelineCard?.status === 'missing'
                ? 'Sync → doctor → analyze → readiness → autopilot'
                : pipelineCard?.summary}
            </small>
          </div>
          <span className="release-hub__badge">
            {pipelineCard ? evidenceCardStatusLabel(pipelineCard) : 'Needs attention'}
          </span>
          <button
            type="button"
            className="release-hub__action release-hub__action--primary"
            onClick={onPipeline}
            disabled={pipelinePending}
          >
            {pipelinePending
              ? 'Running'
              : pipelineStatus === 'missing'
                ? 'Run pipeline'
                : 'Refresh'}
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
          const posture = stagePosture(stage.card, stage.status);
          return (
            <div key={stage.id} className="release-hub__stage-wrap">
              <div
                className={`release-hub__stage ${statusClass(posture)}${stage.pending ? ' release-hub__stage--pending' : ''}`}
                aria-busy={stage.pending || undefined}
              >
                <EvidencePostureIcon posture={posture} size={16} />
                <div className="release-hub__stage-copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </div>
                <span className="release-hub__badge">
                  {stage.card ? evidenceCardStatusLabel(stage.card) : 'Needs attention'}
                </span>
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
