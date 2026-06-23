export const DASHBOARD_NAVIGATION_OPERATE_ZONES = [
  'quick',
  'build',
  'share',
  'intelligence',
  'governance',
  'cli',
] as const;

export type DashboardNavigationOperateZone = (typeof DASHBOARD_NAVIGATION_OPERATE_ZONES)[number];

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

export function normalizeDashboardNavigationSection(section: string): string {
  return section === 'workspaces' ? 'catalog' : section;
}

export function buildDashboardNavigationTelemetryCommand(
  section: string,
  operateZone?: string
): string {
  const normalizedSection = normalizeDashboardNavigationSection(section);
  if (
    normalizedSection === 'operate' &&
    operateZone &&
    DASHBOARD_NAVIGATION_OPERATE_ZONES.includes(operateZone as DashboardNavigationOperateZone)
  ) {
    return `dashboard.nav.operate.${operateZone}`;
  }
  return `dashboard.nav.${normalizedSection}`;
}
