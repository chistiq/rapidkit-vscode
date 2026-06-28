import { Bot, Check, Copy, FileSearch, MoreHorizontal, Play, RefreshCw, Search, Send } from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardEvidence';
import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { CommandExecutionBadge } from '@/components/CommandExecutionBadge';
import type { DashboardEvidencePrimaryAction } from '@/lib/dashboardActionContract';
import { copyTextWithBrowserFallback } from '@/lib/webviewClipboard';

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
  onAdvancedInspect?: () => void;
  onAskStudio?: () => void;
  onSendToCopilot?: () => void;
  studioVariant?: 'primary' | 'ghost';
  executionChannel?: DashboardCommandExecutionChannel;
  primaryAction?: DashboardEvidencePrimaryAction;
  copyCommandText?: string;
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
  onAdvancedInspect,
  onAskStudio,
  onSendToCopilot,
  executionChannel,
  primaryAction,
  copyCommandText,
}: EvidenceCardActionsProps) {
  const isRefreshPending = refreshPending ?? pending;
  const isBusy = pending || isRefreshPending;
  const canRevealArtifact = Boolean(artifactPath?.trim() && onRevealArtifact);
  const shouldExplainArtifact = Boolean(artifactLabel && !canRevealArtifact);
  const resolvedPrimaryAction =
    primaryAction ??
    (canRun
      ? ({ type: 'run', label: runLabel } as const)
      : showAgentActions && onAskStudio
        ? ({ type: 'studio', label: 'Open in Studio' } as const)
        : undefined);
  const primaryType = resolvedPrimaryAction?.type;
  const hasRunSecondary = canRun && onRun && primaryType !== 'run';
  const hasStudioSecondary = showAgentActions && onAskStudio && primaryType !== 'studio';
  const hasRefreshSecondary = canRefresh && Boolean(onRefresh);
  const hasArtifactSecondary = canRevealArtifact || shouldExplainArtifact;
  const hasCopyCommandSecondary = Boolean(copyCommandText?.trim());
  const hasAdvancedInspectSecondary = Boolean(onAdvancedInspect);
  const hasCopilotSecondary = showAgentActions && Boolean(onSendToCopilot);
  const hasOverflow =
    hasRunSecondary ||
    hasRefreshSecondary ||
    hasArtifactSecondary ||
    hasCopyCommandSecondary ||
    hasAdvancedInspectSecondary ||
    hasStudioSecondary ||
    hasCopilotSecondary;

  if (
    !resolvedPrimaryAction &&
    !canRun &&
    !canRefresh &&
    !showAgentActions &&
    !canRevealArtifact &&
    !shouldExplainArtifact
  ) {
    return null;
  }

  return (
    <div
      className={`evidence-card-actions${compact ? ' evidence-card-actions--compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      {resolvedPrimaryAction?.type === 'run' && canRun && onRun ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary evidence-card-actions__run"
          onClick={onRun}
          disabled={isBusy}
          aria-busy={pending || undefined}
          title={pending ? 'Running…' : resolvedPrimaryAction.label}
        >
          <Play size={12} aria-hidden="true" />
          <span className="evidence-card-actions__run-label">
            {pending ? 'Running…' : resolvedPrimaryAction.label}
          </span>
          <CommandExecutionBadge channel={executionChannel} compact />
        </button>
      ) : null}
      {resolvedPrimaryAction?.type === 'studio' && onAskStudio ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary"
          onClick={onAskStudio}
          disabled={isBusy}
          title="Open Workspai Studio with this evidence context"
        >
          <Bot size={12} aria-hidden="true" />
          {resolvedPrimaryAction.label}
        </button>
      ) : null}
      {resolvedPrimaryAction?.type === 'done' ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary evidence-card-actions__done"
          disabled
          title="This evidence card is passing"
        >
          <Check size={12} aria-hidden="true" />
          {resolvedPrimaryAction.label}
        </button>
      ) : null}
      {hasOverflow ? (
        <details className="evidence-card-actions__overflow">
          <summary className="ws-btn ws-btn--ghost evidence-card-actions__overflow-trigger">
            <MoreHorizontal size={13} aria-hidden="true" />
            <span>More</span>
          </summary>
          <div className="evidence-card-actions__menu">
            {hasRunSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={onRun}
                disabled={isBusy}
                aria-busy={pending || undefined}
                title={pending ? 'Running…' : runLabel}
              >
                <Play size={12} aria-hidden="true" />
                <span>{pending ? 'Running…' : runLabel}</span>
                <CommandExecutionBadge channel={executionChannel} compact />
              </button>
            ) : null}
            {hasRefreshSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={() => onRefresh?.(cardId)}
                disabled={isBusy}
                aria-busy={isRefreshPending || undefined}
                title={isRefreshPending ? 'Refreshing…' : 'Refresh this card from disk'}
              >
                <RefreshCw
                  size={12}
                  aria-hidden="true"
                  className={isRefreshPending ? 'spinning' : undefined}
                />
                <span>{isRefreshPending ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            ) : null}
            {canRevealArtifact ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={() => onRevealArtifact?.(artifactPath!)}
                disabled={isBusy}
                title={`Open ${artifactLabel || 'evidence artifact'}`}
              >
                <FileSearch size={12} aria-hidden="true" />
                <span>{compact ? 'Artifact' : artifactLabel || 'Open artifact'}</span>
              </button>
            ) : shouldExplainArtifact ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                disabled
                title={
                  artifactState === 'pending'
                    ? 'No evidence artifact exists yet. Run the mapped command or refresh this card.'
                    : 'Evidence artifact is unavailable for this card.'
                }
              >
                <FileSearch size={12} aria-hidden="true" />
                <span>{compact ? 'No artifact' : artifactLabel}</span>
              </button>
            ) : null}
            {hasCopyCommandSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={() => copyTextWithBrowserFallback(copyCommandText!.trim())}
                disabled={isBusy}
                title="Copy mapped dashboard command"
              >
                <Copy size={12} aria-hidden="true" />
                <span>Copy command</span>
              </button>
            ) : null}
            {hasAdvancedInspectSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={onAdvancedInspect}
                disabled={isBusy}
                title="Open the Workspai evidence output"
              >
                <Search size={12} aria-hidden="true" />
                <span>Advanced inspect</span>
              </button>
            ) : null}
            {hasStudioSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={onAskStudio}
                disabled={isBusy}
                title="Open Workspai Studio with this evidence context"
              >
                <Bot size={12} aria-hidden="true" />
                <span>Ask Studio</span>
              </button>
            ) : null}
            {hasCopilotSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={onSendToCopilot}
                disabled={isBusy}
                title="Send intelligence pack and blockers to Copilot Chat"
              >
                <Send size={12} aria-hidden="true" />
                <span>Send to Copilot</span>
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
