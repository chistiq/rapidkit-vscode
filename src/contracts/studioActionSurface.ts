import surfaceContract from './studio-action-surface.v1.json';

export type StudioActionScope = 'workspace' | 'project';
export type StudioActionStability = 'stable' | 'governed' | 'analysis';
export type StudioActionType = 'fix' | 'impact' | 'verify';

export type StudioActionCommandKey = keyof typeof surfaceContract.commands;
export type StudioActionCommand =
  | 'studio-action:run-analyze'
  | 'studio-action:terminal-bridge'
  | 'studio-action:fix-lens'
  | 'studio-action:install-module'
  | 'studio-action:impact-lens'
  | 'studio-action:verify-gates';
export type StudioActionId = StudioActionCommand extends `studio-action:${infer Id}` ? Id : never;

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

export const STUDIO_ACTION_SURFACE_SCHEMA_VERSION = surfaceContract.schemaVersion;
export const STUDIO_ACTION_SURFACE_VERSION = surfaceContract.version;

export const STUDIO_ACTION_COMMANDS = surfaceContract.commands as Record<
  StudioActionCommandKey,
  StudioActionCommand
>;

export const STUDIO_ACTION_COMMAND_SET = new Set<string>(Object.values(STUDIO_ACTION_COMMANDS));

export const STUDIO_ACTION_REGISTRY =
  surfaceContract.registry as readonly StudioActionRegistryEntry[];

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

export function isStudioActionId(value: string): value is StudioActionId {
  return isStudioActionCommand(`studio-action:${value}`);
}

export const STUDIO_ACTION_REGISTRY_BY_ID = new Map<StudioActionId, StudioActionRegistryEntry>(
  STUDIO_ACTION_REGISTRY.map((entry) => [
    parseStudioActionCommand(entry.command) as StudioActionId,
    entry,
  ])
);

export function getStudioActionRegistryEntryById(
  actionId: StudioActionId
): StudioActionRegistryEntry {
  const entry = STUDIO_ACTION_REGISTRY_BY_ID.get(actionId);
  if (entry) {
    return entry;
  }
  const command = `studio-action:${actionId}` as StudioActionCommand;
  return {
    id: command.replace('studio-action:', 'action-'),
    title: actionId,
    shortLabel: 'Action',
    command,
    summary: 'Run Studio action.',
    description: 'Run Studio action.',
    scope: 'workspace',
    stability: 'stable',
  };
}
