import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import { canApplyStudioMutationFromTelemetry } from './incidentStudioPolicyGateMapper';
import {
  deriveEnterpriseStabilizationLoopView,
  resolveStabilizationLoopBlockReason,
} from '../../core/incidentStudioStabilizationPolicy';

export function resolveStudioMutationBlockReason(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): string | null {
  const stabilizationReason = resolveStabilizationLoopBlockReason(
    deriveEnterpriseStabilizationLoopView(telemetry)
  );
  if (stabilizationReason) {
    return stabilizationReason;
  }

  const mutationPolicy = canApplyStudioMutationFromTelemetry(telemetry);
  if (!mutationPolicy.allowed) {
    return mutationPolicy.reason || 'Enterprise policy gates are blocking mutating Studio actions.';
  }

  return null;
}

export function canApplyStudioMutationFromTelemetryGuard(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): boolean {
  return resolveStudioMutationBlockReason(telemetry) === null;
}

export type GovernedStudioRepairMutation = {
  workspaceTrusted: boolean;
  contractAuthorized: boolean;
  reversible: boolean;
  invasive?: boolean;
};

/**
 * Incident repair is not product expansion. A contract-authorized patch with
 * rollback metadata must remain available while enterprise adoption KPIs are
 * below their expansion threshold; otherwise Studio can diagnose a blocker but
 * can never apply the source fix that clears it.
 */
export function resolveGovernedStudioRepairMutationBlockReason(
  mutation: GovernedStudioRepairMutation
): string | null {
  if (!mutation.workspaceTrusted) {
    return 'Studio Agent repair is blocked until the workspace is trusted.';
  }
  if (!mutation.contractAuthorized) {
    return 'Studio Agent repair is blocked because the patch target is not contract-authorized.';
  }
  if (!mutation.reversible) {
    return 'Studio Agent repair is blocked because rollback metadata is unavailable.';
  }
  if (mutation.invasive) {
    return 'Studio Agent repair is blocked because invasive changes require explicit approval.';
  }
  return null;
}
