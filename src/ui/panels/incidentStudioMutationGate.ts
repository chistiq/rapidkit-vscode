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
