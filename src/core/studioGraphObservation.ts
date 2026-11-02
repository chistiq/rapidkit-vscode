/** Preserve complete entries and CLI coverage semantics while bounding model context.
 * A projection is not a token-savings measurement or an exhaustive graph verdict.
 */
export function projectStudioGraphObservation(raw: Record<string, unknown>, maxChars = 16000) {
  const originalChars = JSON.stringify(raw).length;
  if (originalChars <= maxChars) {
    return {
      result: raw,
      projection: {
        applied: false,
        originalChars,
        returnedChars: originalChars,
        omitted: {} as Record<string, number>,
        omittedFields: [] as string[],
      },
    };
  }
  const result = { ...raw };
  const arrays = Object.keys(raw).filter((key) => Array.isArray(raw[key]));
  const omitted: Record<string, number> = {};
  for (const key of arrays) {
    result[key] = [...(raw[key] as unknown[])];
  }
  while (JSON.stringify(result).length > maxChars) {
    const largest = arrays
      .filter((key) => (result[key] as unknown[]).length > 0)
      .sort((a, b) => JSON.stringify(result[b]).length - JSON.stringify(result[a]).length)[0];
    if (!largest) {
      break;
    }
    const entries = result[largest] as unknown[];
    const retained = Math.floor(entries.length / 2);
    omitted[largest] = (omitted[largest] ?? 0) + entries.length - retained;
    result[largest] = entries.slice(0, retained);
  }
  const omittedFields: string[] = [];
  if (JSON.stringify(result).length > maxChars) {
    for (const key of Object.keys(result).sort(
      (a, b) => JSON.stringify(result[b] ?? null).length - JSON.stringify(result[a] ?? null).length
    )) {
      if (JSON.stringify(result).length <= maxChars) {
        break;
      }
      delete result[key];
      omittedFields.push(key);
    }
  }
  return {
    result,
    projection: {
      applied: true,
      originalChars,
      returnedChars: JSON.stringify(result).length,
      omitted,
      omittedFields,
    },
  };
}
