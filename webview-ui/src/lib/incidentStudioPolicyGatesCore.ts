/**
 * Webview mirror of host policy gate enforcement (incidentStudioPolicyGates.ts).
 * Keep blocked-reason strings aligned with host core.
 */

export interface PolicyGateStatus {
  verifyPhaseReachPass: boolean;
  bridgeRouteCompletionPass: boolean;
  verifyPathCompletionPass?: boolean;
  falseConfidenceThresholdPass?: boolean;
  rollbackRecoveryThresholdPass?: boolean;
  overallPass: boolean;
}

export interface PolicyGateEnforcementResult {
  canCompleteVerify: boolean;
  violations: Array<{ gate: string; severity: string; reason: string; guidance: string }>;
  blockedReasons: string[];
  fallbackGuidance: string | null;
}

export function enforceVerifyCompletionGates(
  gateStatus: PolicyGateStatus | null | undefined
): PolicyGateEnforcementResult {
  const violations: PolicyGateEnforcementResult['violations'] = [];
  const blockedReasons: string[] = [];

  if (!gateStatus) {
    return {
      canCompleteVerify: false,
      violations: [],
      blockedReasons: [],
      fallbackGuidance: null,
    };
  }

  if (!gateStatus.verifyPhaseReachPass) {
    violations.push({
      gate: 'VERIFY_PHASE_REACH',
      severity: 'error',
      reason: 'Verify phase telemetry confidence is insufficient to claim completion',
      guidance:
        'Continue running verification steps to build confidence (minimum threshold not yet reached)',
    });
    blockedReasons.push('Verify phase reach < minimum threshold');
  }

  if (!gateStatus.bridgeRouteCompletionPass) {
    violations.push({
      gate: 'BRIDGE_ROUTE_COMPLETION',
      severity: 'error',
      reason: 'Deterministic execution path incomplete; cannot finalize decision',
      guidance:
        'Run the remaining verification commands from the suggested action board before claiming completion',
    });
    blockedReasons.push('Bridge route completion < minimum threshold');
  }

  if (gateStatus.verifyPathCompletionPass === false) {
    violations.push({
      gate: 'VERIFY_PATH_COMPLETION',
      severity: 'error',
      reason: 'Required verify-path completion is not satisfied',
      guidance: 'Complete the full verify path before claiming the incident is verified',
    });
    blockedReasons.push('Verify-path completion < minimum threshold');
  }

  if (gateStatus.falseConfidenceThresholdPass === false) {
    violations.push({
      gate: 'FALSE_CONFIDENCE_THRESHOLD',
      severity: 'error',
      reason: 'False-confidence threshold exceeded for completion claim',
      guidance:
        'Do not claim completion until the false-confidence rate is reduced below the allowed threshold',
    });
    blockedReasons.push('False-confidence threshold not satisfied');
  }

  if (gateStatus.rollbackRecoveryThresholdPass === false) {
    violations.push({
      gate: 'ROLLBACK_RECOVERY_THRESHOLD',
      severity: 'error',
      reason: 'Rollback recovery threshold is not satisfied',
      guidance: 'Validate rollback recovery before issuing any completion claim',
    });
    blockedReasons.push('Rollback recovery threshold not satisfied');
  }

  const canComplete = gateStatus.overallPass === true && violations.length === 0;

  return {
    canCompleteVerify: canComplete,
    violations,
    blockedReasons,
    fallbackGuidance: null,
  };
}

export function extractGateBlockedReasons(result: PolicyGateEnforcementResult): {
  reasons: string[];
  summary: string;
} {
  const reasons = result.blockedReasons;
  const summary =
    reasons.length === 0 ? 'No gates blocked' : `Gates blocked: ${reasons.join('; ')}`;
  return { reasons, summary };
}
