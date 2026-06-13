import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import { canApplyStudioMutationFromTelemetry } from './incidentStudioPolicyGateMapper';

export function resolveStudioMutationBlockReason(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): string | null {
  const enterprise = telemetry?.enterpriseStabilizationGateStatus;
  if (enterprise?.expansionFrozen) {
    return (
      enterprise.freezeReason ||
      'Enterprise stabilization expansion is frozen until gate recovery completes.'
    );
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
