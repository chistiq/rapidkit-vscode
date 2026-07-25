import { useRef, type KeyboardEvent } from 'react';
import {
  ClipboardCheck,
  FolderKanban,
  LayoutGrid,
  Network,
  Package,
  Play,
  Wrench,
  TerminalSquare,
} from 'lucide-react';
import { DASHBOARD_SECTIONS, type DashboardSection } from '@/lib/dashboardSections';

const SECTION_ICONS: Record<DashboardSection, typeof LayoutGrid> = {
  overview: LayoutGrid,
  repair: Wrench,
  evidence: ClipboardCheck,
  graph: Network,
  operate: Play,
  console: TerminalSquare,
  catalog: Package,
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
    <nav className="ws-dashboard-sub-nav" role="tablist" aria-label="Dashboard sections">
      {DASHBOARD_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        const isActive = activeSection === section.id;
        const showProjectBadge = section.id === 'console' && hasProjectSelected;
        const showLibraryBadge = section.id === 'catalog' && recentWorkspaceCount > 0;
        const showArtifactBadge = section.id === 'evidence' && evidenceAttentionCount > 0;
        const showOperateBadge = section.id === 'operate' && operateAttentionCount > 0;

        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={
              section.id === 'graph' ? 'ws-graph-panel' : `dashboard-panel-${section.id}`
            }
            id={section.id === 'graph' ? 'ws-dashboard-tab-graph' : `dashboard-tab-${section.id}`}
            ref={(node) => {
              tabRefs.current[section.id] = node;
            }}
            tabIndex={isActive ? 0 : -1}
            title={section.description}
            aria-label={section.scope ? `${section.label}, ${section.scope}` : section.label}
            className={`ws-dashboard-sub-nav__tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onSectionChange(section.id)}
            onKeyDown={(event) => handleTabKeyDown(event, section.id)}
          >
            <span className="ws-dashboard-sub-nav__tab-content">
              <Icon size={12} aria-hidden="true" />
              <span className="ws-dashboard-sub-nav__label-group">
                <span className="ws-dashboard-sub-nav__label">{section.label}</span>
                {section.scope ? (
                  <span className="ws-dashboard-sub-nav__scope" aria-hidden="true">
                    {section.scope}
                  </span>
                ) : null}
              </span>
              {showArtifactBadge ? (
                <span
                  className="ws-dashboard-sub-nav__count"
                  aria-label={`${evidenceAttentionCount} evidence artifacts need review`}
                >
                  {evidenceAttentionCount}
                </span>
              ) : null}
              {showOperateBadge ? (
                <span
                  className="ws-dashboard-sub-nav__count ws-dashboard-sub-nav__count--alert"
                  aria-label={`${operateAttentionCount} governance items need attention`}
                >
                  {operateAttentionCount}
                </span>
              ) : null}
              {showProjectBadge ? (
                <span
                  className="ws-dashboard-sub-nav__badge"
                  aria-label="Project connected and ready"
                  title="A project is selected — Project tab is active"
                >
                  <span className="ws-dashboard-sub-nav__live-dot" aria-hidden="true" />
                  Live
                </span>
              ) : null}
              {showLibraryBadge ? (
                <span
                  className="ws-dashboard-sub-nav__count"
                  aria-label={`${recentWorkspaceCount} recent workspaces`}
                >
                  <FolderKanban size={10} aria-hidden="true" />
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
