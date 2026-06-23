import type {
  DashboardEvidenceCard,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from './dashboardEvidence';
import {
  evidenceGuidedStepCards,
  buildEvidenceGuidedSteps,
  pickGuidedStepPrimaryCard,
  type EvidenceGuidedStep,
} from './dashboardEvidenceViewMode';
import { outcomeCards, resolveEvidenceFreshness } from './dashboardEvidence';

export type EvidenceBriefPosture = 'healthy' | 'attention' | 'blocked' | 'empty';

export type EvidenceBriefMetric = {
  label: string;
  value: number;
  tone: 'neutral' | 'good' | 'warn' | 'danger';
};

export type EvidenceBriefView = {
  posture: EvidenceBriefPosture;
  label: string;
  summary: string;
  detail: string;
  metrics: EvidenceBriefMetric[];
  currentStep?: EvidenceGuidedStep;
  primaryCard?: DashboardEvidenceCard;
};

function countCardsByStatus(
  cards: DashboardEvidenceCard[],
  status: DashboardEvidenceStatus
): number {
  return cards.filter((card) => card.status === status).length;
}

export function buildDashboardEvidenceBrief(input: {
  evidence: DashboardEvidencePayload | null | undefined;
  hasWorkspace: boolean;
  hasProject: boolean;
}): EvidenceBriefView {
  const { evidence, hasWorkspace, hasProject } = input;
  const cards = evidence?.cards ?? [];
  const blockers = cards.filter((card) => (card.blockers?.length ?? 0) > 0);
  const failed = countCardsByStatus(cards, 'fail');
  const warnings = countCardsByStatus(cards, 'warn');
  const missing = countCardsByStatus(cards, 'missing');
  const stale = cards.filter((card) => resolveEvidenceFreshness(card).status === 'stale').length;
  const outcomes = outcomeCards(evidence);
  const guidedSteps = buildEvidenceGuidedSteps({ evidence, hasProject });
  const currentStep =
    guidedSteps.find((step) => step.state === 'attention') ??
    guidedSteps.find((step) => step.state === 'current') ??
    guidedSteps.find((step) => step.state === 'locked') ??
    guidedSteps.find((step) => step.state === 'complete');
  const stepCards = currentStep ? evidenceGuidedStepCards(currentStep, evidence) : [];
  const primaryCard = currentStep
    ? pickGuidedStepPrimaryCard(currentStep.id, stepCards)
    : undefined;

  if (!hasWorkspace) {
    return {
      posture: 'empty',
      label: 'No workspace',
      summary: 'Select a workspace to start the evidence loop.',
      detail: 'Evidence appears after workspace operations generate artifacts.',
      metrics: [
        { label: 'cards', value: cards.length, tone: 'neutral' },
        { label: 'actions', value: evidence?.activity.length ?? 0, tone: 'neutral' },
        { label: 'blockers', value: 0, tone: 'good' },
      ],
    };
  }

  if (failed > 0 || blockers.length > 0) {
    return {
      posture: 'blocked',
      label: 'Blocked',
      summary:
        primaryCard?.summary || blockers[0]?.summary || 'A required evidence gate is blocked.',
      detail: currentStep
        ? `${currentStep.title}: ${currentStep.detail}`
        : 'Open the highest priority blocker before continuing.',
      metrics: [
        { label: 'blocked', value: Math.max(failed, blockers.length), tone: 'danger' },
        { label: 'attention', value: warnings, tone: warnings > 0 ? 'warn' : 'neutral' },
        { label: 'stale', value: stale, tone: stale > 0 ? 'warn' : 'good' },
      ],
      currentStep,
      primaryCard,
    };
  }

  if (warnings > 0 || stale > 0 || outcomes.length > 0) {
    return {
      posture: 'attention',
      label: 'Needs attention',
      summary: primaryCard?.summary || 'Evidence is usable, but at least one card needs review.',
      detail: currentStep
        ? `${currentStep.title}: ${currentStep.detail}`
        : 'Review warning and stale evidence before release.',
      metrics: [
        { label: 'attention', value: warnings + stale, tone: 'warn' },
        { label: 'blocked', value: 0, tone: 'good' },
        { label: 'missing', value: missing, tone: missing > 0 ? 'neutral' : 'good' },
      ],
      currentStep,
      primaryCard,
    };
  }

  return {
    posture: missing === cards.length && cards.length > 0 ? 'empty' : 'healthy',
    label: missing === cards.length && cards.length > 0 ? 'Not populated' : 'Healthy',
    summary:
      missing === cards.length && cards.length > 0
        ? 'No evidence artifacts have been generated yet.'
        : 'No blockers or warning evidence cards are active.',
    detail: currentStep
      ? `${currentStep.title}: ${currentStep.detail}`
      : 'Continue through the guided evidence loop when ready.',
    metrics: [
      { label: 'healthy', value: countCardsByStatus(cards, 'pass'), tone: 'good' },
      { label: 'missing', value: missing, tone: missing > 0 ? 'neutral' : 'good' },
      { label: 'actions', value: evidence?.activity.length ?? 0, tone: 'neutral' },
    ],
    currentStep,
    primaryCard,
  };
}
