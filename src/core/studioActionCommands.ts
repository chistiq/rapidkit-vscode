export const STUDIO_ACTION_COMMANDS = {
  runAnalyze: 'studio-action:run-analyze',
  terminalBridge: 'studio-action:terminal-bridge',
  fixLens: 'studio-action:fix-lens',
  impactLens: 'studio-action:impact-lens',
  verifyGates: 'studio-action:verify-gates',
} as const;

export type StudioActionCommand =
  (typeof STUDIO_ACTION_COMMANDS)[keyof typeof STUDIO_ACTION_COMMANDS];
export type StudioActionId = StudioActionCommand extends `studio-action:${infer Id}` ? Id : never;

export const STUDIO_ACTION_COMMAND_SET = new Set<string>(Object.values(STUDIO_ACTION_COMMANDS));

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
