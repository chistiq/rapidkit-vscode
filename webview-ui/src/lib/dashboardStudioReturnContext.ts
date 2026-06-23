import type { DashboardOperateZone } from './dashboardOperateZones';
import type { DashboardSection } from './dashboardSections';

export type DashboardStudioReturnContext = {
  section: DashboardSection;
  operateZone?: DashboardOperateZone;
};

export function resolveDashboardStudioReturnContext(input: {
  dashboardSection: DashboardSection;
  lastNavigation: {
    section: DashboardSection;
    operateZone?: DashboardOperateZone;
  } | null;
  requestedOperateZone: DashboardOperateZone | null;
}): DashboardStudioReturnContext {
  const section = input.dashboardSection;
  if (section !== 'operate') {
    return { section };
  }

  if (input.lastNavigation?.section === 'operate' && input.lastNavigation.operateZone) {
    return { section, operateZone: input.lastNavigation.operateZone };
  }

  if (input.requestedOperateZone) {
    return { section, operateZone: input.requestedOperateZone };
  }

  return { section };
}
