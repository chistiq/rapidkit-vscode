import { ArrowRight, Rocket, ScanSearch, ShieldCheck } from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidencePayload, DashboardEvidenceStatus } from '@/lib/dashboardEvidence';
import { evidenceStatusLabel, releaseHubStageStatus } from '@/lib/dashboardEvidence';

interface ReleaseHubProps {
  evidence: DashboardEvidencePayload | null;
  hasWorkspace: boolean;
  onReadiness: () => void;
  onAnalyze: () => void;
  onAutopilotRelease: () => void;
  pendingCardIds?: DashboardEvidenceCardId[];
}

type ReleaseStage = {
  id: 'readiness' | 'analyze' | 'release';
  label: string;
  detail: string;
  icon: typeof ShieldCheck;
  status: DashboardEvidenceStatus;
  action: () => void;
  actionLabel: string;
  pending: boolean;
};

const statusClass = (status: DashboardEvidenceStatus) =>
  `release-hub__stage--${status === 'missing' ? 'idle' : status}`;

export function ReleaseHub({
  evidence,
  hasWorkspace,
  onReadiness,
  onAnalyze,
  onAutopilotRelease,
  pendingCardIds = [],
}: ReleaseHubProps) {
  if (!hasWorkspace) {
    return null;
  }

  const readinessStatus = releaseHubStageStatus(evidence, 'readiness');
  const analyzeStatus = releaseHubStageStatus(evidence, 'analyze');
  const releaseReady =
    (readinessStatus === 'pass' || readinessStatus === 'warn') &&
    (analyzeStatus === 'pass' || analyzeStatus === 'warn');
  const autopilotStatus = releaseHubStageStatus(evidence, 'release');
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);

  const stages: ReleaseStage[] = [
    {
      id: 'readiness',
      label: 'Readiness gate',
      detail: 'Release policy and bootstrap evidence',
      icon: ShieldCheck,
      status: readinessStatus,
      action: onReadiness,
      actionLabel: readinessStatus === 'missing' ? 'Run readiness' : 'Refresh',
      pending: isPending('readiness'),
    },
    {
      id: 'analyze',
      label: 'Analyze evidence',
      detail: 'Strict workspace analyze report',
      icon: ScanSearch,
      status: analyzeStatus,
      action: onAnalyze,
      actionLabel: analyzeStatus === 'missing' ? 'Run analyze' : 'Refresh',
      pending: isPending('analyze'),
    },
    {
      id: 'release',
      label: 'Autopilot release',
      detail: releaseReady
        ? autopilotStatus === 'pass'
          ? 'Latest autopilot release evidence is green'
          : 'Gates are green enough to attempt release'
        : 'Complete readiness and analyze first',
      icon: Rocket,
      status: autopilotStatus === 'missing' ? (releaseReady ? 'warn' : 'missing') : autopilotStatus,
      action: onAutopilotRelease,
      actionLabel: autopilotStatus === 'missing' ? 'Release' : 'Refresh',
      pending: isPending('autopilot') || isPending('readiness'),
    },
  ];

  return (
    <section className="release-hub" aria-label="Release pipeline">
      <div className="release-hub__head">
        <span className="release-hub__title">Release hub</span>
        <span className="release-hub__meta">Readiness → Analyze → Autopilot</span>
      </div>
      <div className="release-hub__pipeline">
        {stages.map((stage, index) => {
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
                  disabled={stage.pending || (stage.id === 'release' && !releaseReady)}
                >
                  {stage.pending ? 'Running' : stage.actionLabel}
                </button>
              </div>
              {index < stages.length - 1 ? (
                <ArrowRight size={14} className="release-hub__connector" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
