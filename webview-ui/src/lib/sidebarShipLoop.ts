import {
  deriveEnterpriseShipLoopView,
  type EnterpriseShipLoopStepView,
  type EnterpriseShipLoopView,
  type ShipLoopEvidenceCard,
} from '@/lib/incidentStudioShipLoop';

export type SidebarShipLoopStepId = 'analyze' | 'verify-gates' | 'readiness' | 'archive';

export const SIDEBAR_SHIP_LOOP_STEP_IDS: SidebarShipLoopStepId[] = [
  'analyze',
  'verify-gates',
  'readiness',
  'archive',
];

export type SidebarShipLoopCard = {
  id: SidebarShipLoopStepId | 'autopilot';
  status: 'pass' | 'warn' | 'fail' | 'missing';
  summary?: string;
  blockers?: string[];
  generatedAt?: string;
};

export function deriveSidebarShipLoopView(
  cards: SidebarShipLoopCard[] | undefined
): Pick<EnterpriseShipLoopView, 'steps' | 'nextStepId' | 'recoveryHint' | 'releaseReady'> {
  const shipEvidence: { cards: ShipLoopEvidenceCard[] } = {
    cards: (cards ?? []).map((card) => ({
      id: card.id as ShipLoopEvidenceCard['id'],
      status: card.status,
      summary: card.summary,
      blockers: card.blockers,
      generatedAt: card.generatedAt,
    })),
  };

  const view = deriveEnterpriseShipLoopView({ shipEvidence });
  const compactSteps = view.steps.filter((step): step is EnterpriseShipLoopStepView =>
    SIDEBAR_SHIP_LOOP_STEP_IDS.includes(step.id as SidebarShipLoopStepId)
  );

  const nextStepId =
    compactSteps.find(
      (step) => step.state === 'missing' || step.state === 'fail' || step.state === 'blocked'
    )?.id ?? null;

  return {
    steps: compactSteps,
    nextStepId: nextStepId as SidebarShipLoopStepId | null,
    recoveryHint: view.recoveryHint,
    releaseReady: view.releaseReady,
  };
}
