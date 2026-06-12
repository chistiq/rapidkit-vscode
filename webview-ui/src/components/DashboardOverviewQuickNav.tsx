import { ArrowRight, ClipboardCheck, Settings2 } from 'lucide-react';
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
    return (
        <nav className="dashboard-overview-quick-nav" aria-label="Dashboard quick navigation">
            <button
                type="button"
                className="dashboard-overview-quick-nav__item"
                onClick={() => onNavigate('evidence')}
            >
                <ClipboardCheck size={14} aria-hidden="true" />
                <span className="dashboard-overview-quick-nav__copy">
                    <strong>Evidence & Release</strong>
                    <small>Artifacts, outcomes, readiness pipeline</small>
                </span>
                {evidenceAttentionCount > 0 ? (
                    <span className="dashboard-overview-quick-nav__badge">{evidenceAttentionCount}</span>
                ) : null}
                <ArrowRight size={12} aria-hidden="true" />
            </button>
            <button
                type="button"
                className="dashboard-overview-quick-nav__item"
                onClick={() => onNavigate('operate')}
            >
                <Settings2 size={14} aria-hidden="true" />
                <span className="dashboard-overview-quick-nav__copy">
                    <strong>Operate & Governance</strong>
                    <small>Doctor, graph, bootstrap, mirror, infra</small>
                </span>
                {operateAttentionCount > 0 ? (
                    <span className="dashboard-overview-quick-nav__badge">{operateAttentionCount}</span>
                ) : null}
                <ArrowRight size={12} aria-hidden="true" />
            </button>
        </nav>
    );
}
