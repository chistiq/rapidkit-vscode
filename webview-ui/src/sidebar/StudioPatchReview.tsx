import { useMemo, useState } from 'react';

export type SidebarPatchReviewItem = {
  relativePath: string;
  status: string;
  isNewFile?: boolean;
  failReason?: string;
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

  return (
    <div className="ws-sidebar__studio-patch-review" role="region" aria-label="Patch review">
      <strong>Patch review</strong>
      {summary ? <p>{summary}</p> : null}
      {riskSummary ? <p className="ws-sidebar__studio-patch-risk">{riskSummary}</p> : null}
      <ul className="ws-sidebar__studio-patch-list">
        {patches.map((patch) => {
          const checked = selected.has(patch.relativePath);
          const disabled = patch.status === 'applied' || busy;
          return (
            <li key={patch.relativePath} data-status={patch.status}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => togglePath(patch.relativePath)}
                />
                <code>{patch.relativePath}</code>
                {patch.isNewFile ? <span className="ws-sidebar__studio-patch-tag">new</span> : null}
                {patch.failReason ? <span>{patch.failReason}</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="ws-sidebar__studio-cta">
        <button
          type="button"
          className="ws-sidebar__inline ws-sidebar__inline--primary"
          disabled={busy || selected.size === 0}
          onClick={() => onApply([...selected])}
        >
          {busy ? 'Applying…' : 'Apply selected'}
        </button>
        <button type="button" className="ws-sidebar__inline" disabled={busy} onClick={onReject}>
          Reject all
        </button>
      </div>
    </div>
  );
}
