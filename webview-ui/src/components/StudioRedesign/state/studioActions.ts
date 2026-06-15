export const STUDIO_ACTION_COMMANDS = {
  runAnalyze: 'studio-action:run-analyze',
  terminalBridge: 'studio-action:terminal-bridge',
  fixLens: 'studio-action:fix-lens',
  installModule: 'studio-action:install-module',
  impactLens: 'studio-action:impact-lens',
  verifyGates: 'studio-action:verify-gates',
} as const;

export type StudioActionCommand =
  (typeof STUDIO_ACTION_COMMANDS)[keyof typeof STUDIO_ACTION_COMMANDS];
export type StudioActionId = StudioActionCommand extends `studio-action:${infer Id}` ? Id : never;
export type StudioActionScope = 'workspace' | 'project';
export type StudioActionStability = 'stable' | 'governed' | 'analysis';
export type StudioActionType = 'fix' | 'impact' | 'verify';

export interface StudioActionRegistryEntry {
  id: string;
  title: string;
  shortLabel: string;
  command: StudioActionCommand;
  summary: string;
  description: string;
  scope: StudioActionScope;
  stability: StudioActionStability;
  actionType?: StudioActionType;
}

export const STUDIO_ACTION_COMMAND_SET = new Set<string>(Object.values(STUDIO_ACTION_COMMANDS));

export const STUDIO_ACTION_REGISTRY: readonly StudioActionRegistryEntry[] = [
  {
    id: 'action-analyze',
    title: 'Analyze Workspace',
    shortLabel: 'Analyze',
    command: STUDIO_ACTION_COMMANDS.runAnalyze,
    summary: 'Hydrate evidence, health, gates, and related files.',
    description: 'Baseline health and structure evidence.',
    scope: 'workspace',
    stability: 'stable',
  },
  {
    id: 'action-impact',
    title: 'Impact Lens',
    shortLabel: 'Impact',
    command: STUDIO_ACTION_COMMANDS.impactLens,
    summary: 'Generate a blast-radius contract before changes.',
    description: 'Inspect framework clusters and severity bands.',
    scope: 'workspace',
    stability: 'analysis',
    actionType: 'impact',
  },
  {
    id: 'action-fix',
    title: 'Governed Fix',
    shortLabel: 'Fix',
    command: STUDIO_ACTION_COMMANDS.fixLens,
    summary: 'Generate a reviewable patch from analyze evidence for the selected scope.',
    description: 'Prepare a user-approved fix with verify and rollback proof.',
    scope: 'project',
    stability: 'governed',
    actionType: 'fix',
  },
  {
    id: 'action-install-module',
    title: 'Install Catalog Module',
    shortLabel: 'Module',
    command: STUDIO_ACTION_COMMANDS.installModule,
    summary: 'Pick and scaffold a RapidKit catalog module for the selected project.',
    description: 'Generate module files from catalog guidance with verify path.',
    scope: 'project',
    stability: 'governed',
    actionType: 'fix',
  },
  {
    id: 'action-verify',
    title: 'Verify Gates',
    shortLabel: 'Verify',
    command: STUDIO_ACTION_COMMANDS.verifyGates,
    summary: 'Run deterministic verification against current evidence.',
    description: 'Lock the current change to a deterministic verify path.',
    scope: 'project',
    stability: 'stable',
    actionType: 'verify',
  },
  {
    id: 'action-terminal',
    title: 'Terminal Bridge',
    shortLabel: 'Terminal',
    command: STUDIO_ACTION_COMMANDS.terminalBridge,
    summary: 'Route workspace commands through the guarded bridge.',
    description: 'Execute supported workspace commands with visible output.',
    scope: 'workspace',
    stability: 'stable',
  },
] as const;

export const STUDIO_ACTION_REGISTRY_BY_COMMAND = new Map<
  StudioActionCommand,
  StudioActionRegistryEntry
>(STUDIO_ACTION_REGISTRY.map((entry) => [entry.command, entry]));

export function getStudioActionRegistryEntry(
  command: StudioActionCommand
): StudioActionRegistryEntry {
  return (
    STUDIO_ACTION_REGISTRY_BY_COMMAND.get(command) || {
      id: command.replace('studio-action:', 'action-'),
      title: command.replace('studio-action:', ''),
      shortLabel: 'Action',
      command,
      summary: 'Run Studio action.',
      description: 'Run Studio action.',
      scope: 'workspace',
      stability: 'stable',
    }
  );
}

export function isStudioActionCommand(value: string): value is StudioActionCommand {
  return STUDIO_ACTION_COMMAND_SET.has(value);
}

export function parseStudioActionCommand(value: string): StudioActionId | null {
  if (!isStudioActionCommand(value)) {
    return null;
  }
  return value.replace('studio-action:', '') as StudioActionId;
}
