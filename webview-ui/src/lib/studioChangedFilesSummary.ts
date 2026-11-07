import type {
  SidebarStudioActionProgressView,
  SidebarStudioFileChangeView,
} from './sidebarStudioActionProgress';
import {
  studioFileChangeLineCounts,
  studioFileChangeHasLineCounts,
} from './sidebarStudioActionProgress';

export type StudioChangedFileSummaryEntry = {
  relativePath: string;
  workspaceId?: string;
  workspaceName?: string;
  binary?: boolean;
  afterBytes?: number;
  status: string;
  added: number;
  removed: number;
  /** Latest CLI transaction that still owns a live change for this file. */
  transactionId: string;
  /** True when an exact before/after comparison is available for this file. */
  comparable: boolean;
  countsKnown?: boolean;
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
  unknownFileCount?: number;
};

type FileContribution = {
  netChange?: SidebarStudioFileChangeView['netChange'];
  relativePath: string;
  workspaceId?: string;
  workspaceName?: string;
  binary?: boolean;
  afterBytes?: number;
  added: number;
  removed: number;
  status: string;
  comparable: boolean;
  countsKnown?: boolean;
  failReason?: string;
  order: number;
};

function isComparable(file: SidebarStudioFileChangeView): boolean {
  return (
    file.stale !== true &&
    (file.binary !== true || file.byteComparison === true) &&
    !file.failReason
  );
}

/**
 * Roll every CLI-owned repair transaction in a session up into one changed-file
 * summary.
 *
 * Contributions are keyed by file and transaction so a replayed or repeated
 * event for the same transaction cannot double-count, while two transactions
 * touching the same file use the host's net diff when its complete chain is live. A
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
    if (!transactionId) {
      continue;
    }
    order += 1;
    if (entry.transactionState === 'rolled-back') {
      rolledBackTransactions.add(transactionId);
      continue;
    }
    if (!entry.fileChanges?.length) {
      continue;
    }
    // A durable transaction is reviewable and undoable only after the CLI has
    // closed it. Applied/running/failed snapshots are intermediate control
    // state and must never survive hydration as a live change summary.
    if (
      entry.transactionState !== 'closed' &&
      !(transactionId.startsWith('scaffold-') && entry.transactionState === 'observed') &&
      !(transactionId.startsWith('native-') && entry.transactionState === 'applied')
    ) {
      continue;
    }
    liveTransactionOrder.set(transactionId, order);
    for (const file of entry.fileChanges) {
      const relativePath = file.relativePath.trim();
      if (!relativePath) {
        continue;
      }
      const counts = studioFileChangeLineCounts(file);
      const key = file.workspaceId ? `${file.workspaceId}:${relativePath}` : relativePath;
      const perTransaction = contributions.get(key) ?? new Map<string, FileContribution>();
      perTransaction.set(transactionId, {
        relativePath,
        ...(file.binary ? { binary: true, afterBytes: file.afterBytes } : {}),
        ...(file.workspaceId
          ? { workspaceId: file.workspaceId, workspaceName: file.workspaceName }
          : {}),
        added: counts.added,
        removed: counts.removed,
        status: file.status,
        ...(file.netChange ? { netChange: file.netChange } : {}),
        ...(!studioFileChangeHasLineCounts(file) ? { countsKnown: false } : {}),
        comparable: isComparable(file),
        ...(file.failReason ? { failReason: file.failReason } : {}),
        order,
      });
      contributions.set(key, perTransaction);
    }
  }

  const files: StudioChangedFileSummaryEntry[] = [];
  const liveTransactions = new Set<string>();

  for (const perTransaction of contributions.values()) {
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
    const net = latest[1].netChange;
    const useNet =
      net &&
      latest[1].comparable &&
      net.transactionIds.includes(latest[0]) &&
      !net.transactionIds.some((id) => rolledBackTransactions.has(id));
    const uncovered = useNet ? live.filter(([id]) => !net.transactionIds.includes(id)) : live;
    if (useNet && net.unchanged && !uncovered.length) {
      continue;
    }
    files.push({
      relativePath: latest[1].relativePath,
      ...(latest[1].binary ? { binary: true, afterBytes: latest[1].afterBytes } : {}),
      ...(latest[1].workspaceId
        ? { workspaceId: latest[1].workspaceId, workspaceName: latest[1].workspaceName }
        : {}),
      status: useNet ? net.status : latest[1].status,
      added:
        (useNet ? net.addedLines : 0) +
        uncovered.reduce((total, [, contribution]) => total + contribution.added, 0),
      removed:
        (useNet ? net.removedLines : 0) +
        uncovered.reduce((total, [, contribution]) => total + contribution.removed, 0),
      transactionId: latest[0],
      comparable: latest[1].comparable,
      ...(uncovered.some(([, entry]) => entry.countsKnown === false) ? { countsKnown: false } : {}),
      ...(latest[1].failReason ? { failReason: latest[1].failReason } : {}),
    });
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const undoTransactionId = [...liveTransactions]
    .filter((id) => !id.startsWith('scaffold-'))
    .sort(
      (left, right) =>
        (liveTransactionOrder.get(right) ?? 0) - (liveTransactionOrder.get(left) ?? 0)
    )[0];

  return {
    files,
    addedLines: files.reduce((total, file) => total + file.added, 0),
    removedLines: files.reduce((total, file) => total + file.removed, 0),
    ...(undoTransactionId ? { undoTransactionId } : {}),
    transactionCount: liveTransactions.size,
    ...(files.some((file) => file.countsKnown === false)
      ? { unknownFileCount: files.filter((file) => file.countsKnown === false).length }
      : {}),
  };
}
