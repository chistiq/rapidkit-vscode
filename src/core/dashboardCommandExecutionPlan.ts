import type { DashboardCommandExecutionChannel } from '../contracts/dashboardCommandExecutionChannel';
import { resolveDashboardCommandExecutionChannel } from '../contracts/dashboardCommandExecutionChannel';
import type { DashboardCommandContract } from './dashboardCommandContracts';
import { resolveDashboardCommandContract } from './dashboardCommandContracts';
import type { DashboardCommandCapabilityRequirement } from './dashboardCommandCapabilityRequirement';
import { resolveDashboardCommandCapabilityRequirement } from './dashboardCommandCapabilityRequirement';
import type { WorkspaceCommandSafetyPolicy } from './workspaceCommandSafety';
import { resolveWorkspaceCommandSafetyPolicy } from './workspaceCommandSafety';

export type DashboardCommandExecutionPlan = {
  commandId: string;
  contract?: DashboardCommandContract;
  cliArgs: string[];
  executionChannel?: DashboardCommandExecutionChannel;
  capabilityRequirement?: DashboardCommandCapabilityRequirement;
  safetyPolicy?: WorkspaceCommandSafetyPolicy;
  isCliBacked: boolean;
};

/**
 * Host-side execution truth for dashboard commands.
 *
 * The JSON dashboard command surface is intentionally webview-facing metadata.
 * CLI args, capability requirements, and terminal/background posture live here
 * so host code can apply one execution discipline without leaking privileged
 * command details into the webview contract.
 */
export function resolveDashboardCommandExecutionPlan(
  commandId: string,
  commandData?: Record<string, unknown>
): DashboardCommandExecutionPlan {
  const contract = resolveDashboardCommandContract(commandId);
  const cliArgs = contract?.cliArgs ?? [];

  return {
    commandId,
    contract,
    cliArgs,
    executionChannel: resolveDashboardCommandExecutionChannel(commandId, commandData),
    capabilityRequirement: resolveDashboardCommandCapabilityRequirement(contract),
    safetyPolicy: resolveWorkspaceCommandSafetyPolicy(commandId),
    isCliBacked: cliArgs.length > 0,
  };
}
