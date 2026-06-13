/**
 * Webview mirror of src/core/incidentStudioTelemetryPolicyCore.ts
 */

import {
  enforceVerifyCompletionGates,
  extractGateBlockedReasons,
  type PolicyGateStatus,
} from './incidentStudioPolicyGatesCore';

export type IncidentStudioTelemetryGateSliceCore = {
  studioHardGateStatus?: {
    windowEndAt?: string;
    gates?: {
      verifyPhaseReachPass?: boolean;
      bridgeRouteCompletionPass?: boolean;
      telemetryEvidencePass?: boolean;
      overallPass?: boolean;
    };
  } | null;
  studioStabilizationKpiStatus?: {
    windowEndAt?: string;
    gates?: {
      overallPass?: boolean;
      routePrecisionPass?: boolean;
      verifyPathCompletionRatePass?: boolean;
      falseConfidenceRatePass?: boolean;
      rollbackRecoverySuccessRatePass?: boolean;
    };
  } | null;
  studioRollbackKpiStatus?: {
    gates?: {
      falseConfidenceRatePass?: boolean;
      verifyAutoRollbackSuccessRatePass?: boolean;
    };
  } | null;
  enterpriseStabilizationGateStatus?: {
    expansionFrozen?: boolean;
    freezeReason?: string | null;
    last7d?: {
      overallPass?: boolean;
      hardGatePass?: boolean;
      verifyPathCompletionPass?: boolean;
      falseConfidencePass?: boolean;
      rollbackRecoveryPass?: boolean;
    } | null;
  } | null;
};

export function mapTelemetryToPolicyGateStatus(
  telemetry: IncidentStudioTelemetryGateSliceCore | null | undefined
): PolicyGateStatus | null {
  const hard = telemetry?.studioHardGateStatus?.gates;
  const stabilization = telemetry?.studioStabilizationKpiStatus?.gates;
  const rollback = telemetry?.studioRollbackKpiStatus?.gates;
  const enterprise = telemetry?.enterpriseStabilizationGateStatus?.last7d;

  if (!hard && !stabilization && !rollback && !enterprise) {
    return null;
  }

  const verifyPhaseReachPass = hard?.verifyPhaseReachPass ?? enterprise?.hardGatePass ?? false;
  const bridgeRouteCompletionPass =
    hard?.bridgeRouteCompletionPass ?? enterprise?.hardGatePass ?? false;
  const verifyPathCompletionPass =
    stabilization?.verifyPathCompletionRatePass ?? enterprise?.verifyPathCompletionPass;
  const falseConfidenceThresholdPass =
    stabilization?.falseConfidenceRatePass ??
    rollback?.falseConfidenceRatePass ??
    enterprise?.falseConfidencePass;
  const rollbackRecoveryThresholdPass =
    stabilization?.rollbackRecoverySuccessRatePass ??
    rollback?.verifyAutoRollbackSuccessRatePass ??
    enterprise?.rollbackRecoveryPass;

  const hardOverall = hard?.overallPass;
  const stabilizationOverall = stabilization?.overallPass;
  const enterpriseOverall = enterprise?.overallPass;

  const overallPass =
    verifyPhaseReachPass &&
    bridgeRouteCompletionPass &&
    verifyPathCompletionPass !== false &&
    falseConfidenceThresholdPass !== false &&
    rollbackRecoveryThresholdPass !== false &&
    hardOverall !== false &&
    stabilizationOverall !== false &&
    enterpriseOverall !== false &&
    (hardOverall === true || enterpriseOverall === true);

  return {
    verifyPhaseReachPass,
    bridgeRouteCompletionPass,
    verifyPathCompletionPass,
    falseConfidenceThresholdPass,
    rollbackRecoveryThresholdPass,
    overallPass,
  };
}

export function resolvePolicyGateBlockedReasonsFromTelemetryCore(
  telemetry: IncidentStudioTelemetryGateSliceCore | null | undefined
): string[] {
  const enforcement = enforceVerifyCompletionGates(mapTelemetryToPolicyGateStatus(telemetry));
  const extracted = extractGateBlockedReasons(enforcement);
  const reasons = [...extracted.reasons];

  if (telemetry?.enterpriseStabilizationGateStatus?.expansionFrozen) {
    reasons.push(
      telemetry.enterpriseStabilizationGateStatus.freezeReason ||
        'Enterprise stabilization gate is frozen'
    );
  }

  if (telemetry?.studioStabilizationKpiStatus?.gates?.overallPass === false) {
    if (telemetry.studioStabilizationKpiStatus.gates.routePrecisionPass === false) {
      reasons.push('Route precision below enterprise threshold');
    }
    if (telemetry.studioStabilizationKpiStatus.gates.verifyPathCompletionRatePass === false) {
      reasons.push('Verify-path completion rate below enterprise threshold');
    }
  }

  return [...new Set(reasons.filter(Boolean))];
}

export function canApplyStudioMutationFromTelemetryCore(
  telemetry: IncidentStudioTelemetryGateSliceCore | null | undefined
): { allowed: boolean; reason: string | null } {
  if (telemetry?.enterpriseStabilizationGateStatus?.expansionFrozen) {
    return {
      allowed: false,
      reason:
        telemetry.enterpriseStabilizationGateStatus.freezeReason ||
        'Enterprise stabilization expansion is frozen until gate recovery completes.',
    };
  }

  const hardBlocked = telemetry?.studioHardGateStatus?.gates?.overallPass === false;
  const stabilizationBlocked =
    telemetry?.studioStabilizationKpiStatus?.gates?.overallPass === false;
  const enterpriseBlocked =
    telemetry?.enterpriseStabilizationGateStatus?.last7d?.hardGatePass === false;
  const falseConfidenceBlocked =
    telemetry?.studioStabilizationKpiStatus?.gates?.falseConfidenceRatePass === false ||
    telemetry?.studioRollbackKpiStatus?.gates?.falseConfidenceRatePass === false;

  if (hardBlocked || stabilizationBlocked || enterpriseBlocked || falseConfidenceBlocked) {
    const reasons = resolvePolicyGateBlockedReasonsFromTelemetryCore(telemetry);
    return {
      allowed: false,
      reason: reasons[0] || 'Policy gates are blocking mutating Studio actions.',
    };
  }

  return { allowed: true, reason: null };
}
