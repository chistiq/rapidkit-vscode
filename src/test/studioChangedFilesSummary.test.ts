import { describe, expect, it } from 'vitest';

import {
  parseSidebarStudioActionProgress,
  studioFileChangeLineCounts,
  type SidebarStudioActionProgressView,
} from '../../webview-ui/src/lib/sidebarStudioActionProgress';
import { buildStudioChangedFilesSummary } from '../../webview-ui/src/lib/studioChangedFilesSummary';

function progress(input: {
  transactionId?: string;
  transactionState?: string;
  fileChanges?: SidebarStudioActionProgressView['fileChanges'];
}): SidebarStudioActionProgressView {
  return {
    action: 'apply-workspace-patch',
    status: 'done',
    title: 'Applied source edit',
    summary: 'Applied source edit',
    ...(input.transactionId && !input.transactionState ? { transactionState: 'closed' } : {}),
    ...input,
  };
}

describe('studio changed files summary', () => {
  it('uses the final host comparison instead of summing repeated edits, including after hydration', () => {
    const first = progress({
      transactionId: 'native-first',
      transactionState: 'applied',
      fileChanges: [
        { relativePath: 'setup.sh', status: 'modified', addedLines: 6, removedLines: 6 },
      ],
    });
    const second = parseSidebarStudioActionProgress({
      ...progress({ transactionId: 'native-second', transactionState: 'applied' }),
      fileChanges: [
        {
          relativePath: 'setup.sh',
          status: 'modified',
          addedLines: 14,
          removedLines: 8,
          netChange: {
            transactionIds: ['native-first', 'native-second'],
            addedLines: 18,
            removedLines: 12,
            status: 'modified',
            unchanged: false,
          },
        },
      ],
    })!;
    const summary = buildStudioChangedFilesSummary([first, second, second]);
    expect(summary).toMatchObject({ addedLines: 18, removedLines: 12, transactionCount: 2 });
    expect(summary.files).toHaveLength(1);
    const rolledBack = buildStudioChangedFilesSummary([
      first,
      second,
      progress({ transactionId: 'native-second', transactionState: 'rolled-back' }),
    ]);
    expect(rolledBack).toMatchObject({ addedLines: 6, removedLines: 6 });
    second.fileChanges![0].netChange!.unchanged = true;
    second.fileChanges![0].netChange!.addedLines = 0;
    second.fileChanges![0].netChange!.removedLines = 0;
    expect(buildStudioChangedFilesSummary([first, second]).files).toEqual([]);
  });
  it('prefers authoritative host totals over truncated preview hunks', () => {
    expect(
      studioFileChangeLineCounts({
        relativePath: 'src/big.ts',
        status: 'modified',
        addedLines: 240,
        removedLines: 31,
        diffLines: [
          { type: 'added', content: 'one' },
          { type: 'removed', content: 'two' },
        ],
      })
    ).toEqual({ added: 240, removed: 31 });
  });

  it('falls back to counting hunks when a host omits the totals', () => {
    expect(
      studioFileChangeLineCounts({
        relativePath: 'src/small.ts',
        status: 'modified',
        diffLines: [
          { type: 'added', content: 'one' },
          { type: 'added', content: 'two' },
          { type: 'removed', content: 'three' },
          { type: 'unchanged', content: 'four' },
        ],
      })
    ).toEqual({ added: 2, removed: 1 });
  });

  it('aggregates one changed-file rollup across every live transaction', () => {
    const summary = buildStudioChangedFilesSummary([
      progress({
        transactionId: 'transaction-aaaaaaaa',
        fileChanges: [
          { relativePath: 'CHANGELOG.md', status: 'modified', addedLines: 7, removedLines: 0 },
          { relativePath: 'src/core/a.ts', status: 'modified', addedLines: 12, removedLines: 10 },
        ],
      }),
      progress({
        transactionId: 'transaction-bbbbbbbb',
        fileChanges: [
          { relativePath: 'src/core/a.ts', status: 'modified', addedLines: 5, removedLines: 1 },
          { relativePath: 'src/core/b.ts', status: 'added', isNewFile: true, addedLines: 24 },
        ],
      }),
    ]);

    expect(summary.files).toEqual([
      expect.objectContaining({
        relativePath: 'CHANGELOG.md',
        added: 7,
        removed: 0,
        transactionId: 'transaction-aaaaaaaa',
      }),
      expect.objectContaining({
        relativePath: 'src/core/a.ts',
        added: 17,
        removed: 11,
        transactionId: 'transaction-bbbbbbbb',
      }),
      expect.objectContaining({ relativePath: 'src/core/b.ts', added: 24, removed: 0 }),
    ]);
    expect(summary.addedLines).toBe(48);
    expect(summary.removedLines).toBe(11);
    expect(summary.transactionCount).toBe(2);
    expect(summary.undoTransactionId).toBe('transaction-bbbbbbbb');
  });

  it('never double counts a replayed event for the same transaction', () => {
    const changed = progress({
      transactionId: 'transaction-aaaaaaaa',
      fileChanges: [
        { relativePath: 'src/core/a.ts', status: 'modified', addedLines: 9, removedLines: 4 },
      ],
    });
    const summary = buildStudioChangedFilesSummary([changed, changed, changed]);
    expect(summary.files).toEqual([
      expect.objectContaining({ relativePath: 'src/core/a.ts', added: 9, removed: 4 }),
    ]);
    expect(summary.transactionCount).toBe(1);
  });

  it('withdraws a rolled-back transaction instead of reporting reverted files as changed', () => {
    const summary = buildStudioChangedFilesSummary([
      progress({
        transactionId: 'transaction-aaaaaaaa',
        fileChanges: [
          { relativePath: 'src/core/a.ts', status: 'modified', addedLines: 9, removedLines: 4 },
        ],
      }),
      progress({
        transactionId: 'transaction-bbbbbbbb',
        fileChanges: [
          { relativePath: 'src/core/b.ts', status: 'modified', addedLines: 3, removedLines: 1 },
        ],
      }),
      progress({
        transactionId: 'transaction-aaaaaaaa',
        transactionState: 'rolled-back',
        fileChanges: [
          { relativePath: 'src/core/a.ts', status: 'modified', addedLines: 9, removedLines: 4 },
        ],
      }),
    ]);

    expect(summary.files.map((file) => file.relativePath)).toEqual(['src/core/b.ts']);
    expect(summary.addedLines).toBe(3);
    expect(summary.transactionCount).toBe(1);
    expect(summary.undoTransactionId).toBe('transaction-bbbbbbbb');
  });

  it('withdraws a rolled-back transaction even when its final receipt omits file details', () => {
    const summary = buildStudioChangedFilesSummary([
      progress({
        transactionId: 'native-edit',
        transactionState: 'applied',
        fileChanges: [
          { relativePath: 'file.py', status: 'added', addedLines: 133, removedLines: 0 },
        ],
      }),
      progress({ transactionId: 'native-edit', transactionState: 'rolled-back' }),
    ]);
    expect(summary.files).toEqual([]);
    expect(summary.addedLines).toBe(0);
    expect(summary.undoTransactionId).toBeUndefined();
  });

  it('marks stale, binary, and failed files as not comparable so review cannot promise an exact diff', () => {
    const summary = buildStudioChangedFilesSummary([
      progress({
        transactionId: 'transaction-aaaaaaaa',
        fileChanges: [
          { relativePath: 'src/exact.ts', status: 'modified', addedLines: 1 },
          { relativePath: 'src/stale.ts', status: 'modified', stale: true, addedLines: 1 },
          { relativePath: 'assets/logo.png', status: 'modified', binary: true },
          {
            relativePath: 'src/blocked.ts',
            status: 'modified',
            failReason: 'Binary or oversized files use hash-only review.',
          },
        ],
      }),
    ]);

    expect(
      summary.files.map((file) => ({ path: file.relativePath, comparable: file.comparable }))
    ).toEqual([
      { path: 'assets/logo.png', comparable: false },
      { path: 'src/blocked.ts', comparable: false },
      { path: 'src/exact.ts', comparable: true },
      { path: 'src/stale.ts', comparable: false },
    ]);
  });

  it('ignores activity that carries no transaction, so undo always targets a real transaction', () => {
    const summary = buildStudioChangedFilesSummary([
      progress({
        fileChanges: [{ relativePath: 'src/core/a.ts', status: 'modified', addedLines: 4 }],
      }),
      progress({ transactionId: 'transaction-aaaaaaaa' }),
    ]);

    expect(summary.files).toEqual([]);
    expect(summary.undoTransactionId).toBeUndefined();
    expect(summary.transactionCount).toBe(0);
  });

  it('does not expose an intermediate applied transaction as reviewable or undoable', () => {
    const summary = buildStudioChangedFilesSummary([
      progress({
        transactionId: 'transaction-pending',
        transactionState: 'executing',
        fileChanges: [{ relativePath: 'src/pending.ts', status: 'modified', addedLines: 1 }],
      }),
    ]);

    expect(summary.files).toEqual([]);
    expect(summary.undoTransactionId).toBeUndefined();
  });

  it('parses host line numbers and totals into the progress view', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-workspace-patch',
        status: 'done',
        fileChanges: [
          {
            relativePath: 'src/core/a.ts',
            status: 'modified',
            addedLines: 2,
            removedLines: 1,
            diffLines: [
              { type: 'unchanged', content: 'context', beforeLine: 154, afterLine: 154 },
              { type: 'removed', content: 'old', beforeLine: 155 },
              { type: 'added', content: 'new', afterLine: 155 },
            ],
          },
        ],
      })?.fileChanges
    ).toEqual([
      {
        relativePath: 'src/core/a.ts',
        status: 'modified',
        addedLines: 2,
        removedLines: 1,
        diffLines: [
          { type: 'unchanged', content: 'context', beforeLine: 154, afterLine: 154 },
          { type: 'removed', content: 'old', beforeLine: 155 },
          { type: 'added', content: 'new', afterLine: 155 },
        ],
      },
    ]);
  });
});
