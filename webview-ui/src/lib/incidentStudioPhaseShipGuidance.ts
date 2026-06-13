import type { IncidentPhase } from '../components/StudioRedesign/state/studioState';
import { PHASE_LABELS } from '../components/StudioRedesign/state/studioState';
import type { EnterpriseShipLoopView, ShipLoopStepId } from './incidentStudioShipLoop';

export type PhaseShipGuidance = {
  suggestedPhase: IncidentPhase | null;
  hint: string | null;
  alignWithStepId: ShipLoopStepId | null;
};

const SHIP_STEP_TO_PHASE: Record<ShipLoopStepId, IncidentPhase> = {
  analyze: 'detect',
  'verify-gates': 'verify',
  readiness: 'plan',
  archive: 'verify',
  'autopilot-release': 'verify',
};

export function mapShipLoopStepToIncidentPhase(stepId: ShipLoopStepId): IncidentPhase {
  return SHIP_STEP_TO_PHASE[stepId];
}

export function resolvePhaseShipGuidance(
  currentPhase: IncidentPhase,
  shipLoopView: EnterpriseShipLoopView | null | undefined
): PhaseShipGuidance {
  const alignWithStepId = shipLoopView?.nextStepId ?? null;
  if (!alignWithStepId) {
    return { suggestedPhase: null, hint: null, alignWithStepId: null };
  }

  const suggestedPhase = mapShipLoopStepToIncidentPhase(alignWithStepId);
  if (currentPhase === suggestedPhase) {
    return { suggestedPhase, hint: null, alignWithStepId };
  }

  const stepLabel =
    shipLoopView?.steps.find((step) => step.id === alignWithStepId)?.label ?? alignWithStepId;
  const hint = `Ship loop next step is "${stepLabel}" — switch to ${PHASE_LABELS[suggestedPhase]} to stay aligned.`;

  return { suggestedPhase, hint, alignWithStepId };
}
