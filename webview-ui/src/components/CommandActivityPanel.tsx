import { Activity, CheckCircle2, ChevronDown, Clock3, XCircle } from 'lucide-react';
import { useState } from 'react';
import type {
  DashboardActivityEntry,
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from '@/lib/dashboardEvidence';
import { evidenceCardStatusLabel } from '@/lib/dashboardEvidence';
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
  onShowEvidenceOutput?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onClearActivity?: () => void;
}

const statusIcon: Record<DashboardEvidenceStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: Clock3,
  fail: XCircle,
  missing: Activity,
};

const statusChipClass: Record<DashboardEvidenceStatus, string> = {
  pass: 'ws-chip ws-chip--success',
  warn: 'ws-chip ws-chip--warn',
  fail: 'ws-chip ws-chip--error',
  missing: 'ws-chip ws-chip--muted',
};

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
  onShowEvidenceOutput,
  onRevealArtifact,
  onClearActivity,
}: CommandActivityPanelProps) {
  const [activityExpanded, setActivityExpanded] = useState(activityDefaultExpanded);
  const allCards = evidence?.cards ?? [];
  const cards = filterEvidenceCardsForViewMode(allCards, viewMode);
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
        <span className="command-activity-panel__title">Artifact archive</span>
        <span className="ws-kicker command-activity-panel__meta">
          Command → artifact → outcome → next step
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
                      workspace,
                      evidence,
                      onRunCommand,
                      onRefreshEvidenceCard,
                      onAskStudioAboutCard,
                      onSendEvidenceToCopilot,
                      onShowEvidenceOutput,
                      onRevealArtifact,
                      statusIcon,
                      statusChipClass
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="command-activity-panel__evidence">
            {cards.map((card) =>
              renderEvidenceCard(
                card,
                pendingCardIds,
                pendingRunCardIds,
                pendingRefreshCardIds,
                workspace,
                evidence,
                onRunCommand,
                onRefreshEvidenceCard,
                onAskStudioAboutCard,
                onSendEvidenceToCopilot,
                onShowEvidenceOutput,
                onRevealArtifact,
                statusIcon,
                statusChipClass
              )
            )}
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
  workspace: { path?: string; name?: string } | undefined,
  evidence: DashboardEvidencePayload | null,
  onRunCommand: (command: string, data?: Record<string, unknown>) => void,
  onRefreshEvidenceCard: ((cardId: DashboardEvidenceCardId) => void) | undefined,
  onAskStudioAboutCard: ((card: DashboardEvidenceCard) => void) | undefined,
  onSendEvidenceToCopilot: ((card: DashboardEvidenceCard) => void) | undefined,
  onShowEvidenceOutput: (() => void) | undefined,
  onRevealArtifact: ((artifactPath: string) => void) | undefined,
  statusIconMap: Record<DashboardEvidenceStatus, typeof CheckCircle2>,
  chipClass: Record<DashboardEvidenceStatus, string>
) {
  const Icon = statusIconMap[card.status];
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
      <Icon size={14} aria-hidden="true" />
      <span className="command-activity-panel__card-copy">
        <strong>{card.label}</strong>
        <small>{card.summary}</small>
      </span>
      <span className={chipClass[card.status]}>
        {pendingLabel ?? evidenceCardStatusLabel(card)}
      </span>
    </>
  );

  return (
    <div
      key={`${card.scope}-${card.id}`}
      className={`command-activity-panel__card command-activity-panel__card--${card.status}${pending ? ' command-activity-panel__card--pending' : ''}`}
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
        executionChannel={actionContract.executionChannel}
      />
      <div className="command-activity-panel__card-contract" aria-label="Action contract">
        <span>{actionContract.artifactLabel}</span>
        <span>{actionContract.studioLabel}</span>
        <span>{actionContract.copilotLabel}</span>
      </div>
      <EvidenceCardLogDrawer
        card={card}
        activity={evidence?.activity}
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
