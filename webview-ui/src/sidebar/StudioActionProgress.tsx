import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { SidebarStudioActionProgressView } from '@/lib/sidebarStudioActionProgress';
import { compactStudioPathText } from '@/lib/studioDisplayText';

type StudioActionProgressProps = {
  progress: SidebarStudioActionProgressView;
  repairBubble?: boolean;
  historical?: boolean;
  onNextAction?: (action: NonNullable<SidebarStudioActionProgressView['nextAction']>) => void;
  onOpenFile?: (relativePath: string) => void;
  onOpenDiff?: (relativePath: string, transactionId: string) => void;
  onUndo?: (transactionId: string) => void;
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
  if (progress.transactionState === 'rolled-back') return 'Restored';
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
  onNextAction,
  onOpenFile,
  onOpenDiff,
  onUndo,
}: StudioActionProgressProps) {
  const automaticContinuation = Boolean(
    progress.status === 'review' &&
    progress.nextAction &&
    repairBubble &&
    !progress.requiresApproval
  );
  const copy = historical
    ? progress.status === 'failed'
      ? progress.transactionState === 'rolled-back'
        ? {
            label: 'Restored',
            detail: 'The previous edit did not close the finding, so the files were put back.',
          }
        : STATUS_COPY.failed
      : { label: completedActivityLabel(progress), detail: progress.summary }
    : automaticContinuation
      ? { label: 'Continuing automatically', detail: 'The next safe repair phase is starting.' }
      : progress.transactionState === 'rolled-back'
        ? {
            label: 'Restored',
            detail: 'The previous edit did not close the finding, so the files were put back.',
          }
        : STATUS_COPY[progress.status];
  const summary = compactStudioPathText(progress.summary || copy.detail);
  const hasNextAction = Boolean(progress.nextAction);
  const showManualNextAction = Boolean(
    hasNextAction && onNextAction && (!repairBubble || progress.requiresApproval) && !historical
  );
  const showAutomaticNextAction = Boolean(
    hasNextAction && repairBubble && !progress.requiresApproval && !historical
  );
  const transactionRestored = progress.transactionState === 'rolled-back';

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
            {progress.occurrences && progress.occurrences > 1
              ? `${progress.occurrences} attempts combined`
              : copy.label}
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
        {progress.commandText && !progress.policyRejected ? (
          <details className="ws-sidebar__studio-action-details">
            <summary>Command</summary>
            <pre className="ws-sidebar__studio-patch-diff" aria-label="Executed command">
              <span data-type="unchanged">$ {progress.commandText}</span>
            </pre>
          </details>
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
                    {stage.status === 'passed'
                      ? '✓'
                      : stage.status === 'failed' || stage.status === 'blocked'
                        ? '!'
                        : stage.status === 'running'
                          ? '•'
                          : '–'}
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
                const added = file.diffLines?.filter((line) => line.type === 'added').length ?? 0;
                const removed =
                  file.diffLines?.filter((line) => line.type === 'removed').length ?? 0;
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
                      <details className="ws-sidebar__studio-file-preview" open={!historical && progress.status !== 'running'}>
                        <summary>Diff</summary>
                        <pre
                          className="ws-sidebar__studio-patch-diff"
                          aria-label={`Diff for ${file.relativePath}`}
                        >
                          {file.diffLines.map((line, index) => (
                            <span key={`${line.type}-${index}`} data-type={line.type}>
                              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                              {line.content}
                            </span>
                          ))}
                        </pre>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        {progress.canUndo && progress.transactionId && onUndo ? (
          <button
            type="button"
            className="ws-sidebar__inline"
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
