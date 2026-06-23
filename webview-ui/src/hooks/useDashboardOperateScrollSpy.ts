import { useEffect, useRef, type RefObject } from 'react';
import { DASHBOARD_OPERATE_ZONES, type DashboardOperateZone } from '@/lib/dashboardOperateZones';

const SCROLL_ROOT_SELECTOR = '.ws-dashboard-shell__main';

export function useDashboardOperateScrollSpy(
  enabled: boolean,
  onZoneChange: (zone: DashboardOperateZone) => void
): {
  layoutRef: RefObject<HTMLDivElement>;
  pauseSpy: () => void;
} {
  const layoutRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const pauseUntilRef = useRef(0);

  const pauseSpy = () => {
    pausedRef.current = true;
    pauseUntilRef.current = Date.now() + 900;
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const scrollRoot = layoutRef.current?.closest(SCROLL_ROOT_SELECTOR);
    if (!scrollRoot) {
      return;
    }

    const zoneElements = DASHBOARD_OPERATE_ZONES.map((zone) => ({
      id: zone.id,
      element: document.getElementById(zone.anchorId),
    })).filter((entry): entry is { id: DashboardOperateZone; element: HTMLElement } =>
      Boolean(entry.element)
    );

    if (zoneElements.length === 0) {
      return;
    }

    const resolveActiveZone = (): DashboardOperateZone | null => {
      const rootRect = scrollRoot.getBoundingClientRect();
      const anchorY = rootRect.top + 96;
      let best: { id: DashboardOperateZone; distance: number } | null = null;

      for (const entry of zoneElements) {
        const rect = entry.element.getBoundingClientRect();
        if (rect.bottom <= rootRect.top + 48) {
          continue;
        }
        const distance = Math.abs(rect.top - anchorY);
        if (!best || distance < best.distance) {
          best = { id: entry.id, distance };
        }
      }

      return best?.id ?? zoneElements[0]?.id ?? null;
    };

    const handleScroll = () => {
      if (pausedRef.current && Date.now() < pauseUntilRef.current) {
        return;
      }
      pausedRef.current = false;
      const active = resolveActiveZone();
      if (active) {
        onZoneChange(active);
      }
    };

    handleScroll();
    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      scrollRoot.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [enabled, onZoneChange]);

  return { layoutRef, pauseSpy };
}
