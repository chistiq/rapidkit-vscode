import type { IncidentStudioTelemetryPayload } from './incidentStudioTelemetry';
import {
  canApplyStudioMutationFromTelemetryCore,
  mapTelemetryToPolicyGateStatus,
  resolvePolicyGateBlockedReasonsFromTelemetryCore,
  type IncidentStudioTelemetryGateSliceCore,
} from '../../core/incidentStudioTelemetryPolicyCore';
import {
  enforceVerifyCompletionGates,
  type PolicyGateEnforcementResult,
  type PolicyGateStatus,
} from './incidentStudioPolicyGates';

export type IncidentStudioTelemetryGateSlice = Pick<
  IncidentStudioTelemetryPayload,
  | 'studioHardGateStatus'
  | 'studioStabilizationKpiStatus'
  | 'studioRollbackKpiStatus'
  | 'enterpriseStabilizationGateStatus'
>;

export { mapTelemetryToPolicyGateStatus };

export function evaluatePolicyGateEnforcementFromTelemetry(
  telemetry: IncidentStudioTelemetryGateSlice | null | undefined
): PolicyGateEnforcementResult {
  return enforceVerifyCompletionGates(mapTelemetryToPolicyGateStatus(telemetry));
}

export function resolvePolicyGateBlockedReasonsFromTelemetry(
  telemetry: IncidentStudioTelemetryGateSlice | null | undefined
): string[] {
  return resolvePolicyGateBlockedReasonsFromTelemetryCore(
    telemetry as IncidentStudioTelemetryGateSliceCore
  );
}

export function canApplyStudioMutationFromTelemetry(
  telemetry: IncidentStudioTelemetryGateSlice | null | undefined
): { allowed: boolean; reason: string | null } {
  return canApplyStudioMutationFromTelemetryCore(telemetry as IncidentStudioTelemetryGateSliceCore);
}

export type { PolicyGateStatus, PolicyGateEnforcementResult };
