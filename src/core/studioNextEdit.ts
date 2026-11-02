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
