import { ScanSearch } from 'lucide-react';
import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

type StudioRepairPreludeProps = {
  handoff: StudioBlockerHandoffView;
  busy?: boolean;
  onRefreshEvidence?: () => void;
};

export function StudioRepairPrelude({ handoff, busy = false, onRefreshEvidence }: StudioRepairPreludeProps) {
  const blocker = handoff.blockers[0] || `${handoff.cardLabel ?? 'This card'} needs repair.`;
  const scopeLabel = handoff.scope === 'project' ? 'Project evidence' : 'Workspace evidence';
  const canRefreshEvidence = Boolean(onRefreshEvidence);

  return (
    <section className="ws-sidebar__repair-prelude" aria-label="Studio repair startup">
      <div className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--intro">
        <span className="ws-sidebar__repair-avatar" aria-hidden="true">
          <ScanSearch size={14} strokeWidth={1.8} />
        </span>
        <div className="ws-sidebar__repair-copy">
          <strong>
            <span className="ws-sidebar__repair-live" aria-hidden="true" />
            Reading this card
          </strong>
          <p>{blocker}</p>
          <span className="ws-sidebar__repair-meta">{scopeLabel} · matching the latest evidence</span>
        </div>
      </div>

      <div className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--finding">
        <div className="ws-sidebar__repair-copy">
          <strong>Preparing the safest next step</strong>
          <p>
            I will use the card artifact and workspace evidence first. If the plan is stale,
            I will refresh evidence before proposing a file change.
          </p>
          {canRefreshEvidence ? (
            <button
              type="button"
              className="ws-sidebar__inline ws-sidebar__inline--primary"
              disabled={busy}
              onClick={onRefreshEvidence}
            >
              {busy ? 'Refreshing…' : 'Refresh evidence'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
