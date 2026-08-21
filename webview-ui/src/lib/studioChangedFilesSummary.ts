import type {
  SidebarStudioActionProgressView,
  SidebarStudioFileChangeView,
} from './sidebarStudioActionProgress';
import { studioFileChangeLineCounts } from './sidebarStudioActionProgress';

export type StudioChangedFileSummaryEntry = {
  relativePath: string;
  status: string;
  added: number;
  removed: number;
  /** Latest CLI transaction that still owns a live change for this file. */
  transactionId: string;
  /** True when an exact before/after comparison is available for this file. */
  comparable: boolean;
  failReason?: string;
};

export type StudioChangedFilesSummary = {
  files: StudioChangedFileSummaryEntry[];
  addedLines: number;
  removedLines: number;
  /** Most recent transaction that can still be reverted, when any. */
  undoTransactionId?: string;
  /** Live transactions contributing to this summary. */
  transactionCount: number;
};

type FileContribution = {
  added: number;
  removed: number;
  status: string;
  comparable: boolean;
  failReason?: string;
  order: number;
};

function isComparable(file: SidebarStudioFileChangeView): boolean {
  return file.stale !== true && file.binary !== true && !file.failReason;
}

/**
 * Roll every CLI-owned repair transaction in a session up into one changed-file
 * summary.
 *
 * Contributions are keyed by file and transaction so a replayed or repeated
 * event for the same transaction cannot double-count, while two transactions
 * touching the same file still sum into the cumulative work the user sees. A
 * transaction that reached `rolled-back` withdraws its own contributions
 * instead of leaving reverted files in the summary.
 */
export function buildStudioChangedFilesSummary(
  timeline: readonly SidebarStudioActionProgressView[]
): StudioChangedFilesSummary {
  const contributions = new Map<string, Map<string, FileContribution>>();
  const rolledBackTransactions = new Set<string>();
  const liveTransactionOrder = new Map<string, number>();
  let order = 0;

  for (const entry of timeline) {
    const transactionId = entry.transactionId?.trim();
    if (!transactionId || !entry.fileChanges?.length) {
      continue;
    }
    order += 1;
    if (entry.transactionState === 'rolled-back') {
      rolledBackTransactions.add(transactionId);
      continue;
    }
    liveTransactionOrder.set(transactionId, order);
    for (const file of entry.fileChanges) {
      const relativePath = file.relativePath.trim();
      if (!relativePath) {
        continue;
      }
      const counts = studioFileChangeLineCounts(file);
      const perTransaction = contributions.get(relativePath) ?? new Map<string, FileContribution>();
      perTransaction.set(transactionId, {
        added: counts.added,
        removed: counts.removed,
        status: file.status,
        comparable: isComparable(file),
        ...(file.failReason ? { failReason: file.failReason } : {}),
        order,
      });
      contributions.set(relativePath, perTransaction);
    }
  }

  const files: StudioChangedFileSummaryEntry[] = [];
  const liveTransactions = new Set<string>();

  for (const [relativePath, perTransaction] of contributions) {
    const live = [...perTransaction.entries()].filter(
      ([transactionId]) => !rolledBackTransactions.has(transactionId)
    );
    if (live.length === 0) {
      continue;
    }
    const latest = live.reduce((best, candidate) =>
      candidate[1].order >= best[1].order ? candidate : best
    );
    for (const [transactionId] of live) {
      liveTransactions.add(transactionId);
    }
    files.push({
      relativePath,
      status: latest[1].status,
      added: live.reduce((total, [, contribution]) => total + contribution.added, 0),
      removed: live.reduce((total, [, contribution]) => total + contribution.removed, 0),
      transactionId: latest[0],
      comparable: latest[1].comparable,
      ...(latest[1].failReason ? { failReason: latest[1].failReason } : {}),
    });
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const undoTransactionId = [...liveTransactions].sort(
    (left, right) => (liveTransactionOrder.get(right) ?? 0) - (liveTransactionOrder.get(left) ?? 0)
  )[0];

  return {
    files,
    addedLines: files.reduce((total, file) => total + file.added, 0),
    removedLines: files.reduce((total, file) => total + file.removed, 0),
    ...(undoTransactionId ? { undoTransactionId } : {}),
    transactionCount: liveTransactions.size,
  };
}
