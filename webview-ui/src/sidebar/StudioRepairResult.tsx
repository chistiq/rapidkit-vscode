import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import type { SidebarStudioReturnState } from '@/lib/sidebarStudioReturnState';
import { compactStudioPathText } from '@/lib/studioDisplayText';
import {
  studioVerifyFailureSummary,
  type StudioVerifyFailureView,
} from '@/lib/studioVerifyFailure';

type StudioRepairResultProps = {
  returnState?: SidebarStudioReturnState | null;
  verifyFailure?: StudioVerifyFailureView | null;
  repairHold?: string | null;
  rollbackCommand?: string | null;
  onCopyRollback: () => void;
  onBackToDashboard?: () => void;
};

export function StudioRepairResult({
  returnState = null,
  verifyFailure = null,
  repairHold = null,
  rollbackCommand = null,
  onCopyRollback,
  onBackToDashboard,
}: StudioRepairResultProps) {
  if (!returnState && !verifyFailure && !repairHold && !rollbackCommand) {
    return null;
  }
  const returnDetail = compactStudioPathText(returnState?.detail);
  const failureSummary = compactStudioPathText(
    verifyFailure ? studioVerifyFailureSummary(verifyFailure) : null
  );
  const repairHoldDetail = compactStudioPathText(repairHold);
  const displayRollbackCommand = compactStudioPathText(rollbackCommand);

  return (
    <section className="ws-sidebar__repair-result" aria-label="Studio repair result">
      {returnState ? (
        <div
          className="ws-sidebar__repair-bubble ws-sidebar__repair-result-card"
          data-state={returnState.status}
          role={returnState.status === 'verified-refreshed' ? 'status' : 'alert'}
        >
          <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
            {returnState.status === 'verified-refreshed' ? (
              <CheckCircle2 size={14} strokeWidth={1.8} />
            ) : (
              <AlertTriangle size={14} strokeWidth={1.8} />
            )}
          </span>
          <div className="ws-sidebar__studio-action-progress-copy">
            <small className="ws-sidebar__studio-action-progress-kicker">
              {returnState.status === 'verified-refreshed' ? 'Fixed and verified' : 'Still working'}
            </small>
            <strong>{returnState.title}</strong>
            <span>{returnDetail}</span>
            {returnState.refreshedCardIds.length > 0 ? (
              <small>Refreshed {returnState.refreshedCardIds.join(', ')}</small>
            ) : null}
            {returnState.status === 'verified-refreshed' && onBackToDashboard ? (
              <button type="button" className="ws-sidebar__inline" onClick={onBackToDashboard}>
                Back to Dashboard
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {verifyFailure ? (
        <div
          className="ws-sidebar__repair-bubble ws-sidebar__repair-result-card"
          data-state="failed"
          role="alert"
        >
          <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
            <AlertTriangle size={14} strokeWidth={1.8} />
          </span>
          <div className="ws-sidebar__studio-action-progress-copy">
            <small className="ws-sidebar__studio-action-progress-kicker">Verify still failing</small>
            <strong>
              {verifyFailure.title ?? 'Studio is continuing the repair'}
              {typeof verifyFailure.exitCode === 'number' ? ` · exit ${verifyFailure.exitCode}` : ''}
            </strong>
            <span>{failureSummary}</span>
            {verifyFailure.nextAction ? (
              <small>
                {repairHoldDetail || 'Studio is continuing from the latest evidence.'}
              </small>
            ) : null}
          </div>
        </div>
      ) : null}

      {repairHold && !verifyFailure ? (
        <div
          className="ws-sidebar__repair-bubble ws-sidebar__repair-result-card"
          data-state="held"
          role="status"
        >
          <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
            <AlertTriangle size={14} strokeWidth={1.8} />
          </span>
          <div className="ws-sidebar__studio-action-progress-copy">
            <small className="ws-sidebar__studio-action-progress-kicker">Needs review</small>
            <strong>Studio paused safely</strong>
            <span>{repairHoldDetail}</span>
          </div>
        </div>
      ) : null}

      {rollbackCommand ? (
        <div className="ws-sidebar__repair-bubble ws-sidebar__repair-result-card" role="note">
          <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
            <RotateCcw size={14} strokeWidth={1.8} />
          </span>
          <div className="ws-sidebar__studio-action-progress-copy">
            <small className="ws-sidebar__studio-action-progress-kicker">Rollback ready</small>
            <strong>Rollback available</strong>
            <span>Use this only if you want to undo the applied change.</span>
            <details className="ws-sidebar__studio-action-command">
              <summary>Details</summary>
              <code>{displayRollbackCommand}</code>
            </details>
            <button type="button" className="ws-sidebar__inline" onClick={onCopyRollback}>
              Copy rollback
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
