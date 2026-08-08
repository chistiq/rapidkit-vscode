import {
  Bot,
  Check,
  Copy,
  FileSearch,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { type MouseEvent, useEffect, useRef } from 'react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardEvidence';
import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { CommandExecutionBadge } from '@/components/CommandExecutionBadge';
import type {
  DashboardEvidenceArtifactState,
  DashboardEvidencePrimaryAction,
} from '@/lib/dashboardActionContract';
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
  artifactState?: DashboardEvidenceArtifactState;
  compact?: boolean;
  onRun?: () => void;
  onRefresh?: (cardId: DashboardEvidenceCardId) => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onAdvancedInspect?: () => void;
  onAskStudio?: () => void;
  onSendToCopilot?: () => void;
  onCopyAgentHandoff?: () => void;
  studioVariant?: 'primary' | 'ghost';
  executionChannel?: DashboardCommandExecutionChannel;
  primaryAction?: DashboardEvidencePrimaryAction;
  copyCommandText?: string;
}

export function resolveVisiblePrimaryEvidenceAction(input: {
  primaryAction?: DashboardEvidencePrimaryAction;
  canRun: boolean;
  hasRunHandler: boolean;
  hasStudioHandler: boolean;
  showAgentActions: boolean;
  runLabel: string;
}): DashboardEvidencePrimaryAction | undefined {
  if (input.primaryAction?.type === 'done') {
    return input.primaryAction;
  }
  if (input.primaryAction?.type === 'run' && input.canRun && input.hasRunHandler) {
    return input.primaryAction;
  }
  if (input.primaryAction?.type === 'studio' && input.hasStudioHandler) {
    return input.primaryAction;
  }
  if (input.canRun && input.hasRunHandler) {
    return {
      type: 'run',
      label: input.primaryAction?.type === 'run' ? input.primaryAction.label : input.runLabel,
    };
  }
  if (input.showAgentActions && input.hasStudioHandler) {
    return {
      type: 'studio',
      label: input.primaryAction?.type === 'studio' ? input.primaryAction.label : 'Open in Studio',
    };
  }
  return undefined;
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
  onCopyAgentHandoff,
  executionChannel,
  primaryAction,
  copyCommandText,
}: EvidenceCardActionsProps) {
  const overflowRef = useRef<HTMLDetailsElement>(null);
  const isRefreshPending = refreshPending ?? pending;
  const isBusy = pending || isRefreshPending;
  const canRevealArtifact = Boolean(artifactPath?.trim() && onRevealArtifact);
  const hasRunHandler = canRun && Boolean(onRun);
  const hasStudioHandler = Boolean(onAskStudio);
  const artifactIsCorrupt = artifactState === 'corrupt';
  const shouldExplainArtifact = Boolean(artifactLabel && !canRevealArtifact);
  const resolvedPrimaryAction = resolveVisiblePrimaryEvidenceAction({
    primaryAction,
    canRun,
    hasRunHandler,
    hasStudioHandler,
    showAgentActions,
    runLabel,
  });
  // Compact evidence cards already carry a posture chip. Repeating a disabled
  // "Done" control on every healthy artifact adds noise without an action.
  const visiblePrimaryAction =
    compact && resolvedPrimaryAction?.type === 'done' ? undefined : resolvedPrimaryAction;
  const primaryType = visiblePrimaryAction?.type;
  const hasRunSecondary = canRun && onRun && primaryType !== 'run';
  const hasStudioSecondary = showAgentActions && onAskStudio && primaryType !== 'studio';
  const hasRefreshSecondary = canRefresh && Boolean(onRefresh);
  const hasArtifactSecondary = canRevealArtifact || shouldExplainArtifact;
  const hasCopyCommandSecondary = Boolean(copyCommandText?.trim());
  const hasCopyAgentHandoffSecondary = Boolean(onCopyAgentHandoff);
  const hasAdvancedInspectSecondary = Boolean(onAdvancedInspect);
  const hasCopilotSecondary = showAgentActions && Boolean(onSendToCopilot);
  const hasOverflow =
    hasRunSecondary ||
    hasRefreshSecondary ||
    hasArtifactSecondary ||
    hasCopyAgentHandoffSecondary ||
    hasCopyCommandSecondary ||
    hasAdvancedInspectSecondary ||
    hasStudioSecondary ||
    hasCopilotSecondary;

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const overflow = overflowRef.current;
      if (overflow?.open && event.target instanceof Node && !overflow.contains(event.target)) {
        overflow.open = false;
      }
    };
    const dismissWithEscape = (event: globalThis.KeyboardEvent) => {
      const overflow = overflowRef.current;
      if (event.key === 'Escape' && overflow?.open) {
        overflow.open = false;
        overflow.querySelector<HTMLElement>('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, []);

  const closeOverflowAfterAction = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) {
      overflowRef.current?.removeAttribute('open');
    }
  };

  if (
    !resolvedPrimaryAction &&
    !canRun &&
    !canRefresh &&
    !showAgentActions &&
    !canRevealArtifact &&
    !shouldExplainArtifact &&
    !onAdvancedInspect &&
    !onCopyAgentHandoff
  ) {
    return null;
  }

  return (
    <div
      className={`evidence-card-actions${compact ? ' evidence-card-actions--compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      {visiblePrimaryAction?.type === 'run' && canRun && onRun ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary evidence-card-actions__run"
          onClick={onRun}
          disabled={isBusy}
          aria-busy={pending || undefined}
          title={pending ? 'Running…' : visiblePrimaryAction.label}
        >
          <Play size={12} aria-hidden="true" />
          <span className="evidence-card-actions__run-label">
            {pending ? 'Running…' : visiblePrimaryAction.label}
          </span>
          <CommandExecutionBadge channel={executionChannel} compact />
        </button>
      ) : null}
      {visiblePrimaryAction?.type === 'studio' && onAskStudio ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary"
          onClick={onAskStudio}
          disabled={isBusy}
          title="Open Workspai Studio with this evidence context"
        >
          <Bot size={12} aria-hidden="true" />
          {visiblePrimaryAction.label}
        </button>
      ) : null}
      {visiblePrimaryAction?.type === 'done' ? (
        <button
          type="button"
          className="ws-btn ws-btn--primary evidence-card-actions__done"
          disabled
          title="This evidence card is passing"
        >
          <Check size={12} aria-hidden="true" />
          {visiblePrimaryAction.label}
        </button>
      ) : null}
      {hasOverflow ? (
        <details ref={overflowRef} className="evidence-card-actions__overflow">
          <summary className="ws-btn ws-btn--ghost evidence-card-actions__overflow-trigger">
            <MoreHorizontal size={13} aria-hidden="true" />
            <span>More</span>
          </summary>
          <div className="evidence-card-actions__menu" onClick={closeOverflowAfterAction}>
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
                title={`${artifactIsCorrupt ? 'Inspect corrupt' : 'Open'} ${
                  artifactLabel || 'evidence artifact'
                }`}
              >
                <FileSearch size={12} aria-hidden="true" />
                <span>
                  {compact
                    ? artifactIsCorrupt
                      ? 'Corrupt'
                      : 'Artifact'
                    : artifactLabel || 'Open artifact'}
                </span>
              </button>
            ) : shouldExplainArtifact ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                disabled
                title={
                  artifactState === 'pending'
                    ? 'No evidence artifact exists yet. Run the mapped command or refresh this card.'
                    : artifactState === 'corrupt'
                      ? 'Evidence artifact is corrupt. Repair evidence or inspect the artifact.'
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
            {hasCopyAgentHandoffSecondary ? (
              <button
                type="button"
                className="evidence-card-actions__menu-item"
                onClick={onCopyAgentHandoff}
                disabled={isBusy}
                title="Copy the complete evidence pack and fix request for an agent"
              >
                <Copy size={12} aria-hidden="true" />
                <span>Copy agent handoff</span>
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
                <span>Fix by Workspai</span>
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
