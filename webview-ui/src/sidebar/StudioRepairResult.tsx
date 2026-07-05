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
  rollbackCommand?: string | null;
  onCopyRollback: () => void;
  onBackToDashboard?: () => void;
  onContinueRepair?: () => void;
};

function failureCanContinueRepair(failure: StudioVerifyFailureView): boolean {
  return (
    failure.action === 'auto-fix' ||
    failure.action === 'apply-patch' ||
    failure.action === 'apply-remediation-step' ||
    failure.action === 'run-remediation-command' ||
    failure.action === 'refresh-remediation-plan' ||
    failure.action === 'verify-handoff'
  );
}

export function StudioRepairResult({
  returnState = null,
  verifyFailure = null,
  rollbackCommand = null,
  onCopyRollback,
  onBackToDashboard,
  onContinueRepair,
}: StudioRepairResultProps) {
  if (!returnState && !verifyFailure && !rollbackCommand) {
    return null;
  }
  const returnDetail = compactStudioPathText(returnState?.detail);
  const failureSummary = compactStudioPathText(
    verifyFailure ? studioVerifyFailureSummary(verifyFailure) : null
  );
  const failureNextAction = compactStudioPathText(verifyFailure?.nextAction);
  const failureCommandText = compactStudioPathText(verifyFailure?.commandText);
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
              {returnState.status === 'verified-refreshed' ? 'Verified' : 'Next step'}
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
            {returnState.status === 'still-blocked' && onContinueRepair ? (
              <button type="button" className="ws-sidebar__inline" onClick={onContinueRepair}>
                Continue repair
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
            <small className="ws-sidebar__studio-action-progress-kicker">Needs next step</small>
            <strong>
              {verifyFailure.title ?? 'Studio action failed'}
              {typeof verifyFailure.exitCode === 'number' ? ` · exit ${verifyFailure.exitCode}` : ''}
            </strong>
            <span>{failureSummary}</span>
            {verifyFailure.nextAction ? <small>{failureNextAction}</small> : null}
            {onContinueRepair && failureCanContinueRepair(verifyFailure) ? (
              <button type="button" className="ws-sidebar__inline" onClick={onContinueRepair}>
                Continue repair
              </button>
            ) : null}
            {verifyFailure.commandText ? (
              <details className="ws-sidebar__studio-action-command">
                <summary>View command</summary>
                <code>{failureCommandText}</code>
              </details>
            ) : null}
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
              <summary>View command</summary>
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
