import { describe, expect, it } from 'vitest';
import { resolveStudioNextEdit } from '../core/studioNextEdit.js';
describe('Next edit source matching', () => {
  it('maps a bounded unique block to exact file offsets, preserving surrounding source', () => {
    const source = 'prefix\nconst x = 1;\nsuffix';
    const edit = resolveStudioNextEdit(source, 7, 20, {
      action: 'edit',
      oldText: 'x = 1',
      replacement: 'x = 2',
    })!;
    expect(source.slice(0, edit.start) + edit.replacement + source.slice(edit.end)).toBe(
      'prefix\nconst x = 2;\nsuffix'
    );
  });
  it.each(['missing', 'x'])('rejects absent or ambiguous original text: %s', (oldText) => {
    expect(() =>
      resolveStudioNextEdit('x x', 0, 3, { action: 'edit', oldText, replacement: 'y' })
    ).toThrow('one exact');
  });
  it('does not edit text that was outside model-visible context', () => {
    expect(() =>
      resolveStudioNextEdit('hidden visible', 7, 14, {
        action: 'edit',
        oldText: 'hidden',
        replacement: 'changed',
      })
    ).toThrow('one exact');
  });
  it('accepts no-op/uncertainty without creating a proposal', () => {
    expect(resolveStudioNextEdit('x', 0, 1, { action: 'none' })).toBeUndefined();
    expect(
      resolveStudioNextEdit('x', 0, 1, { action: 'edit', oldText: 'x', replacement: 'x' })
    ).toBeUndefined();
  });
  it.each([
    { action: 'edit', oldText: '', replacement: 'x' },
    { action: 'edit', oldText: 'x', replacement: 'y'.repeat(16_001) },
    { action: 'unknown' },
  ])('rejects malformed or oversized predictions', (prediction) => {
    expect(() => resolveStudioNextEdit('x', 0, 1, prediction)).toThrow('valid focused');
  });
});
