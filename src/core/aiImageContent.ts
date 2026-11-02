export type AIImageContent = { mimeType: string; base64: string };
export const AI_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export function parseAttachedImages(value: unknown): AIImageContent[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 4) {
    throw new Error('Attach at most four images.');
  }
  return collectToolImages(
    value.map((raw) => {
      const image = raw as Partial<AIImageContent> | null;
      if (
        !image ||
        typeof image.mimeType !== 'string' ||
        !AI_IMAGE_MIME_TYPES.has(image.mimeType) ||
        typeof image.base64 !== 'string' ||
        image.base64.length > 7_000_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)
      ) {
        throw new Error('Invalid image attachment.');
      }
      return { mimeType: image.mimeType, data: Buffer.from(image.base64, 'base64') };
    })
  );
}
export function collectToolImages(content: readonly unknown[]): AIImageContent[] {
  const images: AIImageContent[] = [];
  let total = 0;
  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const value = part as { mimeType?: unknown; data?: unknown };
    if (
      typeof value.mimeType !== 'string' ||
      !AI_IMAGE_MIME_TYPES.has(value.mimeType) ||
      !(value.data instanceof Uint8Array)
    ) {
      continue;
    }
    if (
      value.data.byteLength > 5 * 1024 * 1024 ||
      total + value.data.byteLength > 8 * 1024 * 1024 ||
      images.length >= 4
    ) {
      throw new Error(
        'Host image output exceeds the bounded image budget (4 images, 5 MiB each, 8 MiB total). Request a smaller image.'
      );
    }
    total += value.data.byteLength;
    images.push({ mimeType: value.mimeType, base64: Buffer.from(value.data).toString('base64') });
  }
  return images;
}
