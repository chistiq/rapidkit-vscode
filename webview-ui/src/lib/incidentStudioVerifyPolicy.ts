export type IncidentStudioBoardActionPolicy = {
  requiresImpactReview?: boolean;
  requiresVerifyPath?: boolean;
};

export type IncidentStudioActionResultPolicy = {
  success: boolean;
  outputSummary?: string;
  verificationRequired?: boolean;
  verifyPolicy?: {
    requiresVerifyPath?: boolean;
    requiresImpactReview?: boolean;
    allowCompletionClaimWithoutVerify?: boolean;
  };
};

export type IncidentStudioActionResultPresentation = {
  tone: 'success' | 'warning' | 'failure';
  title: string;
  description: string;
};

export function getBoardActionGuardHint(action: IncidentStudioBoardActionPolicy): string | null {
  if (action.requiresImpactReview && action.requiresVerifyPath) {
    return 'Impact review and verification are required before claiming success.';
  }
  if (action.requiresVerifyPath) {
    return 'Verification is required before claiming success.';
  }
  if (action.requiresImpactReview) {
    return 'Review impact before applying this action.';
  }
  return null;
}

export type IncidentDecisionClarityWordingPolicy = {
  /** Heading text for the decision clarity card. */
  cardHeading: string;
  /**
   * Non-null only when all required fields are present AND verificationRequired is false.
   * Renders the "Mutation ready: yes" label.
   * When null, mutation-ready language must NOT be shown.
   */
  mutationReadyLabel: 'yes' | null;
  /** CSS modifier class suffix for the card container. */
  cardState: 'complete' | 'blocked';
};

/**
 * CLC2 — Enforces mutation-ready wording policy.
 *
 * Rules:
 * - `mutationReadyLabel` is "yes" ONLY when `mutationReady` is true AND
 *   the result is not in a verificationRequired state.
 * - Any missing required field OR verificationRequired flag suppresses the label.
 * - Card heading reflects the blocked / guidance-first downgrade explicitly.
 */
export function getDecisionClarityWordingPolicy(opts: {
  mutationReady: boolean;
  requiredMissingFields: string[];
  verificationRequired: boolean;
}): IncidentDecisionClarityWordingPolicy {
  const blocked =
    !opts.mutationReady || opts.requiredMissingFields.length > 0 || opts.verificationRequired;

  if (blocked) {
    return {
      cardHeading: 'Decision clarity — blocked (guidance mode)',
      mutationReadyLabel: null,
      cardState: 'blocked',
    };
  }

  return {
    cardHeading: 'Decision clarity contract — complete',
    mutationReadyLabel: 'yes',
    cardState: 'complete',
  };
}

/**
 * CLC3 — Incident Studio phase identifiers.
 * Each phase has exactly one deterministic primary next action.
 */
export type IncidentStudioPhase = 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';

export type IncidentPhaseContext = {
  /** True when workspace/project detection has completed and graph snapshot is available. */
  workspaceReady: boolean;
  /** True when diagnosis evidence (doctor/runtime/git) is available. */
  diagnosisReady: boolean;
  /** True when a concrete action plan is available for execution. */
  planReady: boolean;
  /** True when a deterministic verify command or checklist is available. */
  verifyReady: boolean;
  /** True when a prior successful resolution exists in workspace memory. */
  priorResolutionAvailable: boolean;
};

export type IncidentPhaseNextAction = {
  /** The one primary action the user should take now. Never more than one. */
  primaryAction: string;
  /** Short rationale explaining why this is the safe next step. */
  rationale: string;
  /**
   * True when context is insufficient to present a confident action.
   * In downgrade mode, primaryAction becomes a clarification request, not an execution step.
   */
  downgraded: boolean;
};

/**
 * CLC3 — Returns exactly one deterministic primary next action for the given phase.
 *
 * Downgrade rule: if the required context for a phase is absent,
 * the output is downgraded to a guidance-first clarification request.
 * No phase may return multiple primary CTAs.
 */
export function getPhaseNextAction(
  phase: IncidentStudioPhase,
  context: IncidentPhaseContext
): IncidentPhaseNextAction {
  switch (phase) {
    case 'detect':
      if (!context.workspaceReady) {
        return {
          primaryAction: 'Sync workspace to detect active project and runtime state.',
          rationale: 'Workspace context is required before diagnosis can begin.',
          downgraded: true,
        };
      }
      return {
        primaryAction: 'Run workspace health check to surface active incidents.',
        rationale: 'Workspace is ready; health check identifies the highest-signal incident first.',
        downgraded: false,
      };

    case 'diagnose':
      if (!context.diagnosisReady) {
        return {
          primaryAction: 'Provide doctor evidence, runtime logs, or git diff to enable diagnosis.',
          rationale: 'Diagnosis evidence is missing; clarification is required before proceeding.',
          downgraded: true,
        };
      }
      return {
        primaryAction: 'Analyze available evidence to identify root cause and affected scope.',
        rationale: 'Evidence is present; root-cause analysis determines the safest plan.',
        downgraded: false,
      };

    case 'plan':
      if (!context.planReady) {
        return {
          primaryAction: 'Complete diagnosis before a safe action plan can be generated.',
          rationale: 'A concrete plan requires confirmed root cause and affected scope.',
          downgraded: true,
        };
      }
      return {
        primaryAction: 'Review the scoped action plan and confirm impact before execution.',
        rationale: 'Plan is ready; impact review is required before any mutating step.',
        downgraded: false,
      };

    case 'verify':
      if (!context.verifyReady) {
        return {
          primaryAction:
            'Provide a deterministic verify command or checklist before claiming success.',
          rationale: 'No verify path is available; completion cannot be claimed without evidence.',
          downgraded: true,
        };
      }
      return {
        primaryAction: 'Run the verify command pack and confirm all required checks pass.',
        rationale: 'Verify path is available; run it now to produce auditable completion evidence.',
        downgraded: false,
      };

    case 'learn':
      if (!context.priorResolutionAvailable) {
        return {
          primaryAction: 'Save verified outcome as a workspace memory entry for future reuse.',
          rationale:
            'No prior resolution exists; capture this resolution to accelerate the next incident.',
          downgraded: false,
        };
      }
      return {
        primaryAction:
          'Compare with prior resolution and update workspace memory if the pattern changed.',
        rationale: 'A prior resolution exists; update it to keep team memory accurate.',
        downgraded: false,
      };
  }
}

export function getActionResultPresentation(
  result: IncidentStudioActionResultPolicy
): IncidentStudioActionResultPresentation {
  if (result.verificationRequired && result.verifyPolicy?.requiresVerifyPath) {
    return {
      tone: 'warning',
      title: 'Verification required',
      description:
        result.outputSummary ||
        'A result was returned, but verification is still required before claiming success.',
    };
  }

  if (result.success) {
    return {
      tone: 'success',
      title: 'Verification passed',
      description: result.outputSummary || 'Action completed successfully and result was returned.',
    };
  }

  return {
    tone: 'failure',
    title: 'Verification failed',
    description:
      result.outputSummary ||
      'Action completed with failures. Review output and retry with a safer path.',
  };
}

export function getDecisionClarityNextActionGuidance(input: {
  nextStep?: string;
  primaryVerifyStep?: string;
}): string {
  const primaryVerifyStep = input.primaryVerifyStep?.trim();
  const nextStep = input.nextStep?.trim();

  if (nextStep && primaryVerifyStep && nextStep === primaryVerifyStep) {
    return 'Run the primary verify step and inspect the result before claiming completion.';
  }

  return nextStep || 'unknown';
}

export function formatDecisionClarityEvidenceLine(evidenceLinks: string[]): string | null {
  if (evidenceLinks.length === 0) {
    return null;
  }

  return `Evidence: ${evidenceLinks.slice(0, 4).join(' | ')}`;
}

export type VerificationClaimGuard = {
  blocked: boolean;
  reason: string | null;
  hasNoGoDecision: boolean;
};

export function resolveVerificationClaimGuard(input: {
  releaseDecision?: 'go' | 'no-go';
  verifyGateBlockedReasons: string[];
  verifyPackBlockedReasons: string[];
}): VerificationClaimGuard {
  const hasNoGoDecision = input.releaseDecision === 'no-go';
  const verifyGateBlockingReason = input.verifyGateBlockedReasons[0] ?? null;
  const verifyPackBlockingReason = input.verifyPackBlockedReasons[0]?.trim() || null;

  const reason = hasNoGoDecision
    ? 'Release readiness evidence is currently NO-GO. Resolve blockers before claiming verification success.'
    : verifyGateBlockingReason
      ? `Verification gates are still blocking completion: ${verifyGateBlockingReason}`
      : verifyPackBlockingReason
        ? `Verify pack has unresolved blockers: ${verifyPackBlockingReason}`
        : null;

  return {
    blocked: Boolean(reason),
    reason,
    hasNoGoDecision,
  };
}

export function getReleaseSignalLabel(input: {
  releaseDecision?: 'go' | 'no-go';
  verificationClaimBlocked: boolean;
}): string {
  if (input.releaseDecision === 'no-go') {
    return 'NO-GO (latest evidence)';
  }

  if (input.releaseDecision === 'go') {
    return input.verificationClaimBlocked
      ? 'GO evidence, HOLD by verify gates'
      : 'GO (latest evidence)';
  }

  return 'No decision yet';
}

export function getGuardedActionResultPresentation(input: {
  base: IncidentStudioActionResultPresentation;
  guard: VerificationClaimGuard;
}): IncidentStudioActionResultPresentation {
  if (input.base.tone === 'success' && input.guard.reason) {
    return {
      tone: input.guard.hasNoGoDecision ? 'failure' : 'warning',
      title: input.guard.hasNoGoDecision
        ? 'Release blocked (NO-GO evidence)'
        : 'Verification pending gate compliance',
      description: input.guard.reason,
    };
  }

  return input.base;
}
