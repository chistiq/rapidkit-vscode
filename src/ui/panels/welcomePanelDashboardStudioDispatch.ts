import type { readAIActionRegistry } from '../../core/aiActionRegistry';
import {
  handleDashboardAIActionContractCommand,
  handleDashboardStudioAction,
  handleDashboardStudioMessage,
  postDashboardAIActionRegistry,
  syncDashboardLatestAIAction,
  type DashboardStudioHost,
} from './welcomePanelDashboardStudio';

export async function dispatchDashboardStudioAction(
  host: DashboardStudioHost,
  data: unknown
): Promise<void> {
  await handleDashboardStudioAction(host, data);
}

export async function dispatchDashboardStudioMessage(
  host: DashboardStudioHost,
  data: unknown
): Promise<void> {
  await handleDashboardStudioMessage(host, data);
}

export async function dispatchDashboardAIActionContractCommand(
  host: DashboardStudioHost,
  data: unknown
): Promise<void> {
  await handleDashboardAIActionContractCommand(host, data);
}

export function postDashboardStudioAIActionRegistry(
  host: DashboardStudioHost,
  registry: Awaited<ReturnType<typeof readAIActionRegistry>>
): void {
  postDashboardAIActionRegistry(host, registry);
}

export function syncDashboardStudioLatestAIAction(
  host: DashboardStudioHost,
  registry: Awaited<ReturnType<typeof readAIActionRegistry>>
): void {
  syncDashboardLatestAIAction(host, registry);
}
