import type {
  PolicyGateState,
  ReleaseGatePosture,
} from '@/components/StudioRedesign/state/studioState';

import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import { resolveStudioMutationBlockReason } from './incidentStudioMutationGate';
import {
  deriveEnterpriseShipLoopView,
  resolveShipLoopStepBlockReason,
  type ShipLoopEvidenceCard,
  type ShipLoopStepId,
  type ShipLoopStudioEvidenceSlice,
} from './incidentStudioShipLoop';

export type ShipLoopDispatchInput = {
  stepId: ShipLoopStepId;
  shipEvidence?: { cards?: ShipLoopEvidenceCard[] } | null;
  studioEvidence?: ShipLoopStudioEvidenceSlice | null;
  telemetry?: IncidentStudioTelemetryGateSlice | null;
  policyGates?: PolicyGateState;
  releasePosture?: ReleaseGatePosture;
  verifyGateBlockedReasons?: string[];
};

export function resolveShipLoopDispatchBlockReason(input: ShipLoopDispatchInput): string | null {
  const loopView = deriveEnterpriseShipLoopView({
    shipEvidence: input.shipEvidence,
    studioEvidence: input.studioEvidence,
    telemetry: input.telemetry,
    policyGates: input.policyGates,
    releasePosture: input.releasePosture,
    verifyGateBlockedReasons: input.verifyGateBlockedReasons,
  });

  const mutationBlockReason = resolveStudioMutationBlockReason(input.telemetry);
  return resolveShipLoopStepBlockReason(input.stepId, loopView, mutationBlockReason);
}

export function canDispatchShipLoopStep(input: ShipLoopDispatchInput): boolean {
  return resolveShipLoopDispatchBlockReason(input) === null;
}
