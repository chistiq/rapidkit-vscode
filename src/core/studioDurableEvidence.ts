import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';

/** Keep receipt structure and paging metadata, never persist source bodies or image bytes. */
export function studioDurableEventValue(value: unknown, depth = 0): unknown {
  if (depth > 12) {
    return '[depth-limited; inspect a narrower current result]';
  }
  if (typeof value === 'string') {
    const redacted = redactLocalPathsForConsumer(value);
    let end = 2_000;
    if (/[\uD800-\uDBFF]/.test(redacted[end - 1] ?? '')) {
      end--;
    }
    return redacted.length > end ? `${redacted.slice(0, end)}…` : redacted;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => studioDurableEventValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/^(?:fileChanges|diffLines|hunks|images|base64)$/i.test(key))
    .slice(0, 80);
  const truncated = entries
    .filter(
      ([key, entry]) =>
        !/^(?:content|originalContent|patchedContent|oldText|newText)$/i.test(key) &&
        ((typeof entry === 'string' && redactLocalPathsForConsumer(entry).length > 2_000) ||
          (Array.isArray(entry) && entry.length > 50))
    )
    .map(([key]) => key);
  return {
    ...Object.fromEntries(
      entries.map(([key, entry]) => [
        key,
        /^(?:content|originalContent|patchedContent|oldText|newText)$/i.test(key)
          ? '[omitted from durable session]'
          : studioDurableEventValue(entry, depth + 1),
      ])
    ),
    ...(entries.some(([key]) => key === 'content') ? { contentOmitted: true } : {}),
    ...(truncated.length ? { durableTruncatedFields: truncated } : {}),
  };
}
