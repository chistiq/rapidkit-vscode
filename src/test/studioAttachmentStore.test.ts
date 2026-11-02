import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioAttachmentStore } from '../core/studioAttachmentStore.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-attachments-'));
  roots.push(root);
  return { root, store: new StudioAttachmentStore(root) };
}
describe('Durable chat attachments', () => {
  it('restores text and image bytes across host instances without crossing chat owners', async () => {
    const { root, store } = await setup();
    const images = [{ mimeType: 'image/png', base64: 'aW1hZ2U=' }];
    await store.save('chat-a', 'turn-12345678', 'Attached document content', images);
    expect(await new StudioAttachmentStore(root).read('chat-a', 'turn-12345678')).toEqual({
      text: 'Attached document content',
      images,
    });
    await expect(store.read('chat-b', 'turn-12345678')).rejects.toThrow();
    await expect(store.read('chat-a', '../../outside')).rejects.toThrow();
    await store.delete('chat-a');
    await expect(store.read('chat-a', 'turn-12345678')).rejects.toThrow();
  });
  it('rejects changed content and symbolic-link records', async () => {
    const { root, store } = await setup();
    await store.save('chat', 'turn-12345678', 'original', []);
    const base = path.join(root, 'assistant-attachments');
    const owner = (await fs.readdir(base))[0];
    const file = path.join(base, owner, 'turn-12345678.json');
    const record = await fs.readJSON(file);
    record.text = 'tampered';
    await fs.writeJSON(file, record);
    await expect(store.read('chat', 'turn-12345678')).rejects.toThrow('integrity');
    await fs.remove(file);
    await fs.outputJSON(path.join(root, 'outside.json'), record);
    await fs.symlink(path.join(root, 'outside.json'), file);
    await expect(store.read('chat', 'turn-12345678')).rejects.toThrow('invalid');
  });
});
