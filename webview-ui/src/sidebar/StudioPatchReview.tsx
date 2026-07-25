import { useMemo, useState } from 'react';
import { compactStudioPathText } from '@/lib/studioDisplayText';

export type SidebarPatchReviewItem = {
  relativePath: string;
  status: string;
  isNewFile?: boolean;
  failReason?: string;
  diffLines?: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string }>;
};

type StudioPatchReviewProps = {
  summary?: string;
  riskSummary?: string;
  patches: SidebarPatchReviewItem[];
  busy?: boolean;
  onApply: (acceptedPaths: string[]) => void;
  onReject: () => void;
};

export function StudioPatchReview({
  summary,
  riskSummary,
  patches,
  busy = false,
  onApply,
  onReject,
}: StudioPatchReviewProps) {
  const selectablePaths = useMemo(
    () => patches.filter((patch) => patch.status !== 'applied').map((patch) => patch.relativePath),
    [patches]
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(selectablePaths)
  );

  const togglePath = (relativePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  };

  if (patches.length === 0) {
    return null;
  }
  const selectedCount = selected.size;
  const appliedCount = patches.filter((patch) => patch.status === 'applied').length;
  const failedCount = patches.filter((patch) => patch.failReason).length;

  return (
    <div
      className="ws-sidebar__repair-bubble ws-sidebar__studio-patch-review"
      role="region"
      aria-label="Patch review"
    >
      <div className="ws-sidebar__studio-action-progress-copy">
        <small className="ws-sidebar__studio-action-progress-kicker">Approval needed</small>
        <strong>Studio found file changes</strong>
        <span>
          {summary ||
            `${patches.length} file change${patches.length === 1 ? '' : 's'} extracted from the AI repair answer.`}
        </span>
        {riskSummary ? <span className="ws-sidebar__studio-patch-risk">{riskSummary}</span> : null}
        <div className="ws-sidebar__studio-patch-summary" aria-label="Patch summary">
          <span>{selectedCount} selected</span>
          <span>{appliedCount} applied</span>
          <span>{failedCount} blocked</span>
        </div>

        <div className="ws-sidebar__studio-cta">
          <button
            type="button"
            className="ws-sidebar__inline ws-sidebar__inline--primary"
            disabled={busy || selected.size === 0}
            onClick={() => onApply([...selected])}
          >
            {busy ? 'Applying…' : 'Apply selected changes'}
          </button>
          <button type="button" className="ws-sidebar__inline" disabled={busy} onClick={onReject}>
            Reject all
          </button>
        </div>

        <details className="ws-sidebar__studio-patch-details">
          <summary>Review files</summary>
          <ul className="ws-sidebar__studio-patch-list">
            {patches.map((patch) => {
              const checked = selected.has(patch.relativePath);
              const disabled = patch.status === 'applied' || busy;
              const displayPath = compactStudioPathText(patch.relativePath);
              const displayFailReason = compactStudioPathText(patch.failReason);
              return (
                <li key={patch.relativePath} data-status={patch.status}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => togglePath(patch.relativePath)}
                    />
                    <code title={displayPath}>{displayPath}</code>
                    {patch.isNewFile ? <span className="ws-sidebar__studio-patch-tag">new</span> : null}
                    {patch.failReason ? <span>{displayFailReason}</span> : null}
                  </label>
                  {patch.diffLines?.length ? (
                    <pre className="ws-sidebar__studio-patch-diff" aria-label={`Diff for ${displayPath}`}>
                      {patch.diffLines.map((line, index) => (
                        <span key={`${line.type}-${index}`} data-type={line.type}>
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          {line.content}
                        </span>
                      ))}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </div>
  );
}
