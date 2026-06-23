import { MapPin, Play } from 'lucide-react';
import { EvidenceCardActions } from '@/components/EvidenceCardActions';
import { EvidenceCardLogDrawer } from '@/components/EvidenceCardLogDrawer';
import { cardNeedsAgentAttention } from '@/lib/evidenceAgentContext';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from '@/lib/dashboardEvidence';
import {
  evidenceCardStatusLabel,
  outcomeCards,
  resolveEvidenceFreshness,
} from '@/lib/dashboardEvidence';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import {
  resolveEvidenceCardOperateZone,
  type DashboardOperateZone,
} from '@/lib/dashboardOperateZones';

interface EvidenceOutcomePanelProps {
  evidence: DashboardEvidencePayload | null;
  pendingCardIds?: DashboardEvidenceCardId[];
  workspace?: { path?: string; name?: string };
  maxCards?: number;
  compact?: boolean;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard?: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard?: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot?: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput?: () => void;
  onOpenIncidentStudio: (card: DashboardEvidenceCard) => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenRunZone?: (zone: DashboardOperateZone) => void;
}

const statusChipClass: Record<DashboardEvidenceStatus, string> = {
  pass: 'ws-chip ws-chip--success',
  warn: 'ws-chip ws-chip--warn',
  fail: 'ws-chip ws-chip--error',
  missing: 'ws-chip ws-chip--muted',
};

export function EvidenceOutcomePanel({
  evidence,
  pendingCardIds = [],
  workspace,
  maxCards,
  compact = false,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onShowEvidenceOutput,
  onOpenIncidentStudio,
  onRevealArtifact,
  onOpenRunZone,
}: EvidenceOutcomePanelProps) {
  const cards = outcomeCards(evidence);
  const visibleCards =
    typeof maxCards === 'number' && maxCards > 0 ? cards.slice(0, maxCards) : cards;
  const hiddenCount = Math.max(0, cards.length - visibleCards.length);
  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      className={`evidence-outcome-panel${compact ? ' evidence-outcome-panel--compact' : ''}`}
      aria-label="Command outcomes"
    >
      <div className="evidence-outcome-panel__head">
        <span className="evidence-outcome-panel__title">Outcome review</span>
        <span className="ws-kicker evidence-outcome-panel__meta">Evidence outcomes by command</span>
      </div>
      <div className="evidence-outcome-panel__list">
        {visibleCards.map((card) => {
          const actionContract = buildDashboardEvidenceActionContract(card, {
            workspace,
            evidence,
          });
          const runAction = actionContract.commandAction;
          const studioTarget = actionContract.studioTarget;
          const runZone = resolveEvidenceCardOperateZone(card.id);
          const blockers = card.blockers ?? [];
          const isPending = pendingCardIds.includes(card.id);
          const freshness = resolveEvidenceFreshness(card);
          const needsAgentAttention = cardNeedsAgentAttention(card);
          return (
            <article
              key={`${card.scope}-${card.id}`}
              className={`evidence-outcome-panel__item evidence-outcome-panel__item--${card.status}`}
            >
              <div className="evidence-outcome-panel__item-head">
                <strong>{card.label}</strong>
                <span className={statusChipClass[card.status]}>
                  {isPending ? 'Refreshing' : evidenceCardStatusLabel(card)}
                </span>
              </div>
              <p className="evidence-outcome-panel__summary">{card.summary}</p>
              <p
                className={`evidence-freshness evidence-freshness--${freshness.status}`}
                title={freshness.detail}
              >
                {freshness.label} · {freshness.detail}
              </p>
              {blockers.length > 0 ? (
                <ul className="evidence-outcome-panel__blockers">
                  {blockers.slice(0, compact ? 2 : 4).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
              <div className="evidence-outcome-panel__actions">
                <EvidenceCardActions
                  cardId={card.id}
                  runLabel={actionContract.commandLabel}
                  pending={isPending}
                  canRun={Boolean(runAction)}
                  showAgentActions={needsAgentAttention}
                  onRun={
                    runAction
                      ? () => onRunCommand(runAction.command, runAction.commandData)
                      : undefined
                  }
                  onRefresh={onRefreshEvidenceCard}
                  artifactLabel={actionContract.artifactLabel}
                  artifactPath={actionContract.artifactPath}
                  artifactState={actionContract.artifactState}
                  onRevealArtifact={onRevealArtifact}
                  onAskStudio={onAskStudioAboutCard ? () => onAskStudioAboutCard(card) : undefined}
                  onSendToCopilot={
                    onSendEvidenceToCopilot ? () => onSendEvidenceToCopilot(card) : undefined
                  }
                  executionChannel={actionContract.executionChannel}
                />
                {!compact ? (
                  <EvidenceCardLogDrawer
                    card={card}
                    activity={evidence?.activity}
                    onOpenOutputChannel={onShowEvidenceOutput}
                    onRevealArtifact={onRevealArtifact}
                  />
                ) : null}
                {runZone && onOpenRunZone ? (
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() => onOpenRunZone(runZone)}
                    title="Jump to the matching section in Run"
                  >
                    <MapPin size={12} aria-hidden="true" />
                    Open in Run
                  </button>
                ) : null}
                {studioTarget && !needsAgentAttention ? (
                  <button
                    type="button"
                    className="ws-btn ws-btn--primary"
                    onClick={() => onOpenIncidentStudio(card)}
                  >
                    <Play size={12} aria-hidden="true" />
                    Open in Studio
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {hiddenCount > 0 ? (
        <div className="evidence-outcome-panel__footer">
          {hiddenCount} more outcome{hiddenCount === 1 ? '' : 's'} available in expanded view
        </div>
      ) : null}
    </section>
  );
}
