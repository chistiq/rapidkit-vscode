const RUNNABLE_PREFIX =
  /^(npx\s+rapidkit|rapidkit|git|npm|pnpm|yarn|python3?|node|docker|kubectl)\s/i;

function stripCommandLabelPrefix(line: string): string {
  return line.replace(/^(?:verify|next action|run|command)\s*:\s*/i, '').trim();
}

export function normalizeStudioRunnableCommand(raw: string): string | null {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const candidate = lines[0];
  if (!candidate) {
    return null;
  }

  return RUNNABLE_PREFIX.test(candidate) ? candidate : null;
}

export function extractStudioCommandsFromText(text: string): string[] {
  const found: string[] = [];
  const fencePattern = /```(?:bash|sh|shell|zsh)?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(text)) !== null) {
    const command = normalizeStudioRunnableCommand(match[1] ?? '');
    if (command && !found.includes(command)) {
      found.push(command);
    }
  }

  for (const line of text.split('\n')) {
    const stripped = stripCommandLabelPrefix(line.trim());
    const command = normalizeStudioRunnableCommand(stripped);
    if (command && !found.includes(command)) {
      found.push(command);
    }
  }

  return found.slice(0, 4);
}
