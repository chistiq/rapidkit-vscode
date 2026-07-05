const RUNNABLE_PREFIX =
  /^(npx\s+(?:--yes\s+)?(?:--package\s+\S+\s+)?rapidkit|rapidkit|git|npm|pnpm|yarn|python3?|node|docker|kubectl)\s/i;

function stripCommandLabelPrefix(line: string): string {
  return line
    .replace(/^run\s+the\s+command\s+/i, '')
    .replace(/^(?:verify|next action|run|command)\s*:\s*/i, '')
    .trim();
}

function trimTrailingInstruction(candidate: string): string {
  return candidate
    .replace(
      /\s+to\s+(?:confirm|refresh|verify|check|run|update|fix|produce|generate|inspect|see|validate)\b[\s\S]*$/i,
      ''
    )
    .replace(/[),.;:]+$/g, '')
    .trim();
}

export function extractStudioRunnableCommandFromLine(line: string): string | null {
  const stripped = trimTrailingInstruction(stripCommandLabelPrefix(line.trim()));
  const direct = normalizeStudioRunnableCommand(stripped);
  if (direct) {
    return direct;
  }
  const embedded = stripped.match(
    /\b(npx\s+(?:--yes\s+)?(?:--package\s+\S+\s+)?rapidkit|rapidkit|git|npm|pnpm|yarn|python3?|node|docker|kubectl)\b[\s\S]*$/i
  );
  if (!embedded) {
    return null;
  }
  return normalizeStudioRunnableCommand(trimTrailingInstruction(embedded[0]));
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
    const command = extractStudioRunnableCommandFromLine(line);
    if (command && !found.includes(command)) {
      found.push(command);
    }
  }

  return found.slice(0, 4);
}
