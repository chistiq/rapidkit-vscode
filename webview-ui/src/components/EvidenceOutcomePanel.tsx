import { ExternalLink, Play, RotateCcw } from 'lucide-react';
import type {
  DashboardEvidenceCard,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from '@/lib/dashboardEvidence';
import { evidenceStatusLabel, outcomeCards } from '@/lib/dashboardEvidence';
import {
  buildIncidentStudioEvidenceOpen,
  resolveEvidenceCardCommandAction,
} from '@/lib/dashboardEvidenceActions';

interface EvidenceOutcomePanelProps {
  evidence: DashboardEvidencePayload | null;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onOpenIncidentStudio: (card: DashboardEvidenceCard) => void;
  onRevealArtifact?: (artifactPath: string) => void;
}

const statusChipClass: Record<DashboardEvidenceStatus, string> = {
  pass: 'ws-chip ws-chip--success',
  warn: 'ws-chip ws-chip--warn',
  fail: 'ws-chip ws-chip--error',
  missing: 'ws-chip ws-chip--muted',
};

export function EvidenceOutcomePanel({
  evidence,
  onRunCommand,
  onOpenIncidentStudio,
  onRevealArtifact,
}: EvidenceOutcomePanelProps) {
  const cards = outcomeCards(evidence);
  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="evidence-outcome-panel" aria-label="Command outcomes">
      <div className="evidence-outcome-panel__head">
        <span className="evidence-outcome-panel__title">Outcome review</span>
        <span className="ws-kicker evidence-outcome-panel__meta">
          Actionable blockers from the latest evidence artifacts
        </span>
      </div>
      <div className="evidence-outcome-panel__list">
        {cards.map((card) => {
          const runAction = resolveEvidenceCardCommandAction(card);
          const studioTarget = buildIncidentStudioEvidenceOpen(card);
          const blockers = card.blockers ?? [];
          return (
            <article
              key={`${card.scope}-${card.id}`}
              className={`evidence-outcome-panel__item evidence-outcome-panel__item--${card.status}`}
            >
              <div className="evidence-outcome-panel__item-head">
                <strong>{card.label}</strong>
                <span className={statusChipClass[card.status]}>
                  {evidenceStatusLabel(card.status)}
                </span>
              </div>
              <p className="evidence-outcome-panel__summary">{card.summary}</p>
              {blockers.length > 0 ? (
                <ul className="evidence-outcome-panel__blockers">
                  {blockers.slice(0, 4).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
              <div className="evidence-outcome-panel__actions">
                {runAction ? (
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() => onRunCommand(runAction.command)}
                    title={`Re-run ${runAction.label}`}
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                    Re-run
                  </button>
                ) : null}
                {card.artifactPath && onRevealArtifact ? (
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() => onRevealArtifact(card.artifactPath!)}
                  >
                    <ExternalLink size={12} aria-hidden="true" />
                    Artifact
                  </button>
                ) : null}
                {studioTarget ? (
                  <button
                    type="button"
                    className="ws-btn ws-btn--primary"
                    onClick={() => onOpenIncidentStudio(card)}
                  >
                    <Play size={12} aria-hidden="true" />
                    Open in Incident Studio
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
