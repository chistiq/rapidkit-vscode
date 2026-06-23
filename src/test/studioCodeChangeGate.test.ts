import { describe, expect, it } from 'vitest';

import { resolveStudioCodeChangeActionBlockReason } from '../../webview-ui/src/lib/studioCodeChangeGate';

describe('studioCodeChangeGate', () => {
  it('blocks fix-lens when analyze evidence is missing', () => {
    expect(resolveStudioCodeChangeActionBlockReason('fix-lens', null)).toContain(
      'Run workspace analyze first'
    );
  });

  it('blocks fix-lens when analyze verdict is blocked', () => {
    expect(
      resolveStudioCodeChangeActionBlockReason('fix-lens', {
        generatedAt: '2026-01-01T00:00:00.000Z',
        verdict: 'blocked',
        score: 40,
        findings: { fail: 2, warn: 0, info: 0 },
        topFindings: [],
      })
    ).toContain('Analyze evidence is blocked');
  });

  it('allows fix-lens when analyze evidence is present', () => {
    expect(
      resolveStudioCodeChangeActionBlockReason('fix-lens', {
        generatedAt: '2026-01-01T00:00:00.000Z',
        verdict: 'needs-attention',
        score: 80,
        findings: { fail: 0, warn: 1, info: 0 },
        topFindings: [],
      })
    ).toBeNull();
  });
});
