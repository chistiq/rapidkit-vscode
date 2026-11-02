/** Command cards accept a single command, never a paragraph or a truncated script. */
export function isStudioCommandText(command: string): boolean {
  if (!command.trim() || /[\r\n]/.test(command)) {
    return false;
  }
  let quote: string | undefined;
  let outsideQuotes = '';
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) {
      return false;
    }
    if (character === '\\' && quote !== "'") {
      const escaped = command[++index];
      if (!escaped || escaped.charCodeAt(0) < 32) {
        return false;
      }
      if (!quote) {
        outsideQuotes += escaped;
      }
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else {
      outsideQuotes += character;
    }
  }
  if (quote || Array.from(outsideQuotes).some((character) => character.charCodeAt(0) > 127)) {
    return false;
  }
  const firstArgument =
    /^(?:npx\s+(?:--yes\s+)?(?:--package\s+\S+\s+)?(?:rapidkit|workspai)|rapidkit|workspai|git|npm|pnpm|yarn|python3?|node|docker|kubectl)\s+([a-z]+)\b/i.exec(
      outsideQuotes.trim()
    )?.[1];
  if (
    firstArgument &&
    /^(?:is|are|was|were|has|have|can|helps?|provides?|supports?|models?|lets?)$/i.test(
      firstArgument
    )
  ) {
    return false;
  }
  return !/\b(?:please|then|afterwards)\b|\b(?:and|to)\s+(?:run|install|check|review|verify|inspect)\b/i.test(
    outsideQuotes
  );
}
