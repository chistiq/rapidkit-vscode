import type { DashboardCommandContract } from './dashboardCommandContracts';
import type { RuntimeCommandSurfaceSnapshot } from './runtimeCommandSurface';

export type DashboardCommandCapabilityRequirement =
  | { kind: 'top-level'; command: string; label: string }
  | { kind: 'workspace-subcommand'; command: string; label: string }
  | { kind: 'project-runtime'; command: string; label: string };

const PROJECT_RUNTIME_COMMANDS = new Set([
  'init',
  'dev',
  'start',
  'build',
  'test',
  'lint',
  'format',
  'help',
]);

export function resolveDashboardCommandCapabilityRequirement(
  contract: Pick<DashboardCommandContract, 'cliArgs' | 'scope'> | undefined
): DashboardCommandCapabilityRequirement | undefined {
  const cliArgs = contract?.cliArgs ?? [];
  const command = cliArgs[0];
  if (!command) {
    return undefined;
  }

  if (command === 'workspace') {
    const subcommand = cliArgs[1];
    return subcommand
      ? {
          kind: 'workspace-subcommand',
          command: subcommand,
          label: `workspace ${subcommand}`,
        }
      : undefined;
  }

  if (PROJECT_RUNTIME_COMMANDS.has(command) || contract?.scope === 'module') {
    return {
      kind: 'project-runtime',
      command,
      label: command,
    };
  }

  return {
    kind: 'top-level',
    command,
    label: command,
  };
}

export function isDashboardCommandCapabilityAdvertised(
  surface: RuntimeCommandSurfaceSnapshot,
  requirement: DashboardCommandCapabilityRequirement
): boolean {
  if (requirement.kind === 'workspace-subcommand') {
    return surface.workspaceSubcommands.includes(requirement.command);
  }

  if (requirement.kind === 'project-runtime') {
    return surface.projectScopedCommands.includes(requirement.command);
  }

  return (
    surface.topLevelCommands.includes(requirement.command) ||
    surface.coreBackedCommands.includes(requirement.command)
  );
}
