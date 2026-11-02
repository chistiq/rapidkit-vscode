import crypto from 'node:crypto';
import { diffLines } from 'diff';
import type { WorkspaceRepairCliFileChange } from './workspaceRepairCliClient.js';

/** Totals describe the full before/after comparison; preview size never changes the badges. */
export function summarizeStudioTextChange(input: {
  relativePath: string;
  before: string | null;
  after: string | null;
  stale?: boolean;
}): WorkspaceRepairCliFileChange {
  const changes = diffLines(input.before ?? '', input.after ?? '', { timeout: 500 });
  let addedLines = 0;
  let removedLines = 0;
  let beforeLine = 1;
  let afterLine = 1;
  const preview: WorkspaceRepairCliFileChange['diffLines'] = [];
  for (const change of changes ?? []) {
    if (change.added) {
      addedLines += change.count ?? 0;
    }
    if (change.removed) {
      removedLines += change.count ?? 0;
    }
    const lines = change.value.replace(/\n$/, '').split('\n');
    for (const content of lines) {
      if (preview.length < 400) {
        preview.push({
          type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
          content,
          ...(!change.added ? { beforeLine } : {}),
          ...(!change.removed ? { afterLine } : {}),
        });
      }
      if (!change.added) {
        beforeLine++;
      }
      if (!change.removed) {
        afterLine++;
      }
    }
  }
  const hash = (text: string | null) =>
    text === null ? null : crypto.createHash('sha256').update(text).digest('hex');
  return {
    relativePath: input.relativePath,
    status: input.before === null ? 'added' : input.after === null ? 'deleted' : 'modified',
    ...(input.before === null ? { isNewFile: true } : {}),
    beforeHash: hash(input.before),
    afterHash: hash(input.after),
    binary: false,
    stale: input.stale === true,
    ...(changes
      ? { addedLines, removedLines }
      : {
          failReason:
            'Diff computation exceeded its budget. Open the file comparison to inspect the change.',
        }),
    ...(input.stale ? { failReason: 'The file changed again after this transaction.' } : {}),
    diffLines: preview,
  };
}
