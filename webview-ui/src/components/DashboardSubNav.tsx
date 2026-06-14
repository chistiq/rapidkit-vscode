import { useRef, type KeyboardEvent } from 'react';
import {
    ClipboardCheck,
    FolderKanban,
    LayoutGrid,
    Package,
    Settings2,
    TerminalSquare,
} from 'lucide-react';
import {
    DASHBOARD_SECTIONS,
    type DashboardSection,
} from '@/lib/dashboardSections';

const SECTION_ICONS: Record<DashboardSection, typeof LayoutGrid> = {
    overview: LayoutGrid,
    evidence: ClipboardCheck,
    operate: Settings2,
    console: TerminalSquare,
    catalog: Package,
    workspaces: FolderKanban,
};

interface DashboardSubNavProps {
    activeSection: DashboardSection;
    onSectionChange: (section: DashboardSection) => void;
    hasProjectSelected: boolean;
    recentWorkspaceCount: number;
    evidenceAttentionCount?: number;
    operateAttentionCount?: number;
}

export function DashboardSubNav({
    activeSection,
    onSectionChange,
    hasProjectSelected,
    recentWorkspaceCount,
    evidenceAttentionCount = 0,
    operateAttentionCount = 0,
}: DashboardSubNavProps) {
    const tabRefs = useRef<Partial<Record<DashboardSection, HTMLButtonElement | null>>>({});

    const focusSection = (section: DashboardSection) => {
        window.requestAnimationFrame(() => tabRefs.current[section]?.focus());
    };

    const handleTabKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        currentSection: DashboardSection
    ) => {
        const currentIndex = DASHBOARD_SECTIONS.findIndex((section) => section.id === currentSection);
        if (currentIndex < 0) {
            return;
        }

        let nextSection: DashboardSection | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextSection = DASHBOARD_SECTIONS[(currentIndex + 1) % DASHBOARD_SECTIONS.length].id;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextSection =
                DASHBOARD_SECTIONS[
                    (currentIndex - 1 + DASHBOARD_SECTIONS.length) % DASHBOARD_SECTIONS.length
                ].id;
        } else if (event.key === 'Home') {
            nextSection = DASHBOARD_SECTIONS[0].id;
        } else if (event.key === 'End') {
            nextSection = DASHBOARD_SECTIONS[DASHBOARD_SECTIONS.length - 1].id;
        }

        if (!nextSection) {
            return;
        }

        event.preventDefault();
        onSectionChange(nextSection);
        focusSection(nextSection);
    };

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
                const showEvidenceBadge =
                    section.id === 'evidence' && evidenceAttentionCount > 0;
                const showOperateBadge =
                    section.id === 'operate' && operateAttentionCount > 0;

                return (
                    <button
                        key={section.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`dashboard-panel-${section.id}`}
                        id={`dashboard-tab-${section.id}`}
                        ref={(node) => {
                            tabRefs.current[section.id] = node;
                        }}
                        tabIndex={isActive ? 0 : -1}
                        title={section.description}
                        className={`dashboard-sub-nav__tab ${isActive ? 'is-active' : ''}`}
                        onClick={() => onSectionChange(section.id)}
                        onKeyDown={(event) => handleTabKeyDown(event, section.id)}
                    >
                        <span className="dashboard-sub-nav__tab-content">
                            <Icon size={12} aria-hidden="true" />
                            <span>{section.label}</span>
                            {showEvidenceBadge ? (
                                <span
                                    className="dashboard-sub-nav__count dashboard-sub-nav__count--alert"
                                    aria-label={`${evidenceAttentionCount} evidence items need attention`}
                                >
                                    {evidenceAttentionCount}
                                </span>
                            ) : null}
                            {showOperateBadge ? (
                                <span
                                    className="dashboard-sub-nav__count dashboard-sub-nav__count--alert"
                                    aria-label={`${operateAttentionCount} governance items need attention`}
                                >
                                    {operateAttentionCount}
                                </span>
                            ) : null}
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
