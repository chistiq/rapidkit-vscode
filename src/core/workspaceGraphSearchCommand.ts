export function buildWorkspaceGraphSearchCommand(input: {
  query: string;
  scope?: string;
  kind?: string;
  limit?: number;
  operation?: 'search' | 'entities' | 'evidence' | 'path';
  target?: string;
}): string[] {
  const operation = input.operation ?? 'search';
  const command = ['workspace', 'graph', operation];
  if (operation === 'entities') {
    command.push('--kind', input.kind?.trim() || input.query.trim());
  } else {
    command.push(input.query.trim());
  }
  if (operation === 'path') {
    if (!input.target?.trim()) {
      throw new Error('Graph path requires a target entity.');
    }
    command.push(input.target.trim());
  }
  command.push('--limit', String(input.limit ?? 12));
  if (operation !== 'entities' && input.kind?.trim()) {
    command.push('--kind', input.kind.trim());
  }
  if (input.scope?.trim()) {
    command.push('--scope', input.scope.trim());
  }
  command.push('--json');
  return command;
}
