import { describe, expect, it } from 'vitest';

import {
  getActionResultPresentation,
  getBoardActionGuardHint,
  getDecisionClarityWordingPolicy,
  getPhaseNextAction,
  type IncidentPhaseContext,
} from '../../webview-ui/src/lib/incidentStudioVerifyPolicy';

describe('incidentStudioVerifyPolicy', () => {
  it('flags guarded actions that require both impact review and verification', () => {
    expect(
      getBoardActionGuardHint({
        requiresImpactReview: true,
        requiresVerifyPath: true,
      })
    ).toBe('Workspace Advisor review and verification are required before claiming success.');
  });

  it('returns a warning presentation when verification is still required', () => {
    expect(
      getActionResultPresentation({
        success: false,
        verificationRequired: true,
        verifyPolicy: {
          requiresVerifyPath: true,
          allowCompletionClaimWithoutVerify: false,
        },
        outputSummary: 'inline-command - verification required before completion claim',
      })
    ).toEqual({
      tone: 'warning',
      title: 'Verification required',
      description: 'inline-command - verification required before completion claim',
    });
  });

  it('preserves failure presentation when execution genuinely fails', () => {
    expect(
      getActionResultPresentation({
        success: false,
        outputSummary: 'doctor-fix - command exited with failures',
      })
    ).toEqual({
      tone: 'failure',
      title: 'Verification failed',
      description: 'doctor-fix - command exited with failures',
    });
  });

  it('labels release-gate blocks separately from verification failures', () => {
    expect(
      getActionResultPresentation({
        success: false,
        outputSummary:
          'apply-debug-patch - blocked by release gate: Affected scope is unknown while impact review is required.',
      })
    ).toEqual({
      tone: 'warning',
      title: 'Release gate blocked',
      description:
        'apply-debug-patch - blocked by release gate: Affected scope is unknown while impact review is required.',
    });
  });

  // CLC2 — Wording policy golden tests

  it('CLC2: blocks mutation-ready label when any required field is missing', () => {
    const policy = getDecisionClarityWordingPolicy({
      mutationReady: false,
      requiredMissingFields: ['rollbackPlan', 'impactScope'],
      verificationRequired: true,
    });
    expect(policy.mutationReadyLabel).toBeNull();
    expect(policy.cardState).toBe('blocked');
    expect(policy.cardHeading).toContain('blocked');
    expect(policy.cardHeading).toContain('guidance mode');
  });

  it('CLC2: blocks mutation-ready label when verificationRequired is true even if fields are complete', () => {
    const policy = getDecisionClarityWordingPolicy({
      mutationReady: true,
      requiredMissingFields: [],
      verificationRequired: true,
    });
    expect(policy.mutationReadyLabel).toBeNull();
    expect(policy.cardState).toBe('blocked');
  });

  it('CLC2: blocks mutation-ready label when mutationReady is false even if verificationRequired is false', () => {
    const policy = getDecisionClarityWordingPolicy({
      mutationReady: false,
      requiredMissingFields: ['nextStep'],
      verificationRequired: false,
    });
    expect(policy.mutationReadyLabel).toBeNull();
    expect(policy.cardState).toBe('blocked');
  });

  it('CLC2: emits mutation-ready label only when all fields are present and verification is clear', () => {
    const policy = getDecisionClarityWordingPolicy({
      mutationReady: true,
      requiredMissingFields: [],
      verificationRequired: false,
    });
    expect(policy.mutationReadyLabel).toBe('yes');
    expect(policy.cardState).toBe('complete');
    expect(policy.cardHeading).toContain('complete');
  });

  it('CLC2: keeps wording policy stable — blocked heading never contains success language', () => {
    const blockedCases = [
      { mutationReady: false, requiredMissingFields: ['situation'], verificationRequired: false },
      { mutationReady: false, requiredMissingFields: [], verificationRequired: true },
      { mutationReady: true, requiredMissingFields: ['rollbackPlan'], verificationRequired: true },
    ];
    for (const input of blockedCases) {
      const policy = getDecisionClarityWordingPolicy(input);
      expect(policy.mutationReadyLabel).toBeNull();
      expect(policy.cardHeading).not.toContain('complete');
      expect(policy.cardHeading).not.toMatch(/ready|success|apply/i);
    }
  });

  // CLC3 — One deterministic primary next action per phase

  const fullContext: IncidentPhaseContext = {
    workspaceReady: true,
    diagnosisReady: true,
    planReady: true,
    verifyReady: true,
    priorResolutionAvailable: false,
  };

  const emptyContext: IncidentPhaseContext = {
    workspaceReady: false,
    diagnosisReady: false,
    planReady: false,
    verifyReady: false,
    priorResolutionAvailable: false,
  };

  it('CLC3: detect phase — returns one confident action when workspace is ready', () => {
    const result = getPhaseNextAction('detect', fullContext);
    expect(result.downgraded).toBe(false);
    expect(result.primaryAction).toBeTruthy();
    expect(result.rationale).toBeTruthy();
  });

  it('CLC3: detect phase — downgrades to clarification when workspace is not ready', () => {
    const result = getPhaseNextAction('detect', emptyContext);
    expect(result.downgraded).toBe(true);
    expect(result.primaryAction).toMatch(/sync/i);
  });

  it('CLC3: diagnose phase — returns one confident action when evidence is ready', () => {
    const result = getPhaseNextAction('diagnose', fullContext);
    expect(result.downgraded).toBe(false);
    expect(result.primaryAction).toMatch(/analyz/i);
  });

  it('CLC3: diagnose phase — downgrades to clarification when evidence is missing', () => {
    const result = getPhaseNextAction('diagnose', emptyContext);
    expect(result.downgraded).toBe(true);
    expect(result.primaryAction).toMatch(/doctor|log|git diff/i);
  });

  it('CLC3: plan phase — returns one impact-review action when plan is ready', () => {
    const result = getPhaseNextAction('plan', fullContext);
    expect(result.downgraded).toBe(false);
    expect(result.primaryAction).toMatch(/review/i);
  });

  it('CLC3: plan phase — downgrades when diagnosis is not complete', () => {
    const result = getPhaseNextAction('plan', emptyContext);
    expect(result.downgraded).toBe(true);
    expect(result.primaryAction).toMatch(/diagnosis/i);
  });

  it('CLC3: verify phase — returns one run-verify action when verify path is ready', () => {
    const result = getPhaseNextAction('verify', fullContext);
    expect(result.downgraded).toBe(false);
    expect(result.primaryAction).toMatch(/run/i);
  });

  it('CLC3: verify phase — downgrades when no verify command is available', () => {
    const result = getPhaseNextAction('verify', emptyContext);
    expect(result.downgraded).toBe(true);
    expect(result.primaryAction).toMatch(/verify command|checklist/i);
  });

  it('CLC3: learn phase — prompts memory save when no prior resolution exists', () => {
    const result = getPhaseNextAction('learn', { ...fullContext, priorResolutionAvailable: false });
    expect(result.downgraded).toBe(false);
    expect(result.primaryAction).toMatch(/save|memory/i);
  });

  it('CLC3: learn phase — prompts memory update when prior resolution exists', () => {
    const result = getPhaseNextAction('learn', { ...fullContext, priorResolutionAvailable: true });
    expect(result.downgraded).toBe(false);
    expect(result.primaryAction).toMatch(/compare|update/i);
  });

  it('CLC3: all phases return exactly one primaryAction — never empty', () => {
    const phases = ['detect', 'diagnose', 'plan', 'verify', 'learn'] as const;
    for (const phase of phases) {
      const full = getPhaseNextAction(phase, fullContext);
      const empty = getPhaseNextAction(phase, emptyContext);
      expect(full.primaryAction.length).toBeGreaterThan(0);
      expect(empty.primaryAction.length).toBeGreaterThan(0);
      expect(full.rationale.length).toBeGreaterThan(0);
      expect(empty.rationale.length).toBeGreaterThan(0);
    }
  });
});
