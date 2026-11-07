export type StudioInlinePrediction = {
  start: number;
  end: number;
  text: string;
  filterText?: string;
};

/** Stable inline ranges are single-line. Preserve all text before the cursor. */
export function resolveStudioInlinePrediction(
  source: string,
  offset: number,
  raw: Record<string, unknown>,
  allowReplacement: boolean
): StudioInlinePrediction | undefined {
  const { text, oldText } = raw;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > source.length ||
    typeof text !== 'string' ||
    !text ||
    text.length > 4000 ||
    text.includes('\0')
  ) {
    return undefined;
  }
  if (oldText === undefined || oldText === '') {
    return source.slice(offset).startsWith(text) ? undefined : { start: offset, end: offset, text };
  }
  if (
    !allowReplacement ||
    typeof oldText !== 'string' ||
    oldText.length > 2000 ||
    /[\r\n\0]/.test(oldText)
  ) {
    return undefined;
  }
  const lineStart = offset === 0 ? 0 : source.lastIndexOf('\n', offset - 1) + 1;
  const newline = source.indexOf('\n', offset);
  const lineEnd = newline < 0 ? source.length : newline;
  const line = source.slice(lineStart, lineEnd).replace(/\r$/, '');
  const at = line.indexOf(oldText);
  if (at < 0 || line.indexOf(oldText, at + 1) >= 0) {
    return undefined;
  }
  const start = lineStart + at,
    end = start + oldText.length;
  if (
    offset < start ||
    offset > end ||
    oldText === text ||
    !text.startsWith(source.slice(start, offset))
  ) {
    return undefined;
  }
  return { start, end, text, filterText: oldText };
}

/** Reuse only an exact typed prefix of an insertion; every other source edit invalidates it. */
export function reuseStudioInlineInsertion(
  original: string,
  current: string,
  start: number,
  text: string,
  cursor: number
): string | undefined {
  const consumed = cursor - start;
  if (consumed < 1 || consumed >= text.length || !Number.isInteger(consumed)) {
    return undefined;
  }
  if (current !== original.slice(0, start) + text.slice(0, consumed) + original.slice(start)) {
    return undefined;
  }
  return text.slice(consumed);
}
