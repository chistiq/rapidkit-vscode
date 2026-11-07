import { describe, expect, it } from 'vitest';
import {
  resolveStudioInlinePrediction as resolve,
  reuseStudioInlineInsertion as reuse,
} from '../core/studioInlinePrediction.js';

describe('Stable native inline prediction constraints', () => {
  it('previews a unique current-line replacement preserving the typed prefix', () => {
    expect(
      resolve('const value = old();\n', 14, { oldText: 'old()', text: 'new()' }, true)
    ).toEqual({ start: 14, end: 19, text: 'new()', filterText: 'old()' });
    expect(
      resolve('const value = old();', 16, { oldText: 'old()', text: 'older()' }, true)?.text
    ).toBe('older()');
  });
  it('rejects disabled, ambiguous, multiline, remote and prefix-changing replacements', () => {
    const prediction = { oldText: 'old()', text: 'new()' };
    expect(resolve('old()', 0, prediction, false)).toBeUndefined();
    expect(resolve('old() + old()', 0, prediction, true)).toBeUndefined();
    expect(resolve('old()', 2, prediction, true)).toBeUndefined();
    expect(resolve('a\nold()', 0, prediction, true)).toBeUndefined();
    expect(resolve('a\nold()', 2, { oldText: 'a\nold()', text: 'b' }, true)).toBeUndefined();
  });
  it('keeps insertion semantics, newline boundaries and Unicode offsets exact', () => {
    expect(resolve('\nabc', 0, { text: 'hello' }, false)).toEqual({
      start: 0,
      end: 0,
      text: 'hello',
    });
    expect(
      resolve('\u0633\u0644\u0627\u0645 old()', 5, { oldText: 'old()', text: 'new()' }, true)?.start
    ).toBe(5);
    expect(resolve('abc', 0, { text: 'abc' }, false)).toBeUndefined();
    expect(resolve('', -1, { text: 'a' }, false)).toBeUndefined();
  });
  it('reuses exactly agreed insertion prefixes without another model request', () => {
    expect(reuse('let a = ;', 'let a = 42;', 8, '42', 9)).toBeUndefined();
    expect(reuse('let a = ;', 'let a = 4;', 8, '42', 9)).toBe('2');
    expect(reuse('let a = ;', 'let a = 5;', 8, '42', 9)).toBeUndefined();
    expect(reuse('let a = ;', 'let b = 4;', 8, '42', 9)).toBeUndefined();
    expect(reuse('let a = ;', 'let a = 42;', 8, '42', 10)).toBeUndefined();
  });
});
