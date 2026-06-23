import type { DashboardOperateZone } from './dashboardOperateZones';
import type { DashboardSection } from './dashboardSections';

export type DashboardNavigationSource =
  | 'tab'
  | 'context_bar'
  | 'home_quick_nav'
  | 'evidence'
  | 'repair'
  | 'next_step'
  | 'operate_sub_nav'
  | 'onboarding'
  | 'incident_studio_return'
  | 'studio_handoff'
  | 'home_metric'
  | 'ops_chain'
  | 'host_message';

export function trackDashboardNavigation(
  postMessage: (command: string, data?: Record<string, unknown>) => void,
  section: DashboardSection,
  options?: {
    operateZone?: DashboardOperateZone;
    source?: DashboardNavigationSource;
  }
): void {
  postMessage('trackDashboardNavigation', {
    section,
    operateZone: options?.operateZone,
    source: options?.source ?? 'tab',
  });
}
