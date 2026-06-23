import surfaceContract from './sidebar-action-surface.v1.json';

export type SidebarActionScope =
  | 'ai'
  | 'education'
  | 'governance'
  | 'incident'
  | 'navigation'
  | 'onboarding'
  | 'system'
  | 'workspace-intelligence';

export type SidebarActionHandler = 'external-url' | 'vscode-command';

export type SidebarActionSurfaceMeta = {
  id: string;
  label: string;
  scope: SidebarActionScope;
  handler: SidebarActionHandler;
  trackActivity: boolean;
  vscodeCommand?: string;
  externalUrl?: string;
  payloadDefaults?: Record<string, unknown>;
};

export const SIDEBAR_ACTION_SURFACE_SCHEMA_VERSION = surfaceContract.schemaVersion;
export const SIDEBAR_ACTION_SURFACE_VERSION = surfaceContract.version;
type SidebarActionSurfaceMap = typeof surfaceContract.actions;

export type SidebarActionId = keyof SidebarActionSurfaceMap;

export const SIDEBAR_ACTION_SURFACE = surfaceContract.actions as Record<
  SidebarActionId,
  SidebarActionSurfaceMeta
>;

export function resolveSidebarActionSurface(action: string): SidebarActionSurfaceMeta | undefined {
  return (SIDEBAR_ACTION_SURFACE as Record<string, SidebarActionSurfaceMeta | undefined>)[action];
}
