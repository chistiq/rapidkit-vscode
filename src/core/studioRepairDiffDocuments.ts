import * as path from 'path';
import * as vscode from 'vscode';
import {
  readCliOwnedRepairById,
  readCliOwnedRepairFileComparison,
  resolveCliOwnedRepairFilePath,
} from './workspaceRepairCliClient.js';

/**
 * Read-only scheme that serves the exact content a CLI repair transaction
 * captured for a file, so a native comparison always shows the transaction's
 * own before/after instead of a re-derived guess.
 */
export const STUDIO_REPAIR_DIFF_SCHEME = 'workspai-repair';

type RepairDiffSide = 'before' | 'after';

type RepairDiffTarget = {
  workspacePath: string;
  transactionId: string;
  relativePath: string;
  side: RepairDiffSide;
};

export function buildStudioRepairDiffUri(target: RepairDiffTarget): vscode.Uri {
  if (!target.relativePath.trim() || path.isAbsolute(target.relativePath)) {
    throw new Error('A workspace-relative repair path is required for a comparison document.');
  }
  const query = new URLSearchParams({
    workspace: target.workspacePath,
    transaction: target.transactionId,
    side: target.side,
  });
  return vscode.Uri.from({
    scheme: STUDIO_REPAIR_DIFF_SCHEME,
    // The path keeps the real filename so the diff editor shows a readable
    // title and picks the correct language mode from the extension.
    path: `/${target.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')}`,
    query: query.toString(),
  });
}

function parseStudioRepairDiffUri(uri: vscode.Uri): RepairDiffTarget {
  const query = new URLSearchParams(uri.query);
  const workspacePath = query.get('workspace')?.trim() ?? '';
  const transactionId = query.get('transaction')?.trim() ?? '';
  const side = query.get('side') === 'after' ? 'after' : 'before';
  const relativePath = uri.path.replace(/^\/+/, '');
  if (!workspacePath || !transactionId || !relativePath) {
    throw new Error('The comparison document reference is incomplete.');
  }
  return { workspacePath, transactionId, relativePath, side };
}

/**
 * Serve transaction-owned content for comparison editors.
 *
 * Every read goes back through the CLI checkpoint reader, so checkpoint
 * integrity, realpath boundaries, and staleness stay enforced on this path
 * exactly as they are for the sidebar review payload.
 */
export function registerStudioRepairDiffContentProvider(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(STUDIO_REPAIR_DIFF_SCHEME, {
    provideTextDocumentContent: async (uri) => {
      const target = parseStudioRepairDiffUri(uri);
      const transaction = await readCliOwnedRepairById({
        workspacePath: target.workspacePath,
        transactionId: target.transactionId,
      });
      const comparison = await readCliOwnedRepairFileComparison({
        workspacePath: target.workspacePath,
        transaction,
        relativePath: target.relativePath,
      });
      const content =
        target.side === 'before' ? comparison.originalContent : comparison.patchedContent;
      if (content === undefined) {
        throw new Error(
          `Native text comparison is unavailable for binary or oversized file ${target.relativePath}.`
        );
      }
      return content;
    },
  });
}

/**
 * Resolve the two sides of one file comparison.
 *
 * The modified side prefers the real file on disk so the user can edit straight
 * from the diff. A deleted file has nothing on disk, so it falls back to the
 * transaction's own (empty) after-content rather than failing to open.
 */
export async function resolveStudioRepairComparisonUris(input: {
  workspacePath: string;
  transactionId: string;
  relativePath: string;
}): Promise<{ label: vscode.Uri; before: vscode.Uri; after: vscode.Uri }> {
  const transaction = await readCliOwnedRepairById({
    workspacePath: input.workspacePath,
    transactionId: input.transactionId,
  });
  const comparison = await readCliOwnedRepairFileComparison({
    workspacePath: input.workspacePath,
    transaction,
    relativePath: input.relativePath,
  });
  if (comparison.stale) {
    throw new Error(
      `Cannot open an exact transaction diff for ${input.relativePath}: the file changed again after ${input.transactionId}.`
    );
  }
  if (
    comparison.binary ||
    comparison.originalContent === undefined ||
    comparison.patchedContent === undefined
  ) {
    throw new Error(
      `Native text diff is unavailable for binary or oversized file ${input.relativePath}.`
    );
  }
  const absolutePath = resolveCliOwnedRepairFilePath({
    workspacePath: input.workspacePath,
    transaction,
    relativePath: input.relativePath,
  });
  const deleted = comparison.status === 'deleted';
  return {
    label: vscode.Uri.file(absolutePath),
    before: buildStudioRepairDiffUri({
      workspacePath: input.workspacePath,
      transactionId: input.transactionId,
      relativePath: input.relativePath,
      side: 'before',
    }),
    after: deleted
      ? buildStudioRepairDiffUri({
          workspacePath: input.workspacePath,
          transactionId: input.transactionId,
          relativePath: input.relativePath,
          side: 'after',
        })
      : vscode.Uri.file(absolutePath),
  };
}
