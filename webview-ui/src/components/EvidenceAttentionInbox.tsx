import { EvidencePostureIcon } from '@/components/EvidencePostureIcon';
import { EvidenceCardActions } from '@/components/EvidenceCardActions';
import { evidenceCardPendingLabel } from '@/lib/dashboardEvidencePending';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import {
  buildEvidenceAttentionInbox,
  countEvidenceAttentionBuckets,
  evidenceAttentionVisibleLimit,
  type EvidenceAttentionItem,
} from '@/lib/evidenceAgentContext';
import { evidenceCardStatusLabel } from '@/lib/dashboardEvidence';
import { resolveEvidenceFreshness } from '@/lib/dashboardEvidence';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import type { EvidenceWorkspaceContext } from '@/lib/dashboardEvidenceDirectRun';
import { resolveEvidenceProjectAttribution } from '@/lib/dashboardEvidenceProjectAttribution';
import { buildDashboardRepairCardCopy } from '@/lib/dashboardRepairCardCopy';
import {
  effectiveCardBlockers,
  resolveWorkspaceProjectCountFromEvidence,
} from '@/lib/dashboardScaffoldEvidence';

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
  onCopyEvidenceAgentHandoff?: (card: DashboardEvidenceCard) => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenProjectLifecycle?: () => void;
  onShowAll?: () => void;
}

function EvidenceBucketSummary({
  buckets,
}: {
  buckets: ReturnType<typeof countEvidenceAttentionBuckets>;
}) {
  return (
    <>
      <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--fail">
        {buckets.blocked} blocked
      </span>
      <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--warn">
        {buckets.attention} attention
      </span>
      <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--missing">
        {buckets.missing} missing
      </span>
      <span className="evidence-attention-inbox__metric evidence-attention-inbox__metric--ok">
        {buckets.ok} ok
      </span>
    </>
  );
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
  onCopyAgentHandoff,
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
  onCopyAgentHandoff?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenProjectLifecycle?: () => void;
}) {
  const posture = item.severity === 'fail' ? 'blocked' : 'attention';
  const freshness = resolveEvidenceFreshness(item.card);
  const actionContract = buildDashboardEvidenceActionContract(item.card, { evidence, workspace });
  const commandAction = actionContract.commandAction;
  const workspaceProjectCount = resolveWorkspaceProjectCountFromEvidence(evidence);
  const copy = buildDashboardRepairCardCopy({
    card: item.card,
    blockers: effectiveCardBlockers(item.card, workspaceProjectCount),
    actionLabel: actionContract.commandLabel,
    blocking: item.severity === 'fail',
  });
  const projectAttribution = resolveEvidenceProjectAttribution(item.card, evidence);
  const pendingLabel = evidenceCardPendingLabel(
    item.card.id,
    runPending ? [item.card.id] : [],
    refreshPending ? [item.card.id] : []
  );
  const content = (
    <>
      <EvidencePostureIcon posture={posture} size={20} />
      <span className="evidence-attention-inbox__copy">
        <strong>{item.card.label}</strong>
        <small>{pendingLabel ? `${pendingLabel}…` : copy.issue}</small>
        {!pendingLabel ? <small>{copy.guidance}</small> : null}
        {commandAction ? (
          <small className="evidence-attention-inbox__next">Run: {commandAction.label}</small>
        ) : null}
        {projectAttribution ? (
          <small className="evidence-attention-inbox__project">
            Project · {projectAttribution.label}
          </small>
        ) : null}
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
      actionContract.artifactPath ||
      onAskStudio ||
      onSendToCopilot ? (
        <div className="evidence-attention-inbox__actions">
          <EvidenceCardActions
            cardId={item.card.id}
            runLabel={actionContract.commandLabel}
            pending={runPending || pending}
            refreshPending={refreshPending}
            canRun={Boolean(commandAction && onRunCommand)}
            canRefresh={Boolean(onRefreshEvidenceCard)}
            showAgentActions
            compact
            studioVariant="ghost"
            primaryAction={actionContract.primaryAction}
            copyCommandText={commandAction?.command}
            artifactLabel={actionContract.artifactLabel}
            artifactPath={actionContract.artifactPath}
            artifactState={actionContract.artifactState}
            executionChannel={actionContract.executionChannel}
            onRun={
              commandAction && onRunCommand
                ? () => onRunCommand(commandAction.command, commandAction.commandData)
                : undefined
            }
            onRefresh={onRefreshEvidenceCard}
            onRevealArtifact={onRevealArtifact}
            onAskStudio={onAskStudio}
            onSendToCopilot={onSendToCopilot}
            onCopyAgentHandoff={onCopyAgentHandoff}
          />
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
  onCopyEvidenceAgentHandoff,
  onRevealArtifact,
  onOpenProjectLifecycle,
  onShowAll,
}: EvidenceAttentionInboxProps) {
  const items = buildEvidenceAttentionInbox(evidence);
  const buckets = countEvidenceAttentionBuckets(evidence);
  const visibleLimit = evidenceAttentionVisibleLimit(items.length, buckets.blocked, maxItems);
  const visibleItems = visibleLimit < items.length ? items.slice(0, visibleLimit) : items;
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  if (items.length === 0) {
    return (
      <section
        className="evidence-attention-inbox evidence-attention-inbox--clear"
        aria-label="Attention inbox"
      >
        <div className="evidence-attention-inbox__summary">
          <EvidenceBucketSummary buckets={buckets} />
          <span className="ws-kicker">No blocked or warning evidence cards right now.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="evidence-attention-inbox" aria-label="Attention inbox">
      <div className="evidence-attention-inbox__summary">
        <EvidenceBucketSummary buckets={buckets} />
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
            onCopyAgentHandoff={
              showItemActions && onCopyEvidenceAgentHandoff
                ? () => onCopyEvidenceAgentHandoff(item.card)
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
