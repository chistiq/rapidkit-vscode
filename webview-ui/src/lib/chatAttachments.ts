export type ChatAttachment = {
  name: string;
  text?: string;
  image?: { mimeType: string; base64: string };
};
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export async function readChatAttachments(
  files: File[],
  current: ChatAttachment[] = []
): Promise<ChatAttachment[]> {
  if (current.length + files.length > 4) {
    throw new Error('Attach at most four files.');
  }
  const next = [...current];
  for (const file of files) {
    if (IMAGE_TYPES.has(file.type)) {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(`${file.name}: images must be at most 5 MiB.`);
      }
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      });
      next.push({
        name: file.name,
        image: { mimeType: file.type, base64: url.slice(url.indexOf(',') + 1) },
      });
    } else {
      if (file.size > 32 * 1024) {
        throw new Error(`${file.name}: text attachments must be at most 32 KiB.`);
      }
      const text = await file.text();
      if (text.includes('\0')) {
        throw new Error(`${file.name}: attach text or a supported image.`);
      }
      next.push({ name: file.name, text });
    }
  }
  const bytes = next.reduce(
    (sum, entry) =>
      sum +
      (entry.image
        ? (entry.image.base64.length * 3) / 4
        : new TextEncoder().encode(entry.text ?? '').length),
    0
  );
  if (bytes > 8 * 1024 * 1024) {
    throw new Error('Attachments exceed 8 MiB total.');
  }
  if (next.reduce((sum, entry) => sum + (entry.text?.length ?? 0), 0) > 64_000) {
    throw new Error('Text attachments exceed 64000 characters. Attach a smaller selection.');
  }
  return next;
}
export function requestWithAttachments(text: string, attachments: ChatAttachment[]): string {
  const documents = attachments
    .filter((entry) => entry.text !== undefined)
    .map((entry) => `Attached file: ${entry.name}\n<attachment>\n${entry.text}\n</attachment>`);
  return [
    text || 'Inspect the attached files.',
    ...documents,
    ...attachments.filter((entry) => entry.image).map((entry) => `Attached image: ${entry.name}`),
  ].join('\n\n');
}
