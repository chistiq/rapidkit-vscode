import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

type StudioRepairPreludeProps = {
  handoff: StudioBlockerHandoffView;
  busy?: boolean;
  onRefreshEvidence?: () => void;
};

export function StudioRepairPrelude({
  handoff,
  busy = false,
  onRefreshEvidence,
}: StudioRepairPreludeProps) {
  const blocker = handoff.blockers[0] || `${handoff.cardLabel ?? 'This card'} needs repair.`;
  const scopeLabel = handoff.scope === 'project' ? 'Project evidence' : 'Workspace evidence';
  void onRefreshEvidence;

  return (
    <section className="ws-sidebar__repair-prelude" aria-label="Studio repair startup">
      <div className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--intro">
        <div className="ws-sidebar__repair-copy">
          <strong>
            <span className="ws-sidebar__repair-live" aria-hidden="true" />
            {busy ? 'Working on the blocker' : 'Repair ready'}
          </strong>
          <p>{blocker}</p>
          <span className="ws-sidebar__repair-meta">{scopeLabel} · verify included</span>
        </div>
      </div>
    </section>
  );
}
