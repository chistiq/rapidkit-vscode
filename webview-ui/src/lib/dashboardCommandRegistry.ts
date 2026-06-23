import {
  DASHBOARD_COMMAND_SURFACE,
  type DashboardCommandId,
  type DashboardCommandSurfaceMeta,
} from '@workspai-contracts/dashboardCommandSurface';
import type { DashboardEvidenceCardId } from '@workspai-contracts/dashboardEvidenceCards';

export type { DashboardEvidenceCardId };

export type DashboardCommandScope = DashboardCommandSurfaceMeta['scope'];

export type DashboardCommandHandler = DashboardCommandSurfaceMeta['handler'];

export type DashboardCommandMeta = DashboardCommandSurfaceMeta;

export const DASHBOARD_COMMAND_REGISTRY = DASHBOARD_COMMAND_SURFACE;

export type DashboardCommand = DashboardCommandId;

export function isDashboardCommand(command: string): command is DashboardCommand {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_COMMAND_REGISTRY, command);
}

export function getDashboardCommandMeta(command: string): DashboardCommandMeta | undefined {
  return isDashboardCommand(command) ? DASHBOARD_COMMAND_REGISTRY[command] : undefined;
}

export function shouldTrackDashboardCommand(command: string): boolean {
  return getDashboardCommandMeta(command)?.trackActivity ?? true;
}

export function getDashboardCommandAffectedEvidenceCards(
  command: string
): DashboardEvidenceCardId[] {
  return getDashboardCommandMeta(command)?.affectedEvidenceCardIds ?? [];
}

export function shouldRefreshDashboardEvidenceAfterCommand(command: string): boolean {
  return getDashboardCommandMeta(command)?.refreshEvidence === true;
}

export function getDashboardCommandPendingEvidenceCards(
  command: string,
  currentCardIds: DashboardEvidenceCardId[]
): DashboardEvidenceCardId[] {
  const affected = getDashboardCommandAffectedEvidenceCards(command);
  if (affected.length > 0) {
    return affected;
  }
  return shouldRefreshDashboardEvidenceAfterCommand(command) ? currentCardIds : [];
}
