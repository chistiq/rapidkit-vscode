import * as assert from 'node:assert';

import {
  inferVerifiedGoalIntent,
  assertVerifiedGoalCommandSafety,
  assertVerifiedGoalPackageManifestSafety,
  assertVerifiedGoalSourceMutationSafety,
  parseVerifiedGoalVerifyResult,
  verifiedGoalPlanArgs,
  verifiedGoalVerifyArgs,
} from '../core/verifiedGoalIntent.js';

suite('verified goal intent', () => {
  test('recognizes release readiness in English and Persian', () => {
    assert.strictEqual(
      inferVerifiedGoalIntent({
        task: 'Prepare this workspace for release.',
        hasProjectScope: false,
      })?.kind,
      'release-readiness'
    );
    assert.strictEqual(
      inferVerifiedGoalIntent({
        task: '\u{627}\u{6cc}\u{646} Workspace \u{631}\u{627} \u{628}\u{631}\u{627}\u{6cc} \u{627}\u{646}\u{62a}\u{634}\u{627}\u{631} \u{622}\u{645}\u{627}\u{62f}\u{647} \u{6a9}\u{646}',
        hasProjectScope: false,
      })?.kind,
      'release-readiness'
    );
  });

  test('recognizes safe dependency remediation and preserves project scope', () => {
    const goal = inferVerifiedGoalIntent({
      task: 'Fix the dependency vulnerabilities without breaking changes.',
      hasProjectScope: true,
    });
    assert.deepStrictEqual(goal?.constraints, {
      allowBreakingChanges: false,
      allowForce: false,
      requireBuild: true,
      requireTests: true,
    });
    assert.strictEqual(goal?.scope, 'project');
  });

  test('extracts a bounded coverage target', () => {
    const goal = inferVerifiedGoalIntent({
      task: 'Coverage \u{631}\u{627} \u{628}\u{647} \u{6f7}\u{6f5}\u{66a} \u{628}\u{631}\u{633}\u{627}\u{646} \u{648} build \u{631}\u{627} \u{62e}\u{631}\u{627}\u{628} \u{646}\u{6a9}\u{646}',
      hasProjectScope: true,
    });
    assert.strictEqual(goal?.kind, 'test-coverage');
    assert.strictEqual(goal?.target, 75);
    assert.deepStrictEqual(verifiedGoalPlanArgs({ intent: goal!, projectName: 'web' }), [
      'workspace',
      'goal',
      'plan',
      'test-coverage',
      '--scope',
      'project:web',
      '--target',
      '75',
      '--json',
    ]);
  });

  test('keeps workspace-wide coverage measurable when no project is selected', () => {
    const goal = inferVerifiedGoalIntent({
      task: 'Bring coverage to 75% across this workspace and keep builds green.',
      hasProjectScope: false,
    });
    assert.strictEqual(goal?.scope, 'workspace');
    assert.deepStrictEqual(verifiedGoalPlanArgs({ intent: goal! }), [
      'workspace',
      'goal',
      'plan',
      'test-coverage',
      '--target',
      '75',
      '--json',
    ]);
  });

  test('does not turn vague coding requests into goals', () => {
    assert.strictEqual(
      inferVerifiedGoalIntent({ task: 'Refactor this component.', hasProjectScope: true }),
      null
    );
  });

  test('validates goal verification identifiers', () => {
    assert.deepStrictEqual(verifiedGoalVerifyArgs('goal-test-coverage-1234abcd'), [
      'workspace',
      'goal',
      'verify',
      'goal-test-coverage-1234abcd',
      '--reuse-intelligence',
      '--json',
    ]);
    assert.throws(() => verifiedGoalVerifyArgs('../bad'));
  });

  test('reads the wrapped CLI goal verification result', () => {
    const parsed = parseVerifiedGoalVerifyResult({
      goal: {
        schemaVersion: 'workspai.verified-goal.v1',
        id: 'goal-test-coverage-1234abcd',
        kind: 'test-coverage',
        summary: 'Raise coverage.',
        scope: { kind: 'project' },
        constraints: {},
        criteria: {},
        artifactPaths: {},
      },
      status: {
        schemaVersion: 'workspai.verified-goal-status.v1',
        goalId: 'goal-test-coverage-1234abcd',
        state: 'verified',
      },
    });
    assert.strictEqual(parsed.status.goalId, 'goal-test-coverage-1234abcd');
    assert.strictEqual(parsed.status.state, 'verified');
  });

  test('enforces non-force and non-breaking security constraints', () => {
    const goal = {
      schemaVersion: 'workspai.verified-goal.v1' as const,
      id: 'goal-dependency-security-1234abcd',
      kind: 'dependency-security' as const,
      summary: 'Secure dependencies.',
      scope: { kind: 'project' as const, projectName: 'api', projectPath: '/workspace/api' },
      constraints: {
        allowBreakingChanges: false,
        allowForce: false,
        requireBuild: true,
        requireTests: true,
      },
      criteria: {},
      artifactPaths: { goal: 'goal.json', status: 'status.json', latestReport: 'latest.json' },
    };
    assert.throws(() =>
      assertVerifiedGoalCommandSafety({
        goal,
        executable: 'npm',
        args: ['audit', 'fix', '--force'],
      })
    );
    assert.throws(() =>
      assertVerifiedGoalPackageManifestSafety({
        goal,
        relativePath: 'api/package.json',
        originalContent: JSON.stringify({ dependencies: { nest: '^10.0.0' } }),
        patchedContent: JSON.stringify({ dependencies: { nest: '^11.0.0' } }),
      })
    );
    assert.doesNotThrow(() =>
      assertVerifiedGoalPackageManifestSafety({
        goal,
        relativePath: 'api/package.json',
        originalContent: JSON.stringify({ dependencies: { nest: '^10.0.0' } }),
        patchedContent: JSON.stringify({ dependencies: { nest: '^10.4.2' } }),
      })
    );
  });

  test('keeps coverage goals on the test-owned surface and forbids deletion', () => {
    const goal = {
      schemaVersion: 'workspai.verified-goal.v1' as const,
      id: 'goal-test-coverage-1234abcd',
      kind: 'test-coverage' as const,
      summary: 'Raise coverage.',
      scope: { kind: 'project' as const, projectName: 'api', projectPath: '/workspace/api' },
      constraints: {
        allowBreakingChanges: false,
        allowForce: false,
        requireBuild: true,
        requireTests: true,
      },
      criteria: {},
      artifactPaths: { goal: 'goal.json', status: 'status.json', latestReport: 'latest.json' },
    };
    assert.doesNotThrow(() =>
      assertVerifiedGoalSourceMutationSafety({
        goal,
        mutations: [
          { relativePath: 'src/auth/auth.service.spec.ts' },
          { relativePath: 'test/fixtures/auth.json' },
          { relativePath: 'tests/snapshots/auth.snap' },
        ],
      })
    );
    assert.throws(() =>
      assertVerifiedGoalSourceMutationSafety({
        goal,
        mutations: [{ relativePath: 'src/auth/auth.service.ts' }],
      })
    );
    assert.throws(() =>
      assertVerifiedGoalSourceMutationSafety({
        goal,
        mutations: [{ relativePath: 'tests/obsolete.test.ts', operation: 'delete' }],
      })
    );
  });
});
