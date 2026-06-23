import { describe, expect, it } from 'vitest';

import { collectDoctorProjectRecordBlockers } from '../core/doctorEvidenceBlockers';

describe('doctorEvidenceBlockers', () => {
  it('collects issues, probe warnings, and npm audit vulnerabilities', () => {
    const blockers = collectDoctorProjectRecordBlockers({
      issues: ['Missing dependency lockfile'],
      vulnerabilities: 2,
      probes: [
        {
          id: 'frontend-script-test',
          label: 'test script surface',
          status: 'warn',
          reason: 'No test script detected for Next.js.',
          recommendation: 'Add a "test" script to package.json.',
        },
        {
          id: 'frontend-lockfile-integrity',
          label: 'Frontend lockfile integrity',
          status: 'pass',
          reason: 'Node lockfile detected.',
        },
      ],
    });

    expect(blockers).toEqual([
      'Missing dependency lockfile',
      '2 npm security vulnerabilities reported',
      'test script surface: No test script detected for Next.js.',
    ]);
  });
});
