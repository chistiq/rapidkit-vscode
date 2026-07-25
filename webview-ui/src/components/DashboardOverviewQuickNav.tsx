import { ArrowRight, Play, Wrench } from 'lucide-react';
import type { DashboardSection } from '@/lib/dashboardSections';

interface DashboardOverviewQuickNavProps {
  evidenceAttentionCount: number;
  operateAttentionCount: number;
  onNavigate: (section: DashboardSection) => void;
}

export function DashboardOverviewQuickNav({
  evidenceAttentionCount,
  operateAttentionCount,
  onNavigate,
}: DashboardOverviewQuickNavProps) {
  const repairAction = {
    section: 'repair' as const,
    icon: Wrench,
    title: 'Repair workspace',
    detail: 'Review blockers and run safe repair actions when needed',
    badge: evidenceAttentionCount > 0 ? evidenceAttentionCount : null,
  };
  const runAction = {
    section: 'operate' as const,
    icon: Play,
    title: 'Run workspace',
    detail: 'Generate or refresh health, intelligence, and release evidence',
    badge: operateAttentionCount > 0 ? operateAttentionCount : null,
  };
  const actions = evidenceAttentionCount > 0 ? [repairAction, runAction] : [runAction, repairAction];
  const actionRow = (
    <div className="home-next-actions__row">
      {actions.map((action, index) => {
        const ActionIcon = action.icon;
        return (
          <button
            key={action.section}
            type="button"
            className={`home-create-handoff__action home-next-actions__item${index === 0 ? ' home-create-handoff__action--primary' : ''}`}
            onClick={() => onNavigate(action.section)}
          >
            <ActionIcon size={15} aria-hidden="true" />
            <span>
              <strong>
                {action.title}
                {action.badge ? (
                  <span className="home-next-actions__badge">{action.badge}</span>
                ) : null}
              </strong>
              <small>{action.detail}</small>
            </span>
            <ArrowRight size={13} aria-hidden="true" className="home-create-handoff__chevron" />
          </button>
        );
      })}
    </div>
  );

  return (
    <nav className="home-next-actions" aria-label="Workspace next actions">
      <span className="home-next-actions__label">Next actions</span>
      {actionRow}
    </nav>
  );
}
