import type { WorkspaceStatus } from '@/types';

export type ProjectCapabilitiesSnapshot = NonNullable<WorkspaceStatus['projectCapabilities']>;

export const DASHBOARD_LIFECYCLE_COMMAND_MAP: Record<string, string> = {
  projectInit: 'init',
  projectDev: 'dev',
  projectTest: 'test',
  projectBuild: 'build',
  projectLint: 'lint',
  projectFormat: 'format',
};

export function isProjectCapabilitiesAvailable(
  capabilities?: ProjectCapabilitiesSnapshot
): capabilities is ProjectCapabilitiesSnapshot & { available: true } {
  return capabilities?.available === true;
}

export function isProjectLifecycleCommandSupported(
  capabilities: ProjectCapabilitiesSnapshot | undefined,
  command: string
): boolean {
  if (!isProjectCapabilitiesAvailable(capabilities)) {
    return true;
  }
  const entry = capabilities.commandMap?.[command];
  if (entry) {
    return entry.status === 'supported';
  }
  return capabilities.supportedCommands?.includes(command) ?? false;
}

export function getProjectLifecycleDisableReason(
  capabilities: ProjectCapabilitiesSnapshot | undefined,
  command: string
): string | undefined {
  if (!isProjectCapabilitiesAvailable(capabilities)) {
    return undefined;
  }
  if (isProjectLifecycleCommandSupported(capabilities, command)) {
    return undefined;
  }
  const entry = capabilities.commandMap?.[command];
  if (entry?.reason) {
    return entry.reason;
  }
  const framework = capabilities.frameworkDisplayName || 'this runtime';
  return `rapidkit ${command} is not supported for ${framework} projects.`;
}

export function isDashboardLifecycleCommandSupported(
  capabilities: ProjectCapabilitiesSnapshot | undefined,
  dashboardCommand: string
): boolean {
  const lifecycleCommand = DASHBOARD_LIFECYCLE_COMMAND_MAP[dashboardCommand];
  if (!lifecycleCommand) {
    return true;
  }
  return isProjectLifecycleCommandSupported(capabilities, lifecycleCommand);
}

export function getDashboardLifecycleDisableReason(
  capabilities: ProjectCapabilitiesSnapshot | undefined,
  dashboardCommand: string
): string | undefined {
  const lifecycleCommand = DASHBOARD_LIFECYCLE_COMMAND_MAP[dashboardCommand];
  if (!lifecycleCommand) {
    return undefined;
  }
  return getProjectLifecycleDisableReason(capabilities, lifecycleCommand);
}

export function isModuleMutationSupportedFromCapabilities(
  capabilities?: ProjectCapabilitiesSnapshot
): boolean {
  if (!isProjectCapabilitiesAvailable(capabilities)) {
    return false;
  }
  return (
    capabilities.moduleSupport === true &&
    isProjectLifecycleCommandSupported(capabilities, 'add') &&
    isProjectLifecycleCommandSupported(capabilities, 'modules')
  );
}
