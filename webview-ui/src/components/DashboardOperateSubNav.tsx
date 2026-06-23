import { useRef, type KeyboardEvent } from 'react';
import { DASHBOARD_OPERATE_ZONES, type DashboardOperateZone } from '@/lib/dashboardOperateZones';

const RUN_WORKSPACE_ZONES = DASHBOARD_OPERATE_ZONES.filter((zone) => zone.id !== 'build');

interface DashboardOperateSubNavProps {
  activeZone?: DashboardOperateZone;
  onZoneSelect?: (zone: DashboardOperateZone) => void;
}

export function DashboardOperateSubNav({
  activeZone = 'quick',
  onZoneSelect,
}: DashboardOperateSubNavProps) {
  const tabRefs = useRef<Partial<Record<DashboardOperateZone, HTMLButtonElement | null>>>({});

  const focusZone = (zone: DashboardOperateZone) => {
    window.requestAnimationFrame(() => tabRefs.current[zone]?.focus());
  };

  const selectZone = (zone: DashboardOperateZone) => {
    onZoneSelect?.(zone);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentZone: DashboardOperateZone
  ) => {
    const currentIndex = RUN_WORKSPACE_ZONES.findIndex((entry) => entry.id === currentZone);
    if (currentIndex < 0) {
      return;
    }

    let nextZone: DashboardOperateZone | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextZone = RUN_WORKSPACE_ZONES[(currentIndex + 1) % RUN_WORKSPACE_ZONES.length].id;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextZone =
        RUN_WORKSPACE_ZONES[
          (currentIndex - 1 + RUN_WORKSPACE_ZONES.length) % RUN_WORKSPACE_ZONES.length
        ].id;
    } else if (event.key === 'Home') {
      nextZone = RUN_WORKSPACE_ZONES[0].id;
    } else if (event.key === 'End') {
      nextZone = RUN_WORKSPACE_ZONES[RUN_WORKSPACE_ZONES.length - 1].id;
    }

    if (!nextZone) {
      return;
    }

    event.preventDefault();
    selectZone(nextZone);
    focusZone(nextZone);
  };

  return (
    <nav
      className="dashboard-operate-sub-nav"
      role="tablist"
      aria-label="Run workspace sections"
    >
      {RUN_WORKSPACE_ZONES.map((zone) => {
        const isActive = activeZone === zone.id;
        return (
          <button
            key={zone.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={zone.anchorId}
            id={`dashboard-operate-tab-${zone.id}`}
            ref={(node) => {
              tabRefs.current[zone.id] = node;
            }}
            tabIndex={isActive ? 0 : -1}
            title={zone.description}
            className={`dashboard-operate-sub-nav__tab${isActive ? ' is-active' : ''}`}
            onClick={() => selectZone(zone.id)}
            onKeyDown={(event) => handleTabKeyDown(event, zone.id)}
          >
            <span className="dashboard-operate-sub-nav__label">{zone.label}</span>
            <span className="dashboard-operate-sub-nav__scope" aria-hidden="true">
              {zone.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
