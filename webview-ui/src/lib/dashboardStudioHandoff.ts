import type { DashboardOperateZone } from './dashboardOperateZones';
import type { DashboardSection } from './dashboardSections';

export type DashboardStudioHandoffLink = {
  section: DashboardSection;
  label: string;
  operateZone?: DashboardOperateZone;
  description: string;
};

/** Quick links from Incident Studio back to Command Center sections. */
export const DASHBOARD_STUDIO_HANDOFF_LINKS: ReadonlyArray<DashboardStudioHandoffLink> = [
  {
    section: 'repair',
    label: 'Repair',
    description: 'Next safe action, artifacts, Studio, and Copilot handoff',
  },
  {
    section: 'operate',
    label: 'Run',
    operateZone: 'quick',
    description: 'Primary workspace commands and governance',
  },
  {
    section: 'console',
    label: 'Project',
    description: 'Dev, test, build, and release',
  },
  {
    section: 'overview',
    label: 'Home',
    description: 'Health signals and next steps',
  },
];
