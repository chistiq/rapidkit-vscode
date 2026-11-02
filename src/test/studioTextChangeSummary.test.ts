import { describe, expect, it } from 'vitest';
import { summarizeStudioTextChange } from '../core/studioTextChangeSummary.js';

describe('Authoritative source change totals', () => {
  it('counts exact changes without input hunks, including new and deleted files', () => {
    expect(
      summarizeStudioTextChange({
        relativePath: 'a',
        before: 'keep\nold\nkeep\n',
        after: 'keep\nnew\nkeep\n',
      })
    ).toMatchObject({ addedLines: 1, removedLines: 1 });
    expect(
      summarizeStudioTextChange({ relativePath: 'a', before: null, after: 'first\nlast' })
    ).toMatchObject({ status: 'added', addedLines: 2, removedLines: 0 });
    expect(
      summarizeStudioTextChange({ relativePath: 'a', before: 'first\nlast\n', after: null })
    ).toMatchObject({ status: 'deleted', addedLines: 0, removedLines: 2 });
  });
  it('keeps full totals when the preview is bounded and ignores unchanged middle lines', () => {
    const before = Array.from({ length: 1000 }, (_, at) => `line ${at}\n`).join('');
    const after = before.replace('line 1\n', 'changed 1\n').replace('line 999\n', 'changed 999\n');
    expect(summarizeStudioTextChange({ relativePath: 'a', before, after })).toMatchObject({
      addedLines: 2,
      removedLines: 2,
    });
    const added = summarizeStudioTextChange({ relativePath: 'b', before: null, after: before });
    expect(added.addedLines).toBe(1000);
    expect(added.diffLines).toHaveLength(400);
  });
});
