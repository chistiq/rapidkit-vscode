import { describe, expect, it } from 'vitest';

import { auditCountsFromReport, auditGateVerdict } from '../../scripts/npm-audit-gate.mjs';

describe('npm audit gate', () => {
  it('blocks high and critical vulnerabilities by default', () => {
    const verdict = auditGateVerdict({
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 2,
          moderate: 1,
          high: 1,
          critical: 1,
        },
      },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.level).toBe('high');
    expect(verdict.blockingSeverities).toEqual(['high', 'critical']);
    expect(verdict.blockingCount).toBe(2);
  });

  it('allows low and moderate vulnerabilities for the high/critical release gate', () => {
    const verdict = auditGateVerdict({
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 3,
          moderate: 2,
          high: 0,
          critical: 0,
        },
      },
    });

    expect(verdict.ok).toBe(true);
    expect(verdict.blockingCount).toBe(0);
  });

  it('falls back to vulnerability severity entries when metadata is absent', () => {
    const counts = auditCountsFromReport({
      vulnerabilities: {
        alpha: { severity: 'critical' },
        beta: { severity: 'high' },
        gamma: { severity: 'moderate' },
      },
    });

    expect(counts).toMatchObject({
      critical: 1,
      high: 1,
      moderate: 1,
    });
  });
});
