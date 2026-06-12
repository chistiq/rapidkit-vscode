export function buildRapidkitDisplayCommand(args: string[] = []): string {
  return ['npx', 'rapidkit', ...args].join(' ');
}

export function toDisplayRapidkitCommand(command: string): string {
  return command.replace(/\bnpx\s+--yes\s+--package\s+rapidkit\s+rapidkit\b/g, 'npx rapidkit');
}
