import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { SidebarStudioActionProgressView } from '@/lib/sidebarStudioActionProgress';
import { compactStudioPathText } from '@/lib/studioDisplayText';

type StudioActionProgressProps = {
  progress: SidebarStudioActionProgressView;
  repairBubble?: boolean;
  onNextAction?: (action: NonNullable<SidebarStudioActionProgressView['nextAction']>) => void;
};

const STATUS_COPY: Record<
  SidebarStudioActionProgressView['status'],
  { label: string; detail: string }
> = {
  running: {
    label: 'Working',
    detail: 'I am running the selected step and watching the result.',
  },
  review: {
    label: 'Approval needed',
    detail: 'Approve this step and I will continue the repair loop.',
  },
  done: {
    label: 'Step complete',
    detail: 'This step is complete. I refreshed the evidence and checked the card.',
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

export function StudioActionProgress({
  progress,
  repairBubble = false,
  onNextAction,
}: StudioActionProgressProps) {
  const copy = STATUS_COPY[progress.status];
  const summary = compactStudioPathText(progress.summary || copy.detail);
  const commandText = compactStudioPathText(progress.commandText);

  return (
    <div
      className={`${repairBubble ? 'ws-sidebar__repair-bubble ' : ''}ws-sidebar__studio-action-progress`}
      data-status={progress.status}
      role={progress.status === 'running' ? 'status' : 'note'}
      aria-live="polite"
    >
      <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
        {statusIcon(progress.status)}
      </span>
      <div className="ws-sidebar__studio-action-progress-copy">
        <small className="ws-sidebar__studio-action-progress-kicker">{copy.label}</small>
        <strong>{progress.title}</strong>
        <span>{summary}</span>
        {progress.commandText ? (
          <details className="ws-sidebar__studio-action-command">
            <summary>View command</summary>
            <code>{commandText}</code>
          </details>
        ) : null}
        {progress.nextAction && onNextAction ? (
          <button
            type="button"
            className="ws-sidebar__inline ws-sidebar__inline--primary"
            onClick={() => onNextAction(progress.nextAction as NonNullable<SidebarStudioActionProgressView['nextAction']>)}
          >
            {progress.nextActionLabel || 'Continue'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
