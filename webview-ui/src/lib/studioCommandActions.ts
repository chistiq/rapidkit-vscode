import { isStudioCommandText } from '@workspai-contracts/studioCommandText';

const RUNNABLE_PREFIX =
  /^(npx\s+(?:--yes\s+)?(?:--package\s+\S+\s+)?(?:rapidkit|workspai)|rapidkit|workspai|git|npm|pnpm|yarn|python3?|node|docker|kubectl)\s/;

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
  // Prose surrounding an inline command remains prose. Quoted Unicode paths
  // are legitimate command arguments, but unquoted natural-language text is
  // not an instruction to run the entire paragraph.
  const outsideQuotes = stripped.replace(/"[^"]*"|'[^']*'/g, '');
  if (Array.from(outsideQuotes).some((character) => character.charCodeAt(0) > 0x7f)) {
    return null;
  }
  const direct = normalizeStudioRunnableCommand(stripped);
  if (direct) {
    return direct;
  }
  return null;
}

export function normalizeStudioRunnableCommand(raw: string): string | null {
  const candidate = raw.trim();
  if (!isStudioCommandText(candidate)) {
    return null;
  }

  const prefix = RUNNABLE_PREFIX.exec(candidate);
  if (!prefix || !/^[A-Za-z0-9_@./'"-]/.test(candidate.slice(prefix[0].length))) {
    return null;
  }
  return candidate;
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
