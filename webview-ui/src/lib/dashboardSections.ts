export type DashboardSection = 'overview' | 'console' | 'catalog' | 'workspaces';

export const DASHBOARD_SECTIONS: ReadonlyArray<{
  id: DashboardSection;
  label: string;
  description: string;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Workspace summary and quick start',
  },
  {
    id: 'console',
    label: 'Console',
    description: 'Project actions and module installs',
  },
  {
    id: 'catalog',
    label: 'Catalog',
    description: 'Example workspaces and module browse',
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    description: 'Recent workspaces and health',
  },
] as const;

export function normalizeDashboardSection(value: unknown): DashboardSection {
  if (value === 'console' || value === 'catalog' || value === 'workspaces') {
    return value;
  }
  return 'overview';
}

export function dashboardSectionNeedsCatalog(section: DashboardSection): boolean {
  return section === 'catalog' || section === 'console';
}
