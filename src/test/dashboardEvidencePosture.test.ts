import { describe, expect, it } from 'vitest';
import {
  dashboardEvidencePostureLabel,
  dashboardEvidencePostureTone,
  resolveDashboardEvidencePosture,
} from '../contracts/dashboardEvidencePosture';

describe('dashboard evidence posture contract', () => {
  it.each([
    [{ status: 'pass' as const }, 'healthy'],
    [{ status: 'pass' as const, stale: true }, 'attention'],
    [{ status: 'warn' as const }, 'attention'],
    [{ status: 'missing' as const }, 'attention'],
    [{ status: 'fail' as const, blocking: false }, 'attention'],
    [{ status: 'fail' as const, blocking: true }, 'blocked'],
    [{ status: 'warn' as const, blocking: true }, 'blocked'],
  ])('resolves %o to %s', (input, expected) => {
    expect(resolveDashboardEvidencePosture(input)).toBe(expected);
  });

  it('keeps labels and visual tones bound to the same three states', () => {
    expect(dashboardEvidencePostureLabel('blocked')).toBe('Blocked');
    expect(dashboardEvidencePostureTone('blocked')).toBe('danger');
    expect(dashboardEvidencePostureLabel('attention')).toBe('Needs attention');
    expect(dashboardEvidencePostureTone('attention')).toBe('warn');
    expect(dashboardEvidencePostureLabel('healthy')).toBe('Healthy');
    expect(dashboardEvidencePostureTone('healthy')).toBe('good');
  });
});
