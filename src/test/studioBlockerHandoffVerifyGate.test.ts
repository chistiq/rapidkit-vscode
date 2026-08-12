import { describe, expect, it } from 'vitest';

import {
  mergeStudioFixAppliedIntoHandoff,
  resolveStudioFixPhase,
  shouldAwaitVerifyAfterStudioFixApplied,
  type StudioBlockerHandoffView,
} from '../../webview-ui/src/lib/studioBlockerHandoff';

function handoff(overrides: Partial<StudioBlockerHandoffView> = {}): StudioBlockerHandoffView {
  return {
    schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
    cardId: 'doctor',
    cardStatus: 'fail',
    blockers: ['doctor failed'],
    artifactPath: '.rapidkit/reports/doctor-last-run.json',
    sourceCommand: 'npx rapidkit doctor --json',
    dashboardCommandId: 'projectDoctor',
    executionChannel: 'background',
    capabilityGate: 'doctor project',
    scope: 'workspace',
    blockerSignature: 'abc123456789abcd',
    studioMode: 'FIX',
    verifyCommand:
      'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json',
    verifyArtifact: '.rapidkit/reports/workspace-verify-last-run.json',
    incidentSummary: {
      title: 'Workspace Doctor',
      phase: 'fix',
      primaryAction: 'Fix source issue',
      verifyRequired: true,
      auditStatus: 'not-started',
    },
    ...overrides,
  };
}

describe('Studio blocker verify gate', () => {
  it('keeps mutating fixes blocked on verify instead of claiming completion', () => {
    expect(shouldAwaitVerifyAfterStudioFixApplied({ requiresVerify: true })).toBe(true);
    expect(
      resolveStudioFixPhase({
        handoff: handoff(),
        fixApplied: shouldAwaitVerifyAfterStudioFixApplied({ requiresVerify: true }),
      })
    ).toBe('awaiting-verify');
  });

  it('clears the verify gate only when the refreshed card passes', () => {
    expect(
      shouldAwaitVerifyAfterStudioFixApplied({
        cardStatus: 'pass',
        requiresVerify: false,
      })
    ).toBe(false);
    expect(
      resolveStudioFixPhase({
        handoff: handoff({ cardStatus: 'pass', studioMode: 'VERIFY_ONLY' }),
        fixApplied: false,
      })
    ).toBe('awaiting-verify');
  });

  it('lets canonical completion override stale awaiting-verify state', () => {
    expect(
      resolveStudioFixPhase({
        handoff: handoff({ cardStatus: 'pass', studioMode: 'VERIFY_ONLY' }),
        fixApplied: true,
        completed: true,
      })
    ).toBe('verified');
  });

  it('hydrates a verify command returned by a doctor-fix result into the active handoff', () => {
    const merged = mergeStudioFixAppliedIntoHandoff(handoff({ verifyCommand: undefined }), {
      verifyCommand: 'npx rapidkit doctor workspace --json',
      requiresVerify: true,
    });

    expect(merged?.verifyCommand).toBe('npx rapidkit doctor workspace --json');
    expect(merged?.dashboardCommandId).toBe('projectDoctor');
    expect(merged?.executionChannel).toBe('background');
    expect(merged?.capabilityGate).toBe('doctor project');
    expect(merged?.incidentSummary?.phase).toBe('audit');
    expect(merged?.incidentSummary?.primaryAction).toBe('Verify applied fix');
    expect(
      resolveStudioFixPhase({
        handoff: merged,
        fixApplied: shouldAwaitVerifyAfterStudioFixApplied({ requiresVerify: true }),
      })
    ).toBe('awaiting-verify');
  });
});
