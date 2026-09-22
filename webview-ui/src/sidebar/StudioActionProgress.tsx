import { AlertTriangle, CheckCircle2, Circle, Loader2, Minus } from 'lucide-react';
import {
  studioFileChangeLineCounts,
  type SidebarStudioApprovalRequestView,
  type SidebarStudioActionProgressView,
} from '@/lib/sidebarStudioActionProgress';
import { compactStudioPathText } from '@/lib/studioDisplayText';
import {
  studioHistoricalActivityLabel,
  studioHistoricalOutcomeStatus,
  studioTimelineOccurrenceLabel,
} from '@/lib/studioRepairTimeline';
import { StudioDiffView } from './StudioDiffView';

type StudioActionProgressProps = {
  progress: SidebarStudioActionProgressView;
  repairBubble?: boolean;
  historical?: boolean;
  busy?: boolean;
  onNextAction?: (action: NonNullable<SidebarStudioActionProgressView['nextAction']>) => void;
  onOpenFile?: (relativePath: string) => void;
  onOpenDiff?: (relativePath: string, transactionId: string) => void;
  onUndo?: (transactionId: string) => void;
  onApprovalDecision?: (
    request: SidebarStudioApprovalRequestView,
    execution: 'once' | 'session' | 'project' | undefined
  ) => void;
};

const STATUS_COPY: Record<
  SidebarStudioActionProgressView['status'],
  { label: string; detail: string }
> = {
  running: {
    label: 'Working',
    detail: 'Applying the change and watching the result.',
  },
  review: {
    label: 'Approval needed',
    detail: 'A guarded change is waiting for approval.',
  },
  done: {
    label: 'Completed',
    detail: 'This step finished. Verification still has to close the incident.',
  },
  failed: {
    label: 'Stopped',
    detail: 'This step did not finish. A recoverable checkpoint remains.',
  },
};

function statusIcon(status: SidebarStudioActionProgressView['status']) {
  if (status === 'done') {
    return <CheckCircle2 size={14} strokeWidth={1.8} />;
  }
  if (status === 'review' || status === 'failed') {
    return <AlertTriangle size={14} strokeWidth={1.8} />;
  }
  return <Loader2 size={14} strokeWidth={1.8} />;
}

function completedActivityLabel(progress: SidebarStudioActionProgressView): string {
  return studioTimelineOccurrenceLabel(progress) ?? studioHistoricalActivityLabel(progress);
}

function validationStageLabel(stage: { id: string; kind: string }): string {
  if (stage.id === 'target-precondition') return 'Target recheck';
  if (stage.id === 'target-producer-verify') return 'Card evidence';
  if (stage.id === 'canonical-verify') return 'Workspace verify';
  return stage.kind.charAt(0).toUpperCase() + stage.kind.slice(1);
}

export function StudioActionProgress({
  progress,
  repairBubble = false,
  historical = false,
  busy = false,
  onNextAction,
  onOpenFile,
  onOpenDiff,
  onUndo,
  onApprovalDecision,
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
      : progress.transactionState === 'rolled-back'
        ? {
            label: 'Restored',
            detail: 'The previous edit did not close the finding, so the files were put back.',
          }
        : progress.status === 'running' || progress.terminalReason
          ? STATUS_COPY[progress.status]
          : {
              label: completedActivityLabel(progress),
              detail: progress.summary || STATUS_COPY[progress.status].detail,
            };
  const summary = compactStudioPathText(progress.summary || copy.detail);
  const hasNextAction = Boolean(progress.nextAction);
  const showManualNextAction = Boolean(
    hasNextAction && onNextAction && (!repairBubble || progress.requiresApproval) && !historical
  );
  const showAutomaticNextAction = Boolean(
    hasNextAction && repairBubble && !progress.requiresApproval && !historical
  );
  const transactionRestored = progress.transactionState === 'rolled-back';
  const historicalStatus = studioHistoricalOutcomeStatus(progress);

  if (historical) {
    return (
      <div className="ws-sidebar__studio-history-row" data-status={historicalStatus} role="listitem">
        <span aria-hidden="true">{statusIcon(historicalStatus)}</span>
        <strong>{progress.title}</strong>
        <small>{copy.label}</small>
      </div>
    );
  }

  return (
    <div
      className={`${repairBubble ? 'ws-sidebar__repair-bubble ' : ''}${historical ? 'ws-sidebar__studio-action-progress--historical ' : ''}ws-sidebar__studio-action-progress`}
      data-status={progress.status}
      data-terminal={progress.terminalReason ? 'true' : 'false'}
      role={progress.status === 'running' || automaticContinuation ? 'status' : 'note'}
      aria-live="polite"
    >
      <span className="ws-sidebar__studio-action-progress-icon" aria-hidden="true">
        {historical && progress.status === 'done' ? (
          <CheckCircle2 size={14} strokeWidth={1.8} />
        ) : (
          statusIcon(progress.status)
        )}
      </span>
      <div className="ws-sidebar__studio-action-progress-copy">
        <div className="ws-sidebar__studio-action-progress-head">
          <strong>{progress.title}</strong>
          <small data-status={progress.status}>
            {studioTimelineOccurrenceLabel(progress) ?? copy.label}
          </small>
        </div>
        {summary && (historical || progress.status !== 'running') ? (
          <p className="ws-sidebar__studio-action-summary">{summary}</p>
        ) : null}
        {progress.technicalDetail ? (
          <details className="ws-sidebar__studio-action-details">
            <summary>Technical details</summary>
            <pre className="ws-sidebar__studio-patch-diff">
              <span data-type="unchanged">{progress.technicalDetail}</span>
            </pre>
          </details>
        ) : null}
        {progress.commandText && !progress.policyRejected && !progress.approvalRequest ? (
          <details className="ws-sidebar__studio-action-details">
            <summary>Command</summary>
            <pre className="ws-sidebar__studio-patch-diff" aria-label="Executed command">
              <span data-type="unchanged">$ {progress.commandText}</span>
            </pre>
          </details>
        ) : null}
        {progress.approvalRequest && onApprovalDecision && !historical ? (
          <section className="ws-sidebar__studio-approval" aria-label="Command approval">
            <div className="ws-sidebar__studio-approval-command">
              <code title={progress.approvalRequest.command}>
                {progress.approvalRequest.commandLabel}
              </code>
              <span>{progress.approvalRequest.scope}</span>
            </div>
            <p>{progress.approvalRequest.summary}</p>
            <div className="ws-sidebar__studio-approval-actions">
              {progress.approvalRequest.allowedExecutions.includes('once') ? (
                <button
                  type="button"
                  className="ws-sidebar__inline ws-sidebar__inline--primary"
                  onClick={() => onApprovalDecision(progress.approvalRequest!, 'once')}
                >
                  Run once
                </button>
              ) : null}
              {progress.approvalRequest.allowedExecutions.includes('session') ? (
                <button
                  type="button"
                  className="ws-sidebar__inline"
                  onClick={() => onApprovalDecision(progress.approvalRequest!, 'session')}
                >
                  Allow for session
                </button>
              ) : null}
              {progress.approvalRequest.allowedExecutions.includes('project') ? (
                <button
                  type="button"
                  className="ws-sidebar__inline"
                  onClick={() => onApprovalDecision(progress.approvalRequest!, 'project')}
                >
                  Trust for project
                </button>
              ) : null}
              <button
                type="button"
                className="ws-sidebar__inline"
                onClick={() => onApprovalDecision(progress.approvalRequest!, undefined)}
              >
                Cancel
              </button>
            </div>
            <details className="ws-sidebar__studio-action-details">
              <summary>Why this needs approval</summary>
              <div className="ws-sidebar__studio-approval-detail">
                {progress.approvalRequest.modelReason ? (
                  <p>{progress.approvalRequest.modelReason}</p>
                ) : null}
                {progress.approvalRequest.reasons.length ? (
                  <ul>
                    {progress.approvalRequest.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {progress.approvalRequest.cwd ? (
                  <small>Working directory: {progress.approvalRequest.cwd}</small>
                ) : null}
                {progress.approvalRequest.commandLabel !== progress.approvalRequest.command ? (
                  <small>Exact action: {progress.approvalRequest.command}</small>
                ) : null}
                <small title={progress.approvalRequest.fingerprint}>
                  Exact request: {progress.approvalRequest.fingerprint.slice(0, 12)}…
                </small>
                <small>
                  Approval stays bound to this exact request. Shell escalation, secret forwarding,
                  and workspace escapes remain blocked.
                </small>
              </div>
            </details>
          </section>
        ) : null}
        {progress.activityPaths?.length ? (
          <ul className="ws-sidebar__studio-changed-files" aria-label="Inspected files">
            {progress.activityPaths.map((activityPath) => (
              <li key={activityPath}>
                <button type="button" onClick={() => onOpenFile?.(activityPath)}>
                  <code>{compactStudioPathText(activityPath)}</code>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {progress.outputText ? (
          <details className="ws-sidebar__studio-action-details">
            <summary>Command output</summary>
            <pre className="ws-sidebar__studio-patch-diff">
              <span data-type="unchanged">{progress.outputText}</span>
            </pre>
          </details>
        ) : null}
        {progress.validationStages?.length ? (
          <details
            className="ws-sidebar__studio-validation"
            open={!historical && progress.status !== 'done'}
          >
            <summary>Validation</summary>
            <ol>
              {progress.validationStages.map((stage) => (
                <li key={stage.id} data-status={stage.status}>
                  <span aria-hidden="true">
                    {stage.status === 'passed' ? (
                      <CheckCircle2 size={12} strokeWidth={1.9} />
                    ) : stage.status === 'failed' || stage.status === 'blocked' ? (
                      <AlertTriangle size={12} strokeWidth={1.9} />
                    ) : stage.status === 'running' ? (
                      <Circle size={12} strokeWidth={1.9} />
                    ) : (
                      <Minus size={12} strokeWidth={1.9} />
                    )}
                  </span>
                  <div>
                    <strong>{validationStageLabel(stage)}</strong>
                    <small>{stage.summary}</small>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        {progress.changedPaths?.length && !progress.fileChanges?.length ? (
          <ul
            className="ws-sidebar__studio-changed-files"
            aria-label={transactionRestored ? 'Restored files' : 'Changed files'}
          >
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
        {progress.fileChanges?.length ? (
          <section
            className="ws-sidebar__studio-file-changes"
            aria-label={transactionRestored ? 'Files restored' : 'Files changed'}
          >
            <header>
              <strong>{transactionRestored ? 'Files restored' : 'Files changed'}</strong>
              <small>{progress.fileChanges.length}</small>
            </header>
            <ul className="ws-sidebar__studio-patch-list">
              {progress.fileChanges.map((file) => {
                const { added, removed } = studioFileChangeLineCounts(file);
                const exactDiffAvailable =
                  Boolean(progress.transactionId && onOpenDiff) &&
                  file.stale !== true &&
                  file.binary !== true &&
                  !file.failReason;
                return (
                  <li key={file.relativePath} data-status={file.status}>
                    <div className="ws-sidebar__studio-patch-summary">
                      <button
                        type="button"
                        onClick={() => onOpenFile?.(file.relativePath)}
                        title={file.failReason || file.relativePath}
                      >
                        <code>{compactStudioPathText(file.relativePath)}</code>
                      </button>
                      {!transactionRestored ? (
                        <span>
                          +{added} −{removed}
                        </span>
                      ) : null}
                      {exactDiffAvailable ? (
                        <button
                          type="button"
                          className="ws-sidebar__studio-diff-button"
                          onClick={() => onOpenDiff!(file.relativePath, progress.transactionId!)}
                          title={`Compare ${file.relativePath}`}
                        >
                          Compare
                        </button>
                      ) : null}
                    </div>
                    {file.failReason ? <small>{file.failReason}</small> : null}
                    {file.stale !== true && file.diffLines?.length ? (
                      <details
                        className="ws-sidebar__studio-file-preview"
                        open={!historical && progress.status !== 'running'}
                      >
                        <summary>Preview</summary>
                        <StudioDiffView
                          lines={file.diffLines}
                          label={`Diff for ${file.relativePath}`}
                        />
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        {progress.canUndo && progress.transactionId && onUndo && !historical ? (
          <button
            type="button"
            className="ws-sidebar__inline"
            disabled={busy}
            onClick={() => onUndo(progress.transactionId!)}
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
