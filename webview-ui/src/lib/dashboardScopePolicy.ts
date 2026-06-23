import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import type { DashboardSection } from '@/lib/dashboardSections';

export type DashboardSectionScopePolicy =
  | 'workspace-first'
  | 'project-lifecycle'
  | 'project-target';

export function dashboardSectionScopePolicy(
  section: DashboardSection
): DashboardSectionScopePolicy {
  if (section === 'console') {
    return 'project-lifecycle';
  }
  if (section === 'catalog') {
    return 'project-target';
  }
  return 'workspace-first';
}

export function dashboardWorkspaceScope(scope: DashboardScopeDescriptor): DashboardScopeDescriptor {
  return {
    ...scope,
    level: scope.workspace.active ? 'workspace' : 'none',
    project: {
      active: false,
      source: 'vscode',
    },
  };
}

export function dashboardScopeForSection(
  scope: DashboardScopeDescriptor,
  section: DashboardSection
): DashboardScopeDescriptor {
  const policy = dashboardSectionScopePolicy(section);
  if (policy === 'workspace-first') {
    return dashboardWorkspaceScope(scope);
  }
  return scope;
}

export function dashboardSectionUsesWorkspaceFirstScope(section: DashboardSection): boolean {
  return dashboardSectionScopePolicy(section) === 'workspace-first';
}
