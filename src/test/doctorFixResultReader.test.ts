import { describe, expect, it } from 'vitest';

import {
  extractDoctorFixResult,
  isDoctorFixExecutionResult,
} from '../core/doctorFixResultReader.js';

describe('doctorFixResultReader', () => {
  it('requires structured fixResult for enterprise doctor-fix closure', () => {
    expect(
      isDoctorFixExecutionResult({
        schemaVersion: 'rapidkit-doctor-fix-result-v1',
        appliedFixes: [],
        remainingBlockers: [],
        verifyRecommended: 'npx rapidkit workspace verify --json',
      })
    ).toBe(true);

    expect(
      extractDoctorFixResult({
        fixResult: {
          schemaVersion: 'rapidkit-doctor-fix-result-v1',
          appliedFixes: [{ path: '.env', action: 'doctor-fix', outcome: 'applied' }],
          remainingBlockers: ['still blocked'],
          verifyRecommended: 'npx rapidkit workspace verify --json',
        },
      })?.remainingBlockers
    ).toEqual(['still blocked']);

    expect(extractDoctorFixResult({ verdict: 'ok' })).toBeNull();
  });
});
