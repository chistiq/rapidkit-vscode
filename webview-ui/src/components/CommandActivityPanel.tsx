import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { EvidencePostureIcon } from '@/components/EvidencePostureIcon';
import type {
  DashboardActivityEntry,
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import { evidenceCardStatusLabel, resolveEvidenceCardPosture } from '@/lib/dashboardEvidence';
import {
  ACTIVITY_VISIBLE_EXPANDED,
  activityEntryCountLabel,
  formatActivityTimestamp,
  summarizeActivityLabels,
} from '@/lib/dashboardActivityDisplay';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import { evidenceCardPendingLabel } from '@/lib/dashboardEvidencePending';
import { EvidenceCardActions } from '@/components/EvidenceCardActions';
import { EvidenceCardLogDrawer } from '@/components/EvidenceCardLogDrawer';
import { cardNeedsAgentAttention } from '@/lib/evidenceAgentContext';
import type { EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import {
  filterEvidenceCardsForViewMode,
  groupEvidenceCardsForViewMode,
} from '@/lib/dashboardEvidenceViewMode';

interface CommandActivityPanelProps {
  evidence: DashboardEvidencePayload | null;
  pendingCardIds?: DashboardEvidenceCardId[];
  pendingRunCardIds?: DashboardEvidenceCardId[];
  pendingRefreshCardIds?: DashboardEvidenceCardId[];
  viewMode?: EvidenceViewMode;
  activityDefaultExpanded?: boolean;
  workspace?: { path?: string; name?: string };
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard?: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard?: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot?: (card: DashboardEvidenceCard) => void;
  onCopyEvidenceAgentHandoff?: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onClearActivity?: () => void;
}

const ARCHIVE_CARD_PAGE_SIZE = 12;

export function CommandActivityPanel({
  evidence,
  pendingCardIds = [],
  pendingRunCardIds = pendingCardIds,
  pendingRefreshCardIds = [],
  viewMode = 'expanded',
  activityDefaultExpanded = false,
  workspace,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onCopyEvidenceAgentHandoff,
  onShowEvidenceOutput,
  onRevealArtifact,
  onClearActivity,
}: CommandActivityPanelProps) {
  const [activityExpanded, setActivityExpanded] = useState(activityDefaultExpanded);
  const [expandedVisibleCardCount, setExpandedVisibleCardCount] = useState(ARCHIVE_CARD_PAGE_SIZE);
  const allCards = evidence?.cards ?? [];
  const cards = filterEvidenceCardsForViewMode(allCards, viewMode);
  const visibleCards = viewMode === 'expanded' ? cards.slice(0, expandedVisibleCardCount) : cards;
  const hiddenArchiveCardCount =
    viewMode === 'expanded' ? Math.max(0, cards.length - visibleCards.length) : 0;
  const groupedCards =
    viewMode === 'balanced' ? groupEvidenceCardsForViewMode(allCards, viewMode) : [];
  const activity = evidence?.activity ?? [];
  const visibleActivity = activity.slice(0, ACTIVITY_VISIBLE_EXPANDED);
  const activitySummary = summarizeActivityLabels(activity);

  if (cards.length === 0 && activity.length === 0) {
    return null;
  }

  return (
    <section
      className={`command-activity-panel command-activity-panel--${viewMode}`}
      aria-label="Command activity and artifacts"
    >
      <div className="command-activity-panel__head">
        <span className="command-activity-panel__title">Artifacts</span>
        <span className="ws-kicker command-activity-panel__meta">
          Generated evidence and its current posture
        </span>
        {activity.length > 0 && onClearActivity ? (
          <button
            type="button"
            className="ws-btn ws-btn--ghost command-activity-panel__clear"
            onClick={onClearActivity}
          >
            Clear history
          </button>
        ) : null}
      </div>

      {cards.length > 0 ? (
        viewMode === 'balanced' && groupedCards.length > 0 ? (
          <div className="command-activity-panel__groups">
            {groupedCards.map(({ group, cards: groupCards }) => (
              <div key={group.id} className="command-activity-panel__group">
                <div className="command-activity-panel__group-head">
                  <strong>{group.label}</strong>
                  <span className="command-activity-panel__group-meta">{group.description}</span>
                </div>
                <div className="command-activity-panel__evidence">
                  {groupCards.map((card) =>
                    renderEvidenceCard(
                      card,
                      pendingCardIds,
                      pendingRunCardIds,
                      pendingRefreshCardIds,
                      viewMode,
                      workspace,
                      evidence,
                      onRunCommand,
                      onRefreshEvidenceCard,
                      onAskStudioAboutCard,
                      onSendEvidenceToCopilot,
                      onCopyEvidenceAgentHandoff,
                      onShowEvidenceOutput,
                      onRevealArtifact
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="command-activity-panel__evidence">
            {visibleCards.map((card) =>
              renderEvidenceCard(
                card,
                pendingCardIds,
                pendingRunCardIds,
                pendingRefreshCardIds,
                viewMode,
                workspace,
                evidence,
                onRunCommand,
                onRefreshEvidenceCard,
                onAskStudioAboutCard,
                onSendEvidenceToCopilot,
                onCopyEvidenceAgentHandoff,
                onShowEvidenceOutput,
                onRevealArtifact
              )
            )}
            {hiddenArchiveCardCount > 0 ? (
              <button
                type="button"
                className="ws-btn ws-btn--ghost command-activity-panel__show-more"
                onClick={() =>
                  setExpandedVisibleCardCount((count) => count + ARCHIVE_CARD_PAGE_SIZE)
                }
              >
                Show {Math.min(ARCHIVE_CARD_PAGE_SIZE, hiddenArchiveCardCount)} more artifacts
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {activity.length > 0 ? (
        <div className="command-activity-panel__activity">
          <button
            type="button"
            className="command-activity-panel__activity-toggle"
            onClick={() => setActivityExpanded((open) => !open)}
            aria-expanded={activityExpanded}
          >
            <span className="command-activity-panel__activity-title">
              Recent commands
              <span className="command-activity-panel__activity-count">{activity.length}</span>
            </span>
            {!activityExpanded && activitySummary ? (
              <span className="command-activity-panel__activity-summary">{activitySummary}</span>
            ) : null}
            <ChevronDown
              size={12}
              className={`command-activity-panel__activity-chevron ${activityExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
          </button>

          {activityExpanded ? (
            <ul className="command-activity-panel__activity-list">
              {visibleActivity.map((entry) => (
                <ActivityChip key={entry.id} entry={entry} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function renderEvidenceCard(
  card: DashboardEvidenceCard,
  pendingCardIds: DashboardEvidenceCardId[],
  pendingRunCardIds: DashboardEvidenceCardId[],
  pendingRefreshCardIds: DashboardEvidenceCardId[],
  viewMode: EvidenceViewMode,
  workspace: { path?: string; name?: string } | undefined,
  evidence: DashboardEvidencePayload | null,
  onRunCommand: (command: string, data?: Record<string, unknown>) => void,
  onRefreshEvidenceCard: ((cardId: DashboardEvidenceCardId) => void) | undefined,
  onAskStudioAboutCard: ((card: DashboardEvidenceCard) => void) | undefined,
  onSendEvidenceToCopilot: ((card: DashboardEvidenceCard) => void) | undefined,
  onCopyEvidenceAgentHandoff: ((card: DashboardEvidenceCard) => void) | undefined,
  onShowEvidenceOutput: (() => void) | undefined,
  onRevealArtifact: ((artifactPath: string) => void) | undefined
) {
  const posture = resolveEvidenceCardPosture(card);
  const actionContract = buildDashboardEvidenceActionContract(card, { workspace, evidence });
  const runAction = actionContract.commandAction;
  const runPending = pendingRunCardIds.includes(card.id);
  const refreshPending = pendingRefreshCardIds.includes(card.id);
  const pending = pendingCardIds.includes(card.id);
  const pendingLabel = evidenceCardPendingLabel(card.id, pendingRunCardIds, pendingRefreshCardIds);
  const clickable = Boolean(card.artifactPath && onRevealArtifact);
  const showAgentActions = cardNeedsAgentAttention(card);
  const cardMainContent = (
    <>
      <EvidencePostureIcon posture={posture} size={20} />
      <span className="command-activity-panel__card-copy">
        <strong>{card.label}</strong>
        <small>{card.summary}</small>
      </span>
      <span
        className={`ws-chip ${posture === 'blocked' ? 'ws-chip--error' : posture === 'healthy' ? 'ws-chip--success' : 'ws-chip--warn'}`}
      >
        {pendingLabel ?? evidenceCardStatusLabel(card)}
      </span>
    </>
  );

  return (
    <div
      key={`${card.scope}-${card.id}`}
      className={`command-activity-panel__card command-activity-panel__card--${posture}${pending ? ' command-activity-panel__card--pending' : ''}`}
      aria-busy={pending || undefined}
    >
      {clickable ? (
        <button
          type="button"
          className="command-activity-panel__card-main"
          onClick={() => {
            if (card.artifactPath && onRevealArtifact) {
              onRevealArtifact(card.artifactPath);
            }
          }}
          title={card.summary}
        >
          {cardMainContent}
        </button>
      ) : (
        <div className="command-activity-panel__card-main command-activity-panel__card-main--static">
          {cardMainContent}
        </div>
      )}
      <EvidenceCardActions
        cardId={card.id}
        runLabel={actionContract.commandLabel}
        pending={runPending}
        refreshPending={refreshPending}
        canRun={Boolean(runAction)}
        showAgentActions={showAgentActions}
        compact
        primaryAction={actionContract.primaryAction}
        copyCommandText={runAction?.command}
        onRun={runAction ? () => onRunCommand(runAction.command, runAction.commandData) : undefined}
        onRefresh={onRefreshEvidenceCard}
        onAdvancedInspect={onShowEvidenceOutput}
        artifactLabel={actionContract.artifactLabel}
        artifactPath={actionContract.artifactPath}
        artifactState={actionContract.artifactState}
        onRevealArtifact={onRevealArtifact}
        onAskStudio={onAskStudioAboutCard ? () => onAskStudioAboutCard(card) : undefined}
        onSendToCopilot={onSendEvidenceToCopilot ? () => onSendEvidenceToCopilot(card) : undefined}
        onCopyAgentHandoff={
          onCopyEvidenceAgentHandoff ? () => onCopyEvidenceAgentHandoff(card) : undefined
        }
        executionChannel={actionContract.executionChannel}
      />
      <EvidenceCardLogDrawer
        card={card}
        activity={evidence?.activity}
        defaultExpanded={false}
        onOpenOutputChannel={onShowEvidenceOutput}
        onRevealArtifact={onRevealArtifact}
      />
    </div>
  );
}

function ActivityChip({ entry }: { entry: DashboardActivityEntry }) {
  const repeatLabel = activityEntryCountLabel(entry);

  return (
    <li
      className={`command-activity-panel__activity-chip command-activity-panel__activity-chip--${entry.status}`}
      title={`${entry.label} · ${entry.scope} · ${formatActivityTimestamp(entry.timestamp)}`}
    >
      <span className="command-activity-panel__activity-label">{entry.label}</span>
      {repeatLabel ? (
        <span className="command-activity-panel__activity-repeat">{repeatLabel}</span>
      ) : null}
      <span className="command-activity-panel__activity-meta">
        {formatActivityTimestamp(entry.timestamp)}
      </span>
    </li>
  );
}
