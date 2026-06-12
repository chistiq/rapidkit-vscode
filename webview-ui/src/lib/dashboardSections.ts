export type DashboardSection =
  | 'overview'
  | 'evidence'
  | 'operate'
  | 'console'
  | 'catalog'
  | 'workspaces';

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
    id: 'evidence',
    label: 'Evidence',
    description: 'Ops artifacts, outcomes, and release pipeline',
  },
  {
    id: 'operate',
    label: 'Operate',
    description: 'Workspace actions, governance, and CLI reference',
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
  if (
    value === 'evidence' ||
    value === 'operate' ||
    value === 'console' ||
    value === 'catalog' ||
    value === 'workspaces'
  ) {
    return value;
  }
  return 'overview';
}

export function dashboardSectionNeedsCatalog(section: DashboardSection): boolean {
  return section === 'catalog' || section === 'console';
}

const SECTION_LABELS = Object.fromEntries(
  DASHBOARD_SECTIONS.map((section) => [section.id, section.label])
) as Record<DashboardSection, string>;

export function dashboardSectionLabel(section: DashboardSection): string {
  return SECTION_LABELS[section] ?? 'Overview';
}

export function dashboardSectionForOpsChainStep(
  step: 'bootstrap' | 'doctor' | 'analyze' | 'readiness'
): DashboardSection {
  if (step === 'bootstrap' || step === 'doctor') {
    return 'operate';
  }
  return 'evidence';
}

export function dashboardSectionForIncidentTarget(
  target: 'doctor' | 'analyze' | 'readiness' | 'release' | undefined
): DashboardSection {
  if (target === 'doctor') {
    return 'operate';
  }
  if (target === 'analyze' || target === 'readiness' || target === 'release') {
    return 'evidence';
  }
  return 'evidence';
}
