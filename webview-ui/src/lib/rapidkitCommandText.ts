export function buildRapidkitDisplayCommand(args: string[] = []): string {
  return ['npx', 'workspai', ...args].join(' ');
}

export function toDisplayRapidkitCommand(command: string): string {
  return command.replace(/\bnpx\s+--yes\s+--package\s+[^\s]+\s+workspai\b/g, 'npx workspai');
}
