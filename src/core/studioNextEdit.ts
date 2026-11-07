/** Resolve a prediction against exactly the bounded source the model saw. */
export function resolveStudioNextEdit(
  source: string,
  contextStart: number,
  contextEnd: number,
  prediction: Record<string, unknown>
): { start: number; end: number; replacement: string } | undefined {
  if (prediction.action === 'none') {
    return undefined;
  }
  const { oldText, replacement } = prediction;
  if (
    prediction.action !== 'edit' ||
    typeof oldText !== 'string' ||
    !oldText ||
    oldText.length > 16_000 ||
    typeof replacement !== 'string' ||
    replacement.length > 16_000
  ) {
    throw new Error('The model did not return a valid focused next edit.');
  }
  const shown = source.slice(contextStart, contextEnd);
  const at = shown.indexOf(oldText);
  if (at < 0 || shown.indexOf(oldText, at + 1) >= 0) {
    throw new Error(
      'The predicted edit must match one exact source block in the displayed context.'
    );
  }
  if (oldText === replacement) {
    return undefined;
  }
  return { start: contextStart + at, end: contextStart + at + oldText.length, replacement };
}

/** Rebase only an unchanged, unique reviewed block with unchanged local anchors.
 * Unrelated typing may shift it; changes to its body/context require a fresh proposal. */
export function rebaseStudioNextEdit(
  original: string,
  current: string,
  edit: {
    start: number;
    end: number;
    replacement: string;
  }
): { start: number; end: number; replacement: string } | undefined {
  if (
    !Number.isSafeInteger(edit.start) ||
    !Number.isSafeInteger(edit.end) ||
    edit.start < 0 ||
    edit.end <= edit.start ||
    edit.end > original.length
  ) {
    return undefined;
  }
  if (original === current) {
    return edit;
  }
  const oldText = original.slice(edit.start, edit.end);
  const before = original.slice(Math.max(0, edit.start - 64), edit.start);
  const after = original.slice(edit.end, Math.min(original.length, edit.end + 64));
  const block = before + oldText + after;
  const originalAt = Math.max(0, edit.start - 64);
  if (original.indexOf(block) !== originalAt || original.indexOf(block, originalAt + 1) >= 0) {
    return undefined;
  }
  const at = current.indexOf(block);
  if (at < 0 || current.indexOf(block, at + 1) >= 0) {
    return undefined;
  }
  const start = at + before.length;
  return { start, end: start + oldText.length, replacement: edit.replacement };
}
