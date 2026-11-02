import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioHostToolOutputStore } from '../core/studioHostToolOutputStore.js';

describe('Durable host output ownership and lifecycle', () => {
  let root: string;
  const ref = () => `host-output-${crypto.randomUUID()}`;
  const file = (owner: string, id: string) =>
    path.join(
      root,
      'assistant-tool-outputs',
      crypto.createHash('sha256').update(owner).digest('hex'),
      `${id}.json`
    );
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'host-output-store-'));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await fs.remove(root);
  });
  it('reads from a new instance, isolates owners, and deletes one chat without affecting others', async () => {
    const id = ref();
    const other = ref();
    const store = new StudioHostToolOutputStore(root);
    await store.save('a', id, 'Long report', 11);
    await store.save('b', other, 'Other', 5);
    expect(await new StudioHostToolOutputStore(root).read('a', id)).toEqual({
      text: 'Long report',
      totalChars: 11,
    });
    await expect(store.read('b', id)).rejects.toThrow();
    await expect(store.read('a', '../escape')).rejects.toThrow();
    await store.delete('a');
    await expect(store.read('a', id)).rejects.toThrow();
    expect((await store.read('b', other)).text).toBe('Other');
  });
  it('rejects tampered and symbolic-link records', async () => {
    const store = new StudioHostToolOutputStore(root);
    const id = ref();
    await store.save('a', id, 'Report', 6);
    const record = await fs.readJSON(file('a', id));
    await fs.writeJSON(file('a', id), { ...record, text: 'Changed' });
    await expect(store.read('a', id)).rejects.toThrow('integrity');
    await fs.remove(file('a', id));
    const outside = path.join(root, 'outside.json');
    await fs.writeJSON(outside, record);
    await fs.symlink(outside, file('a', id));
    await expect(store.read('a', id)).rejects.toThrow('Invalid');
  });
  it('expires old records and retains only eight outputs per owner', async () => {
    const store = new StudioHostToolOutputStore(root);
    const first = ref();
    await store.save('a', first, 'Report', 6);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 24 * 3600 * 1000);
    await expect(store.read('a', first)).rejects.toThrow('retention');
    vi.useRealTimers();
    for (let at = 0; at < 9; at++) await store.save('a', ref(), 'Report', 6);
    expect(await fs.readdir(path.dirname(file('a', first)))).toHaveLength(8);
    await expect(store.read('a', first)).rejects.toThrow();
  });
  it('persists images separately from events and preserves ownership, integrity and deletion after reload', async () => {
    const store = new StudioHostToolOutputStore(root);
    const id = ref();
    const images = [
      { mimeType: 'image/png', base64: Buffer.from('fixture image bytes').toString('base64') },
    ];
    await store.save('a', id, '', 0, images);
    const reloaded = new StudioHostToolOutputStore(root);
    expect(await reloaded.read('a', id)).toMatchObject({ images });
    expect(await reloaded.list('a')).toEqual([
      { outputRef: id, retainedChars: 0, totalChars: 0, imageCount: 1 },
    ]);
    await expect(reloaded.read('b', id)).rejects.toThrow();
    const record = await fs.readJSON(file('a', id));
    record.images[0].base64 = Buffer.from('changed image').toString('base64');
    await fs.writeJSON(file('a', id), record);
    await expect(reloaded.read('a', id)).rejects.toThrow('integrity');
    await store.save('a', id, '', 0, images);
    await store.delete('a');
    await expect(reloaded.read('a', id)).rejects.toThrow();
  });
  it('rejects invalid images and aggregate image budgets without leaving a saved record', async () => {
    const store = new StudioHostToolOutputStore(root);
    await expect(
      store.save('a', ref(), '', 0, [{ mimeType: 'text/html', base64: 'YQ==' }])
    ).rejects.toThrow('Invalid image');
    await expect(
      store.save(
        'a',
        ref(),
        '',
        0,
        Array.from({ length: 3 }, () => ({
          mimeType: 'image/png',
          base64: Buffer.alloc(3 * 1024 * 1024).toString('base64'),
        }))
      )
    ).rejects.toThrow('image budget');
    expect(await store.list('a')).toEqual([]);
  });
  it('rejects a redirected storage root during write, read, list and deletion', async () => {
    const outside = path.join(root, 'outside');
    await fs.ensureDir(outside);
    await fs.writeFile(path.join(outside, 'keep.txt'), 'keep');
    await fs.symlink(outside, path.join(root, 'assistant-tool-outputs'));
    const store = new StudioHostToolOutputStore(root);
    await expect(store.save('a', ref(), 'text', 4)).rejects.toThrow('storage root');
    await expect(store.list('a')).rejects.toThrow('storage root');
    await expect(store.read('a', ref())).rejects.toThrow('storage root');
    await expect(store.delete('a')).rejects.toThrow('storage root');
    expect(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
