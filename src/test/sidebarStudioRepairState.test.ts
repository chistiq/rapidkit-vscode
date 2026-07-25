import { describe, expect, it } from 'vitest';
import {
  clearSidebarPendingPatches,
  readSidebarPendingPatches,
  saveSidebarPendingPatches,
} from '../core/sidebarStudioRepairState.js';

function createContext() {
  const store = new Map<string, unknown>();
  return {
    context: {
      workspaceState: {
        get: <T>(key: string) => store.get(key) as T | undefined,
        update: async (key: string, value: unknown) => void store.set(key, value),
      },
    } as never,
  };
}

describe('sidebar Studio durable repair state', () => {
  it('round-trips complete patch preimages for review and rollback after reload', async () => {
    const { context } = createContext();
    const patches = [
      {
        relativePath: 'src/a.ts',
        baseSha256: 'abc',
        isNewFile: false,
        originalContent: 'old',
        patchedContent: 'new',
        hunks: [{ startLine: 1, removedLines: ['old'], addedLines: ['new'] }],
        status: 'pending' as const,
      },
    ];
    await saveSidebarPendingPatches(context, 'session::doctor', patches);
    expect(readSidebarPendingPatches(context, 'session::doctor')).toEqual(patches);
    await clearSidebarPendingPatches(context, 'session::doctor');
    expect(readSidebarPendingPatches(context, 'session::doctor')).toBeUndefined();
  });

  it('fails closed when a pending transaction exceeds the durable limit', async () => {
    const { context } = createContext();
    await expect(
      saveSidebarPendingPatches(context, 'large', [
        {
          relativePath: 'large.txt',
          isNewFile: true,
          patchedContent: 'x'.repeat(2 * 1024 * 1024 + 1),
          hunks: [],
          status: 'pending',
        },
      ])
    ).rejects.toThrow('exceeds');
  });
});
