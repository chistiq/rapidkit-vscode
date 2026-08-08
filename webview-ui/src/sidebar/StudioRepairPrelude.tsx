import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

type StudioRepairPreludeProps = {
  handoff: StudioBlockerHandoffView;
  busy?: boolean;
  completed?: boolean;
  resumable?: boolean;
  reviewRequired?: boolean;
  terminalReason?: string;
  onReview?: () => void;
  onStart: () => void;
  onOpenSetup?: () => void;
  onStop: () => void;
};

export function StudioRepairPrelude({
  handoff,
  busy = false,
  completed = false,
  resumable = false,
  reviewRequired = false,
  terminalReason,
  onReview,
  onStart,
  onOpenSetup,
  onStop,
}: StudioRepairPreludeProps) {
  const scopeLabel = handoff.scope === 'project' ? 'Project evidence' : 'Workspace evidence';
  const connectionFailure = terminalReason === 'cli-repair-contract-mismatch';
  const status = completed
    ? 'Repair verified'
    : busy
      ? 'Studio is running'
      : reviewRequired
        ? 'Decision required'
        : connectionFailure
          ? 'CLI connection needed'
          : resumable
            ? 'Repair paused'
            : 'Repair ready';

  return (
    <section className="ws-sidebar__repair-prelude" aria-label="Studio repair startup">
      <div
        className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--intro"
        data-state={
          completed
            ? 'complete'
            : busy
              ? 'running'
              : reviewRequired
                ? 'review'
                : connectionFailure
                  ? 'connection'
                  : resumable
                    ? 'paused'
                    : 'ready'
        }
      >
        <div className="ws-sidebar__repair-copy">
          <strong>
            <span
              className="ws-sidebar__repair-live"
              data-running={busy ? 'true' : 'false'}
              aria-hidden="true"
            />
            {status}
          </strong>
          <span className="ws-sidebar__repair-meta">
            {connectionFailure
              ? 'Repair did not start · no files changed'
              : `${scopeLabel} · verification required`}
          </span>
          {reviewRequired ? (
            <>
              <p>
                Only a breaking, forced, or downgrade remediation remains. Studio will not continue
                without your decision.
              </p>
              {onReview ? (
                <div
                  className="ws-sidebar__repair-controls"
                  role="group"
                  aria-label="Studio engineering decision controls"
                >
                  <button type="button" className="ws-sidebar__inline" onClick={onReview}>
                    Review options
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {!completed && !reviewRequired ? (
            <div
              className="ws-sidebar__repair-controls"
              role="group"
              aria-label="Studio session controls"
            >
              {busy ? (
                <button type="button" className="ws-sidebar__inline" onClick={onStop}>
                  Stop session
                </button>
              ) : connectionFailure ? (
                <>
                  <button
                    type="button"
                    className="ws-sidebar__inline ws-sidebar__inline--primary"
                    onClick={onStart}
                  >
                    Retry connection
                  </button>
                  {onOpenSetup ? (
                    <button type="button" className="ws-sidebar__inline" onClick={onOpenSetup}>
                      Open setup
                    </button>
                  ) : null}
                </>
              ) : (
                <button type="button" className="ws-sidebar__inline" onClick={onStart}>
                  {resumable ? 'Resume repair' : 'Start repair'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
