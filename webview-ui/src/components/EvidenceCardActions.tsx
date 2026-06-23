import { Bot, FileSearch, Play, RefreshCw, Send } from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardEvidence';
import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { CommandExecutionBadge } from '@/components/CommandExecutionBadge';

interface EvidenceCardActionsProps {
  cardId: DashboardEvidenceCardId;
  runLabel?: string;
  pending?: boolean;
  refreshPending?: boolean;
  canRun?: boolean;
  canRefresh?: boolean;
  showAgentActions?: boolean;
  artifactLabel?: string;
  artifactPath?: string;
  artifactState?: 'ready' | 'pending';
  compact?: boolean;
  onRun?: () => void;
  onRefresh?: (cardId: DashboardEvidenceCardId) => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onAskStudio?: () => void;
  onSendToCopilot?: () => void;
  studioVariant?: 'primary' | 'ghost';
  executionChannel?: DashboardCommandExecutionChannel;
}

export function EvidenceCardActions({
  cardId,
  runLabel = 'Run',
  pending = false,
  refreshPending,
  canRun = false,
  canRefresh = true,
  showAgentActions = false,
  artifactLabel,
  artifactPath,
  artifactState = artifactPath ? 'ready' : 'pending',
  compact = false,
  onRun,
  onRefresh,
  onRevealArtifact,
  onAskStudio,
  onSendToCopilot,
  studioVariant = 'primary',
  executionChannel,
}: EvidenceCardActionsProps) {
  const isRefreshPending = refreshPending ?? pending;
  const isBusy = pending || isRefreshPending;
  const canRevealArtifact = Boolean(artifactPath?.trim() && onRevealArtifact);
  const shouldExplainArtifact = Boolean(artifactLabel && !canRevealArtifact);

  if (!canRun && !canRefresh && !showAgentActions && !canRevealArtifact && !shouldExplainArtifact) {
    return null;
  }

  return (
    <div
      className={`evidence-card-actions${compact ? ' evidence-card-actions--compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      {canRun && onRun ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary evidence-card-actions__run"
          onClick={onRun}
          disabled={isBusy}
          aria-busy={pending || undefined}
          title={pending ? 'Running…' : runLabel}
        >
          <Play size={12} aria-hidden="true" />
          <span className="evidence-card-actions__run-label">
            {pending ? 'Running…' : runLabel}
          </span>
          <CommandExecutionBadge channel={executionChannel} compact />
        </button>
      ) : null}
      {canRefresh && onRefresh ? (
        <button
          type="button"
          className="ws-btn ws-btn--ghost"
          onClick={() => onRefresh(cardId)}
          disabled={isBusy}
          aria-busy={isRefreshPending || undefined}
          title={isRefreshPending ? 'Refreshing…' : 'Refresh this card from disk'}
        >
          <RefreshCw
            size={12}
            aria-hidden="true"
            className={isRefreshPending ? 'spinning' : undefined}
          />
          {isRefreshPending ? 'Refreshing…' : 'Refresh'}
        </button>
      ) : null}
      {canRevealArtifact ? (
        <button
          type="button"
          className="ws-btn ws-btn--ghost"
          onClick={() => onRevealArtifact?.(artifactPath!)}
          disabled={isBusy}
          title={`Open ${artifactLabel || 'evidence artifact'}`}
        >
          <FileSearch size={12} aria-hidden="true" />
          {compact ? 'Artifact' : artifactLabel || 'Open artifact'}
        </button>
      ) : shouldExplainArtifact ? (
        <button
          type="button"
          className="ws-btn ws-btn--ghost"
          disabled
          title={
            artifactState === 'pending'
              ? 'No evidence artifact exists yet. Run the mapped command or refresh this card.'
              : 'Evidence artifact is unavailable for this card.'
          }
        >
          <FileSearch size={12} aria-hidden="true" />
          {compact ? 'No artifact' : artifactLabel}
        </button>
      ) : null}
      {showAgentActions && onAskStudio ? (
        <button
          type="button"
          className={studioVariant === 'primary' ? 'ws-btn ws-btn--primary' : 'ws-btn ws-btn--ghost'}
          onClick={onAskStudio}
          disabled={isBusy}
          title="Open Workspai Studio with this evidence context"
        >
          <Bot size={12} aria-hidden="true" />
          Ask Studio
        </button>
      ) : null}
      {showAgentActions && onSendToCopilot ? (
        <button
          type="button"
          className="ws-btn"
          onClick={onSendToCopilot}
          disabled={isBusy}
          title="Send intelligence pack and blockers to Copilot Chat"
        >
          <Send size={12} aria-hidden="true" />
          Send to Copilot
        </button>
      ) : null}
    </div>
  );
}
