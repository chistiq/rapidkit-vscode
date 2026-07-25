import type {
  DoctorRemediationPlanStepView,
  DoctorRemediationPlanView,
} from '@/lib/doctorRemediationPlan';

export const STUDIO_AUTONOMOUS_MAX_STEPS = 6;

/**
 * Only npm-authored, fresh, explicitly safe operations may cross the automatic
 * mutation boundary. Guarded/review-required operations and arbitrary commands
 * remain visible approval points.
 */
export function selectAutomaticStudioRemediationStep(
  plan: DoctorRemediationPlanView | null,
  attemptedStepIds: ReadonlySet<string> = new Set()
): DoctorRemediationPlanStepView | null {
  if (!plan || plan.freshness.verdict !== 'fresh') {
    return null;
  }

  const nextStep = plan.visibleSteps.find(
    (step) => !attemptedStepIds.has(step.id) && (step.canApply || step.executable)
  );
  if (
    !nextStep ||
    !nextStep.canApply ||
    nextStep.risk !== 'safe' ||
    nextStep.studioState !== 'ready' ||
    nextStep.requiresApproval !== false ||
    nextStep.confidence === 'low'
  ) {
    return null;
  }
  return nextStep;
}

/**
 * A command-only step is diagnostic evidence, not a deterministic source edit.
 * Do not skip it to apply a later file operation; hand control to the agent loop.
 */
export function selectNextStudioFileRemediationStep(
  plan: DoctorRemediationPlanView | null,
  attemptedStepIds: ReadonlySet<string> = new Set()
): DoctorRemediationPlanStepView | null {
  if (!plan || plan.freshness.verdict !== 'fresh') {
    return null;
  }
  const nextStep = plan.visibleSteps.find(
    (step) => !attemptedStepIds.has(step.id) && (step.canApply || step.executable)
  );
  return nextStep?.canApply ? nextStep : null;
}

/**
 * Agent mode owns governed remediation end to end. Approval metadata remains
 * visible for audit, but it is not an operator interaction gate when the CLI
 * supplied a fresh deterministic operation or executable command. The host
 * still enforces workspace scope and destructive-command policy.
 */
export function selectAgentStudioRemediationStep(
  plan: DoctorRemediationPlanView | null,
  attemptedStepIds: ReadonlySet<string> = new Set()
): DoctorRemediationPlanStepView | null {
  if (!plan || plan.freshness.verdict !== 'fresh') {
    return null;
  }
  return (
    plan.visibleSteps.find(
      (step) =>
        !attemptedStepIds.has(step.id) &&
        (step.canApply || (step.executable && Boolean(step.originalCommand))) &&
        step.confidence !== 'low'
    ) ?? null
  );
}

export function canContinueStudioAutonomously(completedSteps: number): boolean {
  return Number.isFinite(completedSteps) && completedSteps < STUDIO_AUTONOMOUS_MAX_STEPS;
}
