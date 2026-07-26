import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { SidebarStudioActionProgressView } from '@/lib/sidebarStudioActionProgress';
import { compactStudioPathText } from '@/lib/studioDisplayText';

type StudioActionProgressProps = {
  progress: SidebarStudioActionProgressView;
  repairBubble?: boolean;
  historical?: boolean;
  onNextAction?: (action: NonNullable<SidebarStudioActionProgressView['nextAction']>) => void;
  onOpenFile?: (relativePath: string) => void;
  onUndo?: (transactionId: string) => void;
};

const STATUS_COPY: Record<
  SidebarStudioActionProgressView['status'],
  { label: string; detail: string }
> = {
  running: {
    label: 'Live repair',
    detail: 'I am applying the repair path and watching the result.',
  },
  review: {
    label: 'Needs approval',
    detail: 'I found a guarded change. Approve it and I will continue.',
  },
  done: {
    label: 'Verified step',
    detail: 'I checked the result and refreshed the card evidence.',
  },
};

function statusIcon(status: SidebarStudioActionProgressView['status']) {
  if (status === 'done') {
    return <CheckCircle2 size={14} strokeWidth={1.8} />;
  }
  if (status === 'review') {
    return <AlertTriangle size={14} strokeWidth={1.8} />;
  }
  return <Loader2 size={14} strokeWidth={1.8} />;
}

function completedActivityLabel(progress: SidebarStudioActionProgressView): string {
  const phase = progress.phase ?? progress.action;
  if (
    progress.action === 'run-governed-command' ||
    /evidence|agent-sync|intelligence-chain/i.test(phase)
  ) {
    return 'Evidence refreshed';
  }
  if (/verif|readiness|contract/i.test(phase)) return 'Verified';
  if (
    progress.changedPaths?.length ||
    /appl(?:y|ied)|patch|source-change|dependency-(?:repair|upgrade)/i.test(phase)
  ) {
    return 'Changed';
  }
  if (/resolv|complete|done/i.test(phase)) return 'Resolved';
  return 'Inspected';
}

export function StudioActionProgress({
  progress,
  repairBubble = false,
  historical = false,
  onNextAction,
  onOpenFile,
  onUndo,
}: StudioActionProgressProps) {
  const automaticContinuation = Boolean(
    progress.status === 'review' &&
    progress.nextAction &&
    repairBubble &&
    !progress.requiresApproval
  );
  const copy = historical
    ? { label: completedActivityLabel(progress), detail: progress.summary }
    : automaticContinuation
      ? { label: 'Continuing automatically', detail: 'The next safe repair phase is starting.' }
      : STATUS_COPY[progress.status];
  const summary = compactStudioPathText(progress.summary || copy.detail);
  const hasNextAction = Boolean(progress.nextAction);
  const showManualNextAction = Boolean(
    hasNextAction && onNextAction && (!repairBubble || progress.requiresApproval) && !historical
  );
  const showAutomaticNextAction = Boolean(
    hasNextAction && repairBubble && !progress.requiresApproval && !historical
  );

  return (
    <div
      className={`${repairBubble ? 'ws-sidebar__repair-bubble ' : ''}${historical ? 'ws-sidebar__studio-action-progress--historical ' : ''}ws-sidebar__studio-action-progress`}
      data-status={progress.status}
      role={progress.status === 'running' || automaticContinuation ? 'status' : 'note'}
      aria-live="polite"
    >
      <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
        {historical ? <CheckCircle2 size={14} strokeWidth={1.8} /> : statusIcon(progress.status)}
      </span>
      <div className="ws-sidebar__studio-action-progress-copy">
        <strong>{historical ? copy.label : progress.title}</strong>
        {!historical && progress.status === 'running' ? <span>{summary}</span> : null}
        {!historical && progress.status !== 'running' && summary ? (
          <details className="ws-sidebar__studio-action-details">
            <summary>{copy.label}</summary>
            <span>{summary}</span>
          </details>
        ) : null}
        {progress.changedPaths?.length ? (
          <ul className="ws-sidebar__studio-changed-files" aria-label="Changed files">
            {progress.changedPaths.map((changedPath) => (
              <li key={changedPath}>
                {onOpenFile ? (
                  <button type="button" onClick={() => onOpenFile(changedPath)} title={changedPath}>
                    <code>{compactStudioPathText(changedPath)}</code>
                  </button>
                ) : (
                  <code title={changedPath}>{compactStudioPathText(changedPath)}</code>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {progress.canUndo && progress.invocationId && onUndo ? (
          <button
            type="button"
            className="ws-sidebar__inline"
            onClick={() => onUndo(progress.invocationId!)}
          >
            Undo
          </button>
        ) : null}
        {showAutomaticNextAction ? (
          <small>Studio will continue from this evidence automatically.</small>
        ) : null}
        {showManualNextAction ? (
          <button
            type="button"
            className="ws-sidebar__inline ws-sidebar__inline--primary"
            onClick={() =>
              onNextAction?.(
                progress.nextAction as NonNullable<SidebarStudioActionProgressView['nextAction']>
              )
            }
          >
            {progress.nextActionLabel || 'Continue'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
