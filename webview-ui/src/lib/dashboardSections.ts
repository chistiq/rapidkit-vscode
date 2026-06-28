export type DashboardSection =
  | 'overview'
  | 'repair'
  | 'evidence'
  | 'operate'
  | 'console'
  | 'catalog';

export type DashboardSectionDefinition = {
  id: DashboardSection;
  label: string;
  scope: string;
  description: string;
};

export const DASHBOARD_SECTIONS: ReadonlyArray<DashboardSectionDefinition> = [
  {
    id: 'overview',
    label: 'Home',
    scope: 'home',
    description: 'Workspace status, create/import handoffs, and next action summary',
  },
  {
    id: 'operate',
    label: 'Run',
    scope: 'workspace',
    description: 'Execute workspace commands — primary, build, intelligence, governance',
  },
  {
    id: 'repair',
    label: 'Repair',
    scope: 'flow',
    description: 'One safe path through blockers, commands, Studio, and artifacts',
  },
  {
    id: 'evidence',
    label: 'Artifacts',
    scope: 'history',
    description: 'Evidence artifacts, command history, and release records',
  },
  {
    id: 'console',
    label: 'Project',
    scope: 'lifecycle',
    description: 'Dev, test, build, and release for the selected project',
  },
  {
    id: 'catalog',
    label: 'Library',
    scope: 'library',
    description: 'Your workspaces, example templates, and module catalog browse',
  },
] as const;

export function normalizeDashboardSection(value: unknown): DashboardSection {
  if (value === 'workspaces') {
    return 'catalog';
  }
  if (
    value === 'evidence' ||
    value === 'repair' ||
    value === 'operate' ||
    value === 'console' ||
    value === 'catalog'
  ) {
    return value;
  }
  return 'overview';
}

export function dashboardSectionNeedsCatalog(section: DashboardSection): boolean {
  return section === 'catalog' || section === 'console';
}

/** Primary tabs hide filesystem paths on the shared scope card. */
export function dashboardSectionShowsScopePaths(section: DashboardSection): boolean {
  return section === 'catalog';
}

const SECTION_BY_ID = Object.fromEntries(
  DASHBOARD_SECTIONS.map((section) => [section.id, section])
) as Record<DashboardSection, DashboardSectionDefinition>;

export function dashboardSectionLabel(section: DashboardSection): string {
  return SECTION_BY_ID[section]?.label ?? 'Status';
}

export function dashboardSectionScope(section: DashboardSection): string | undefined {
  return SECTION_BY_ID[section]?.scope;
}

export function dashboardSectionAriaLabel(section: DashboardSection): string {
  const definition = SECTION_BY_ID[section];
  if (!definition) {
    return 'Status';
  }
  return `${definition.label}, ${definition.scope}`;
}

export function dashboardSectionForOpsChainStep(
  step: 'bootstrap' | 'doctor' | 'analyze' | 'readiness'
): DashboardSection {
  if (step === 'bootstrap' || step === 'doctor') {
    return 'operate';
  }
  return 'repair';
}

export function dashboardSectionForIncidentTarget(
  target:
    | 'doctor'
    | 'analyze'
    | 'readiness'
    | 'release'
    | 'impact'
    | 'model'
    | 'pipeline'
    | undefined
): DashboardSection {
  if (target === 'doctor') {
    return 'operate';
  }
  if (
    target === 'analyze' ||
    target === 'readiness' ||
    target === 'release' ||
    target === 'impact' ||
    target === 'model' ||
    target === 'pipeline'
  ) {
    return 'repair';
  }
  return 'repair';
}
