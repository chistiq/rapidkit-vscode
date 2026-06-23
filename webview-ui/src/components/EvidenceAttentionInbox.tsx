import { AlertTriangle, Bot, FileSearch, Play, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { evidenceCardPendingLabel } from '@/lib/dashboardEvidencePending';
import { CommandExecutionBadge } from '@/components/CommandExecutionBadge';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import {
  buildEvidenceAttentionInbox,
  countEvidenceAttentionBuckets,
  type EvidenceAttentionItem,
} from '@/lib/evidenceAgentContext';
import { evidenceCardStatusLabel } from '@/lib/dashboardEvidence';
import { resolveEvidenceFreshness } from '@/lib/dashboardEvidence';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import type { EvidenceWorkspaceContext } from '@/lib/dashboardEvidenceDirectRun';
import { resolveEvidenceProjectAttribution } from '@/lib/dashboardEvidenceProjectAttribution';

interface EvidenceAttentionInboxProps {
  evidence: DashboardEvidencePayload | null;
  pendingCardIds?: string[];
  pendingRunCardIds?: string[];
  pendingRefreshCardIds?: string[];
  maxItems?: number;
  showItemActions?: boolean;
  workspace?: EvidenceWorkspaceContext;
  onSelectCard?: (card: DashboardEvidenceCard) => void;
  onRunCommand?: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard?: (cardId: DashboardEvidenceCard['id']) => void;
  onAskStudioAboutCard?: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot?: (card: DashboardEvidenceCard) => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenProjectLifecycle?: () => void;
  onShowAll?: () => void;
}

function AttentionRow({
  item,
  pending,
  runPending,
  refreshPending,
  evidence,
  workspace,
  onSelect,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudio,
  onSendToCopilot,
  onRevealArtifact,
  onOpenProjectLifecycle,
}: {
  item: EvidenceAttentionItem;
  pending: boolean;
  runPending: boolean;
  refreshPending: boolean;
  evidence: DashboardEvidencePayload | null;
  workspace?: EvidenceWorkspaceContext;
  onSelect?: () => void;
  onRunCommand?: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard?: (cardId: DashboardEvidenceCard['id']) => void;
  onAskStudio?: () => void;
  onSendToCopilot?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenProjectLifecycle?: () => void;
}) {
  const Icon = item.severity === 'fail' ? ShieldAlert : AlertTriangle;
  const freshness = resolveEvidenceFreshness(item.card);
  const actionContract = buildDashboardEvidenceActionContract(item.card, { evidence, workspace });
  const commandAction = actionContract.commandAction;
  const canRevealArtifact = Boolean(actionContract.artifactPath?.trim() && onRevealArtifact);
  const shouldExplainArtifact = !canRevealArtifact && actionContract.artifactState === 'pending';
  const projectAttribution = resolveEvidenceProjectAttribution(item.card, evidence);
  const pendingLabel = evidenceCardPendingLabel(
    item.card.id,
    runPending ? [item.card.id] : [],
    refreshPending ? [item.card.id] : []
  );
  const content = (
    <>
      <Icon size={14} aria-hidden="true" />
      <span className="evidence-attention-inbox__copy">
        <strong>{item.card.label}</strong>
        <small>{pendingLabel ? `${pendingLabel}…` : item.card.summary}</small>
        {commandAction ? (
          <small className="evidence-attention-inbox__next">Run: {commandAction.label}</small>
        ) : null}
        {projectAttribution ? (
          <small className="evidence-attention-inbox__project">
            Project · {projectAttribution.label}
          </small>
        ) : null}
        <small className="evidence-attention-inbox__trail">
          <span>{actionContract.commandLabel}</span>
          <span>{actionContract.artifactLabel}</span>
          <span>{actionContract.studioLabel}</span>
          <span>{actionContract.copilotLabel}</span>
        </small>
        {!pending && freshness.status === 'stale' ? (
          <small className={`evidence-freshness evidence-freshness--${freshness.status}`}>
            {freshness.label} · {freshness.detail}
          </small>
        ) : null}
      </span>
      <span className={`ws-chip ${item.severity === 'fail' ? 'ws-chip--error' : 'ws-chip--warn'}`}>
        {pendingLabel ?? evidenceCardStatusLabel(item.card)}
      </span>
    </>
  );
  return (
    <div
      className={`evidence-attention-inbox__item evidence-attention-inbox__item--${item.severity}${pending ? ' is-pending' : ''}`}
    >
      {onSelect ? (
        <button type="button" className="evidence-attention-inbox__main" onClick={onSelect}>
          {content}
        </button>
      ) : (
        <div className="evidence-attention-inbox__main evidence-attention-inbox__main--static">
          {content}
        </div>
      )}
      {onRunCommand ||
      onRefreshEvidenceCard ||
      canRevealArtifact ||
      shouldExplainArtifact ||
      onAskStudio ||
      onSendToCopilot ? (
        <div className="evidence-attention-inbox__actions">
          {commandAction && onRunCommand ? (
            <button
              type="button"
              className="ws-btn ws-btn--primary ws-btn--compact evidence-card-actions__run"
              onClick={() => onRunCommand(commandAction.command, commandAction.commandData)}
              disabled={pending}
              title={`Run ${commandAction.label}`}
            >
              <Play size={12} aria-hidden="true" />
              <span>{runPending ? 'Running…' : 'Run'}</span>
              <CommandExecutionBadge channel={actionContract.executionChannel} compact />
            </button>
          ) : null}
          {onRefreshEvidenceCard ? (
            <button
              type="button"
              className="ws-btn ws-btn--compact"
              onClick={() => onRefreshEvidenceCard(item.card.id)}
              disabled={pending}
              aria-busy={refreshPending || undefined}
              title={refreshPending ? 'Refreshing…' : 'Refresh this card from disk'}
            >
              <RefreshCw
                size={12}
                aria-hidden="true"
                className={refreshPending ? 'spinning' : undefined}
              />
              {refreshPending ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
          {canRevealArtifact ? (
            <button
              type="button"
              className="ws-btn ws-btn--compact"
              onClick={() =>
                actionContract.artifactPath && onRevealArtifact?.(actionContract.artifactPath)
              }
              disabled={pending}
              title={`Open ${actionContract.artifactLabel}`}
            >
              <FileSearch size={12} aria-hidden="true" />
              Artifact
            </button>
          ) : shouldExplainArtifact ? (
            <button
              type="button"
              className="ws-btn ws-btn--compact"
              disabled
              title="No evidence artifact exists yet. Run the mapped command or refresh this card."
            >
              <FileSearch size={12} aria-hidden="true" />
              No artifact
            </button>
          ) : null}
          {projectAttribution && onOpenProjectLifecycle ? (
            <button
              type="button"
              className="ws-btn ws-btn--compact"
              onClick={onOpenProjectLifecycle}
              disabled={pending}
              title={`Open Project lifecycle for ${projectAttribution.label}`}
            >
              Project
            </button>
          ) : null}
          {onAskStudio ? (
            <button
              type="button"
              className="ws-btn ws-btn--compact"
              onClick={onAskStudio}
              disabled={pending}
              title="Ask Studio about this evidence"
            >
              <Bot size={12} aria-hidden="true" />
              Studio
            </button>
          ) : null}
          {onSendToCopilot ? (
            <button
              type="button"
              className="ws-btn ws-btn--compact"
              onClick={onSendToCopilot}
              disabled={pending}
              title="Send evidence pack to Copilot with workspace path"
            >
              <Send size={12} aria-hidden="true" />
              Copilot
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EvidenceAttentionInbox({
  evidence,
  pendingCardIds = [],
  pendingRunCardIds = pendingCardIds,
  pendingRefreshCardIds = [],
  maxItems,
  showItemActions = true,
  workspace,
  onSelectCard,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onRevealArtifact,
  onOpenProjectLifecycle,
  onShowAll,
}: EvidenceAttentionInboxProps) {
  const items = buildEvidenceAttentionInbox(evidence);
  const buckets = countEvidenceAttentionBuckets(evidence);
  const visibleItems =
    typeof maxItems === 'number' && maxItems > 0 ? items.slice(0, maxItems) : items;
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  if (items.length === 0) {
    return (
      <section
        className="evidence-attention-inbox evidence-attention-inbox--clear"
        aria-label="Attention inbox"
      >
        <div className="evidence-attention-inbox__summary">
          <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--ok">
            {buckets.ok} healthy
          </span>
          <span className="ws-kicker">No blocked or warning evidence cards right now.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="evidence-attention-inbox" aria-label="Attention inbox">
      <div className="evidence-attention-inbox__summary">
        {buckets.blocked > 0 ? (
          <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--fail">
            {buckets.blocked} blocked
          </span>
        ) : null}
        {buckets.attention > 0 ? (
          <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--warn">
            {buckets.attention} attention
          </span>
        ) : null}
        {buckets.ok > 0 ? (
          <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--ok">
            {buckets.ok} ok
          </span>
        ) : null}
      </div>
      <div className="evidence-attention-inbox__list">
        {visibleItems.map((item) => (
          <AttentionRow
            key={`${item.card.scope}-${item.card.id}`}
            item={item}
            pending={pendingCardIds.includes(item.card.id)}
            runPending={pendingRunCardIds.includes(item.card.id)}
            refreshPending={pendingRefreshCardIds.includes(item.card.id)}
            evidence={evidence}
            workspace={workspace}
            onSelect={onSelectCard ? () => onSelectCard(item.card) : undefined}
            onRunCommand={showItemActions ? onRunCommand : undefined}
            onRefreshEvidenceCard={showItemActions ? onRefreshEvidenceCard : undefined}
            onAskStudio={
              showItemActions && onAskStudioAboutCard
                ? () => onAskStudioAboutCard(item.card)
                : undefined
            }
            onSendToCopilot={
              showItemActions && onSendEvidenceToCopilot
                ? () => onSendEvidenceToCopilot(item.card)
                : undefined
            }
            onRevealArtifact={showItemActions ? onRevealArtifact : undefined}
            onOpenProjectLifecycle={showItemActions ? onOpenProjectLifecycle : undefined}
          />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <div className="evidence-attention-inbox__footer">
          <span>
            {hiddenCount} more evidence item{hiddenCount === 1 ? '' : 's'} hidden
          </span>
          {onShowAll ? (
            <button type="button" className="ws-btn ws-btn--ghost" onClick={onShowAll}>
              View details
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
