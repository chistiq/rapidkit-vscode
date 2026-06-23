import { describe, expect, it } from 'vitest';

import {
  formatPolicyViolation,
  normalizePolicyViolations,
  summarizePolicyViolations,
} from '../core/workspacePolicyViolations';
import { extractBlockersFromReport } from '../core/dashboardReportRegistry';

describe('normalizePolicyViolations', () => {
  it('normalizes well-formed violations and applies defaults', () => {
    const result = normalizePolicyViolations([
      {
        source: 'contract',
        severity: 'warning',
        code: 'naming',
        message: 'bad name',
        target: 'api',
      },
      { code: 'x', message: 'm' },
    ]);
    expect(result).toEqual([
      {
        source: 'contract',
        severity: 'warning',
        code: 'naming',
        message: 'bad name',
        target: 'api',
      },
      { source: 'model', severity: 'error', code: 'x', message: 'm', target: undefined },
    ]);
  });

  it('drops empty entries and non-arrays', () => {
    expect(normalizePolicyViolations(undefined)).toEqual([]);
    expect(normalizePolicyViolations([{}, null, 'x'])).toEqual([]);
  });
});

describe('formatPolicyViolation', () => {
  it('formats with and without target', () => {
    expect(
      formatPolicyViolation({ source: 'model', severity: 'error', code: 'dep', message: 'cycle' })
    ).toBe('policy.dep: cycle');
    expect(
      formatPolicyViolation({
        source: 'contract',
        severity: 'error',
        code: 'dep',
        message: 'cycle',
        target: 'web',
      })
    ).toBe('policy.dep: cycle (web)');
  });
});

describe('summarizePolicyViolations', () => {
  it('treats error-severity violations as persistent blockers even in warn mode', () => {
    const summary = summarizePolicyViolations({
      policyMode: 'warn',
      policyViolations: [
        { source: 'model', severity: 'error', code: 'cycle', message: 'dependency cycle' },
        { source: 'contract', severity: 'warning', code: 'style', message: 'naming' },
      ],
      blockingReasons: [],
    });
    expect(summary.mode).toBe('warn');
    expect(summary.errors).toBe(1);
    expect(summary.warnings).toBe(1);
    expect(summary.blockers).toEqual(['policy.cycle: dependency cycle']);
  });

  it('merges blockingReasons with policy error labels and dedupes', () => {
    const summary = summarizePolicyViolations({
      policyMode: 'enforce',
      policyViolations: [
        { source: 'model', severity: 'error', code: 'cycle', message: 'dependency cycle' },
      ],
      blockingReasons: ['policy.cycle: dependency cycle', 'missing required evidence: tests'],
    });
    expect(summary.blockers).toEqual([
      'policy.cycle: dependency cycle',
      'missing required evidence: tests',
    ]);
  });

  it('returns an empty summary for missing input', () => {
    expect(summarizePolicyViolations(null)).toEqual({
      mode: null,
      violations: [],
      errors: 0,
      warnings: 0,
      blockers: [],
    });
  });
});

describe('extractBlockersFromReport workspace-verify', () => {
  it('returns policy blockers when present', () => {
    const blockers = extractBlockersFromReport('workspace-verify', {
      policyMode: 'warn',
      policyViolations: [
        { source: 'model', severity: 'error', code: 'cycle', message: 'dependency cycle' },
      ],
      blockingReasons: [],
    });
    expect(blockers).toEqual(['policy.cycle: dependency cycle']);
  });

  it('falls back to blockingReasons then missingEvidence', () => {
    expect(
      extractBlockersFromReport('workspace-verify', {
        blockingReasons: ['gate failed'],
      })
    ).toEqual(['gate failed']);
    expect(
      extractBlockersFromReport('workspace-verify', {
        missingEvidence: ['tests'],
      })
    ).toEqual(['tests']);
  });
});
