import { describe, expect, it } from 'vitest';
import {
  getAIOutputQualityContract,
  validateAIOutputQuality,
  type AIOutputScenario,
} from '../core/aiOutputQuality';

type GoldenCase = {
  name: string;
  scenario: AIOutputScenario;
  output: string;
};

const ACCEPTED_OUTPUTS: GoldenCase[] = [
  {
    name: 'ask output leads with answer, evidence, next step, verification, and assumptions',
    scenario: 'ask',
    output: [
      '## Answer',
      'Use project-level verification first because current evidence only covers the selected FastAPI service.',
      '## Evidence',
      'Evidence: project root is /repo/orders-api and doctor report shows warnings, not errors.',
      '## Next Safe Step',
      'Run from project root /repo/orders-api: npx rapidkit doctor project',
      '## Verification',
      'Verification: confirm doctor output has zero errors before changing code.',
      '## Assumptions',
      'Assumption: the local dependency install is current.',
    ].join('\n'),
  },
  {
    name: 'debug output gives minimal fix plan with verify and rollback path',
    scenario: 'debug',
    output: [
      '## Diagnosis',
      'The failing command exits during FastAPI import resolution.',
      '## Evidence',
      'Evidence: stderr references missing module in /repo/orders-api/src/main.py.',
      '## Fix Plan',
      'Minimal safe change: update the import path only after confirming the package name.',
      'Run from project root /repo/orders-api before edits: python -m pytest tests/test_health.py',
      '## Verify',
      'Verify: run from project root /repo/orders-api: python -m pytest tests/test_health.py',
      '## Rollback',
      'Rollback: revert the import change with git checkout -- src/main.py.',
    ].join('\n'),
  },
  {
    name: 'incident project output remains verify-first and command-scoped',
    scenario: 'incident-project',
    output: [
      'What happened: command failed during service startup with exit code 1.',
      'Why: doctor evidence points to a missing package import in the selected project.',
      'Next command: run from project root /repo/orders-api: python -m pytest tests/test_health.py',
      'Verify command: run from project root /repo/orders-api: npx rapidkit doctor project',
      'Risk and confidence: medium risk; confidence 78 based on doctor evidence.',
      'Rollback: undo any import edit with git checkout -- src/main.py.',
      'Assumptions: dependency lockfile is the active local lockfile.',
    ].join('\n'),
  },
  {
    name: 'release workspace output blocks shipping when evidence is unresolved',
    scenario: 'release-workspace',
    output: [
      'Workspace Decision: NO-GO',
      'Per-project status: orders-api NO-GO because verify pack failed; billing-api GO with current evidence.',
      'Cross-project blockers: shared auth dependency has unresolved doctor warnings.',
      'Evidence summary: verify failed for orders-api; sandbox skipped; doctor warnings present.',
      'Recommended next safe step: run from workspace root /repo: npm run verify:workspace',
      'Rollback: keep the previous release candidate and restore the last green artifact.',
    ].join('\n'),
  },
  {
    name: 'command failure output names command, directory, evidence, verify, and rollback',
    scenario: 'command-failure',
    output: [
      'Diagnosis: command failed with exit code 1 while running npm run test.',
      'Evidence: stderr shows MODULE_NOT_FOUND for dist/index.js.',
      'Execution directory: workspace root /repo/rapidkit-npm.',
      'Next safe step: run from workspace root /repo/rapidkit-npm: npm run build',
      'Verify: run from workspace root /repo/rapidkit-npm: npm run test -- src/__tests__/e2e.test.ts',
      'Rollback: restore the previous dist artifact or revert the build-script change.',
    ].join('\n'),
  },
];

describe('AI output quality golden scenarios', () => {
  it.each(ACCEPTED_OUTPUTS)('accepts $name', ({ scenario, output }) => {
    const result = validateAIOutputQuality(output, scenario);

    expect(result.violations).toEqual([]);
    expect(result.isAcceptable).toBe(true);
  });

  it('rejects polished but unverified success claims', () => {
    const result = validateAIOutputQuality(
      [
        '## Diagnosis',
        'The issue is fixed and production-ready.',
        '## Evidence',
        'Looks good from the current context.',
        '## Fix Plan',
        'Ship the change.',
        '## Verify',
        'No verification needed.',
      ].join('\n'),
      'debug'
    );

    expect(result.isAcceptable).toBe(false);
    expect(result.violations.map((violation) => violation.rule)).toContain(
      'PREMATURE_SUCCESS_CLAIM'
    );
    expect(result.violations.map((violation) => violation.rule)).toContain('MISSING_ROLLBACK_PATH');
  });

  it('rejects GO decisions with unresolved release evidence', () => {
    const result = validateAIOutputQuality(
      [
        'Decision: GO',
        'Blocking reasons: none.',
        'Evidence summary: sandbox unavailable and scope unknown.',
        'Recommended next safe step: run from project root /repo/orders-api: npm run release',
        'Rollback: restore previous release candidate.',
      ].join('\n'),
      'release-project'
    );

    expect(result.isAcceptable).toBe(false);
    expect(result.violations.map((violation) => violation.rule)).toContain(
      'GO_DECISION_WITH_UNRESOLVED_EVIDENCE'
    );
  });

  it('keeps the prompt contract and output validator aligned on user-visible sections', () => {
    const askContract = getAIOutputQualityContract('ask', 'fastapi.standard');
    const debugContract = getAIOutputQualityContract('debug', 'fastapi.standard');

    expect(askContract).toContain('## Answer');
    expect(askContract).toContain('## Next Safe Step');
    expect(askContract).toContain('## Verification');
    expect(debugContract).toContain('## Diagnosis');
    expect(debugContract).toContain('## Fix Plan');
    expect(debugContract).toContain('## Rollback');
  });
});
