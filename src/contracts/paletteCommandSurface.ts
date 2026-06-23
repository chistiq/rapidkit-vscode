import surfaceContract from './palette-command-surface.v1.json';

export type PaletteCommandScope =
  | 'navigation'
  | 'onboarding'
  | 'workspace-intelligence'
  | 'incident'
  | 'system';

export type PaletteCoreCommandMeta = {
  command: string;
  label: string;
  scope: PaletteCommandScope;
};

export const PALETTE_COMMAND_SURFACE_SCHEMA_VERSION = surfaceContract.schemaVersion;
export const PALETTE_COMMAND_SURFACE_VERSION = surfaceContract.version;

export const PALETTE_CORE_COMMANDS = surfaceContract.coreCommands as PaletteCoreCommandMeta[];

export const PALETTE_CORE_COMMAND_IDS = PALETTE_CORE_COMMANDS.map((entry) => entry.command);

export const PALETTE_CORE_COMMAND_ID_SET = new Set(PALETTE_CORE_COMMAND_IDS);

export function isPaletteCoreCommand(command: string): boolean {
  return PALETTE_CORE_COMMAND_ID_SET.has(command);
}
