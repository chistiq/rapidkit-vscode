/**
 * Shared types + helpers for the React sidebar (roadmap item 2.11).
 */

export type SidebarVariant = 'activitybar' | 'secondary-sidebar';

export type SidebarTab = 'create' | 'impact' | 'studio';

export interface SidebarScope {
  workspaceName?: string;
  workspacePath?: string;
  projectName?: string;
  projectPath?: string;
}

export interface SidebarScopeNode {
  name?: string;
  path?: string;
  profile?: string;
  type?: string;
}

/** Host `sidebarAiScope` payload shape. */
export interface SidebarScopePayload {
  workspace?: SidebarScopeNode | null;
  project?: SidebarScopeNode | null;
}

export function resolveScopeFromPayload(data: Record<string, unknown>): SidebarScope {
  const workspace = (data.workspace ?? null) as SidebarScopeNode | null;
  const project = (data.project ?? null) as SidebarScopeNode | null;
  return {
    workspaceName: workspace?.name,
    workspacePath: workspace?.path,
    projectName: project?.name,
    projectPath: project?.path,
  };
}

declare global {
  interface Window {
    WORKSPAI_SIDEBAR_VARIANT?: string;
    ICON_URI?: string;
  }
}

/** Resolve the host-injected sidebar variant, defaulting to the activity bar. */
export function resolveSidebarVariant(): SidebarVariant {
  return window.WORKSPAI_SIDEBAR_VARIANT === 'secondary-sidebar'
    ? 'secondary-sidebar'
    : 'activitybar';
}
