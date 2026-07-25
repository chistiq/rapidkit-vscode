import { describe, expect, it } from 'vitest';

import type {
  DoctorRemediationPlanStepView,
  DoctorRemediationPlanView,
} from '../../webview-ui/src/lib/doctorRemediationPlan.js';
import {
  canContinueStudioAutonomously,
  selectAgentStudioRemediationStep,
  selectAutomaticStudioRemediationStep,
  selectNextStudioFileRemediationStep,
  STUDIO_AUTONOMOUS_MAX_STEPS,
} from '../../webview-ui/src/lib/studioAutonomousRemediation.js';

function step(
  overrides: Partial<DoctorRemediationPlanStepView> = {}
): DoctorRemediationPlanStepView {
  return {
    id: 'safe-step',
    phase: 'repair',
    order: 1,
    projectName: 'web',
    projectPath: '/workspace/web',
    originalCommand: '',
    kind: 'json-edit',
    risk: 'safe',
    executable: false,
    studioState: 'ready',
    studioReason: 'Contract-authored operation.',
    primaryAction: 'Repair config',
    requiresApproval: false,
    confidence: 'high',
    previewTitle: 'Repair config',
    previewSummary: 'Repair one governed field.',
    diffSummary: 'One JSON edit.',
    files: ['config.json'],
    refreshCommands: [],
    canApply: true,
    ...overrides,
  };
}

function plan(visibleSteps: DoctorRemediationPlanStepView[]): DoctorRemediationPlanView {
  return {
    schemaVersion: 'doctor-remediation-plan-v2',
    sourcePath: '.workspai/reports/doctor-remediation-plan-last-run.json',
    generatedAt: new Date(0).toISOString(),
    policyProfile: 'enterprise-strict',
    totalSteps: visibleSteps.length,
    executableSteps: visibleSteps.length,
    risk: { safe: visibleSteps.length, guarded: 0, invasive: 0 },
    visibleSteps,
    hiddenStepCount: 0,
    scope: 'workspace',
    freshness: { verdict: 'fresh' },
  };
}

describe('Studio autonomous remediation policy', () => {
  it('selects only fresh, safe, ready, approval-free deterministic operations', () => {
    expect(selectAutomaticStudioRemediationStep(plan([step()]))?.id).toBe('safe-step');
  });

  it('does not repeat a deterministic step that already failed in the same incident', () => {
    const first = step({ id: 'first' });
    const second = step({ id: 'second', order: 2 });
    expect(
      selectAutomaticStudioRemediationStep(plan([first, second]), new Set(['first']))?.id
    ).toBe('second');
    expect(
      selectAutomaticStudioRemediationStep(plan([first, second]), new Set(['first', 'second']))
    ).toBeNull();
  });

  it('never skips an earlier guarded prerequisite to auto-apply a later safe edit', () => {
    const prerequisite = step({
      id: 'refresh-readiness',
      order: 1,
      canApply: false,
      executable: true,
      originalCommand: 'npx workspai readiness --json',
      risk: 'guarded',
    });
    const unrelatedLaterEdit = step({ id: 'gitignore', order: 2 });
    expect(
      selectAutomaticStudioRemediationStep(plan([prerequisite, unrelatedLaterEdit]))
    ).toBeNull();
    expect(
      selectNextStudioFileRemediationStep(plan([prerequisite, unrelatedLaterEdit]))
    ).toBeNull();
  });

  it('hands command-only remediation plans to the agent loop', () => {
    const refreshReadiness = step({
      canApply: false,
      executable: true,
      originalCommand: 'npx workspai readiness --strict --json',
      risk: 'guarded',
      requiresApproval: true,
    });
    expect(selectNextStudioFileRemediationStep(plan([refreshReadiness]))).toBeNull();
    expect(selectNextStudioFileRemediationStep(plan([step()]))?.id).toBe('safe-step');
  });

  it('lets Agent mode execute governed guarded operations without an operator approval gate', () => {
    const guarded = step({
      id: 'guarded-contract-edit',
      risk: 'guarded',
      studioState: 'review-required',
      requiresApproval: true,
    });

    expect(selectAutomaticStudioRemediationStep(plan([guarded]))).toBeNull();
    expect(selectAgentStudioRemediationStep(plan([guarded]))?.id).toBe('guarded-contract-edit');
  });

  it('lets Agent mode execute the next npm-authored command-only remediation step', () => {
    const readinessRefresh = step({
      id: 'readiness:refresh',
      canApply: false,
      executable: true,
      originalCommand: 'npx workspai readiness --strict --json',
      risk: 'guarded',
      studioState: 'review-required',
      requiresApproval: true,
    });

    expect(selectAgentStudioRemediationStep(plan([readinessRefresh]))?.id).toBe(
      'readiness:refresh'
    );
  });

  it.each([
    step({ risk: 'guarded' }),
    step({ studioState: 'review-required' }),
    step({ requiresApproval: true }),
    step({ confidence: 'low' }),
    step({ canApply: false, executable: true, originalCommand: 'npm install' }),
  ])('keeps guarded, approval, low-confidence, and command steps behind review', (candidate) => {
    expect(selectAutomaticStudioRemediationStep(plan([candidate]))).toBeNull();
  });

  it('refuses stale plans and bounds automatic continuation', () => {
    const stale = plan([step()]);
    stale.freshness.verdict = 'stale';
    expect(selectAutomaticStudioRemediationStep(stale)).toBeNull();
    expect(canContinueStudioAutonomously(STUDIO_AUTONOMOUS_MAX_STEPS - 1)).toBe(true);
    expect(canContinueStudioAutonomously(STUDIO_AUTONOMOUS_MAX_STEPS)).toBe(false);
  });
});
