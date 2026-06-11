import { FolderKanban, LayoutGrid, Package, TerminalSquare } from 'lucide-react';
import {
    DASHBOARD_SECTIONS,
    type DashboardSection,
} from '@/lib/dashboardSections';

const SECTION_ICONS: Record<DashboardSection, typeof LayoutGrid> = {
    overview: LayoutGrid,
    console: TerminalSquare,
    catalog: Package,
    workspaces: FolderKanban,
};

interface DashboardSubNavProps {
    activeSection: DashboardSection;
    onSectionChange: (section: DashboardSection) => void;
    hasProjectSelected: boolean;
    recentWorkspaceCount: number;
}

export function DashboardSubNav({
    activeSection,
    onSectionChange,
    hasProjectSelected,
    recentWorkspaceCount,
}: DashboardSubNavProps) {
    return (
        <nav
            className="dashboard-sub-nav"
            role="tablist"
            aria-label="Dashboard sections"
        >
            {DASHBOARD_SECTIONS.map((section) => {
                const Icon = SECTION_ICONS[section.id];
                const isActive = activeSection === section.id;
                const showProjectBadge = section.id === 'console' && hasProjectSelected;
                const showWorkspaceBadge =
                    section.id === 'workspaces' && recentWorkspaceCount > 0;

                return (
                    <button
                        key={section.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`dashboard-panel-${section.id}`}
                        id={`dashboard-tab-${section.id}`}
                        title={section.description}
                        className={`dashboard-sub-nav__tab ${isActive ? 'is-active' : ''}`}
                        onClick={() => onSectionChange(section.id)}
                    >
                        <span className="dashboard-sub-nav__tab-content">
                            <Icon size={12} aria-hidden="true" />
                            <span>{section.label}</span>
                            {showProjectBadge ? (
                                <span
                                    className="dashboard-sub-nav__badge"
                                    aria-label="Project connected and ready"
                                    title="A project is selected — Console is active"
                                >
                                    <span className="dashboard-sub-nav__live-dot" aria-hidden="true" />
                                    Live
                                </span>
                            ) : null}
                            {showWorkspaceBadge ? (
                                <span className="dashboard-sub-nav__count" aria-label={`${recentWorkspaceCount} recent workspaces`}>
                                    {recentWorkspaceCount}
                                </span>
                            ) : null}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}
