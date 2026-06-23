import surfaceContract from './dashboard-command-surface.v1.json';
import type { DashboardEvidenceCardId } from './dashboardEvidenceCards';

export type DashboardCommandScope = 'workspace' | 'project' | 'module' | 'system';

export type DashboardCommandHandler = 'webview-local' | 'extension-host';

export type DashboardCommandSurfaceMeta = {
  id: string;
  label: string;
  scope: DashboardCommandScope;
  handler: DashboardCommandHandler;
  trackActivity: boolean;
  affectedEvidenceCardIds?: DashboardEvidenceCardId[];
  refreshEvidence?: boolean;
};

export const DASHBOARD_COMMAND_SURFACE_SCHEMA_VERSION = surfaceContract.schemaVersion;
export const DASHBOARD_COMMAND_SURFACE_VERSION = surfaceContract.version;
type DashboardCommandSurfaceMap = typeof surfaceContract.commands;

export type DashboardCommandId = keyof DashboardCommandSurfaceMap;

export const DASHBOARD_COMMAND_SURFACE = surfaceContract.commands as Record<
  DashboardCommandId,
  DashboardCommandSurfaceMeta
>;

export function resolveDashboardCommandSurface(
  command: string
): DashboardCommandSurfaceMeta | undefined {
  return (DASHBOARD_COMMAND_SURFACE as Record<string, DashboardCommandSurfaceMeta | undefined>)[
    command
  ];
}
