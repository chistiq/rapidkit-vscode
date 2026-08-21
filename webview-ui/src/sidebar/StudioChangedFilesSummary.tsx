import { useState } from 'react';
import { FileDiff, Undo2 } from 'lucide-react';
import type { StudioChangedFilesSummary } from '@/lib/studioChangedFilesSummary';
import { compactStudioPathText } from '@/lib/studioDisplayText';

const COLLAPSED_FILE_LIMIT = 3;

type StudioChangedFilesSummaryProps = {
  summary: StudioChangedFilesSummary;
  busy?: boolean;
  onOpenDiff?: (relativePath: string, transactionId: string) => void;
  onReview?: () => void;
  onUndo?: (transactionId: string) => void;
};

/**
 * Session-level rollup of every file the agent changed.
 *
 * This is the durable answer to "what did you touch?": one aggregate count, a
 * per-file breakdown that opens an exact comparison, a review entry point for
 * the whole change set, and a revert bound to the owning CLI transaction.
 */
export function StudioChangedFilesSummary({
  summary,
  busy = false,
  onOpenDiff,
  onReview,
  onUndo,
}: StudioChangedFilesSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  if (summary.files.length === 0) {
    return null;
  }
  const hiddenCount = Math.max(0, summary.files.length - COLLAPSED_FILE_LIMIT);
  const visibleFiles = expanded ? summary.files : summary.files.slice(0, COLLAPSED_FILE_LIMIT);
  const comparableCount = summary.files.filter((file) => file.comparable).length;

  return (
    <section className="ws-sidebar__studio-changeset" aria-label="Files changed by the agent">
      <header className="ws-sidebar__studio-changeset-head">
        <span className="ws-sidebar__studio-changeset-icon" aria-hidden="true">
          <FileDiff size={14} strokeWidth={1.8} />
        </span>
        <div className="ws-sidebar__studio-changeset-title">
          <strong>
            Edited {summary.files.length} {summary.files.length === 1 ? 'file' : 'files'}
          </strong>
          <span className="ws-sidebar__studio-changeset-counts">
            <span data-kind="added">+{summary.addedLines}</span>
            <span data-kind="removed">-{summary.removedLines}</span>
          </span>
        </div>
        <div className="ws-sidebar__studio-changeset-actions">
          {summary.undoTransactionId && onUndo ? (
            <button
              type="button"
              className="ws-sidebar__studio-changeset-action"
              disabled={busy}
              onClick={() => onUndo(summary.undoTransactionId!)}
              title={
                summary.transactionCount > 1
                  ? 'Revert the most recent repair transaction in this session.'
                  : 'Revert this repair transaction and restore the original files.'
              }
            >
              Undo
              <Undo2 size={12} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
          {comparableCount > 0 && onReview ? (
            <button
              type="button"
              className="ws-sidebar__studio-changeset-action ws-sidebar__studio-changeset-action--primary"
              disabled={busy}
              onClick={onReview}
              title={`Open an exact comparison for ${comparableCount} changed ${
                comparableCount === 1 ? 'file' : 'files'
              }.`}
            >
              Review
            </button>
          ) : null}
        </div>
      </header>
      <ul className="ws-sidebar__studio-changeset-files">
        {visibleFiles.map((file) => (
          <li key={file.relativePath} data-status={file.status}>
            <button
              type="button"
              disabled={!file.comparable || !onOpenDiff}
              onClick={() => onOpenDiff?.(file.relativePath, file.transactionId)}
              title={
                file.failReason ??
                (file.comparable
                  ? `Compare ${file.relativePath}`
                  : `${file.relativePath} has no exact comparison`)
              }
            >
              <code>{compactStudioPathText(file.relativePath)}</code>
            </button>
            <span className="ws-sidebar__studio-changeset-counts">
              <span data-kind="added">+{file.added}</span>
              <span data-kind="removed">-{file.removed}</span>
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="ws-sidebar__studio-changeset-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? 'Show fewer files' : `Show ${hiddenCount} more files`}
        </button>
      ) : null}
    </section>
  );
}
