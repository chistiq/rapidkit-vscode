import type { DashboardEvidenceCard, DashboardEvidencePayload } from './dashboardEvidence';
import {
  buildEvidenceGuidedSteps,
  buildGuidedStepFocusCard,
  evidenceGuidedStepCards,
  pickGuidedStepPrimaryCard,
  type EvidenceGuidedStep,
} from './dashboardEvidenceViewMode';
import { countEvidenceAttentionBuckets } from './evidenceAgentContext';
import {
  cardCountsAsReleaseBlocker,
  resolveWorkspaceProjectCountFromEvidence,
} from './dashboardScaffoldEvidence';

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

export function buildDashboardEvidenceBrief(input: {
  evidence: DashboardEvidencePayload | null | undefined;
  hasWorkspace: boolean;
  hasProject: boolean;
}): EvidenceBriefView {
  const { evidence, hasWorkspace, hasProject } = input;
  const cards = evidence?.cards ?? [];
  const workspaceProjectCount = resolveWorkspaceProjectCountFromEvidence(evidence);
  const releaseBlockingCards = cards.filter((card) =>
    cardCountsAsReleaseBlocker(card, workspaceProjectCount)
  );
  const buckets = countEvidenceAttentionBuckets(evidence);
  const guidedSteps = buildEvidenceGuidedSteps({ evidence, hasProject });
  const currentStep =
    guidedSteps.find((step) => step.state === 'attention') ??
    guidedSteps.find((step) => step.state === 'current') ??
    guidedSteps.find((step) => step.state === 'locked') ??
    guidedSteps.find((step) => step.state === 'complete');
  const stepCards = currentStep ? evidenceGuidedStepCards(currentStep, evidence) : [];
  const primaryCard =
    (currentStep
      ? pickGuidedStepPrimaryCard(currentStep.id, stepCards, workspaceProjectCount)
      : undefined) ?? (currentStep ? buildGuidedStepFocusCard(currentStep) : undefined);

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

  if (buckets.blocked > 0) {
    return {
      posture: 'blocked',
      label: 'Blocked',
      summary:
        primaryCard?.summary ||
        releaseBlockingCards[0]?.summary ||
        'A required evidence gate is blocked.',
      detail: currentStep
        ? `${currentStep.title}: ${currentStep.detail}`
        : 'Open the highest priority blocker before continuing.',
      metrics: [
        { label: 'blocked', value: buckets.blocked, tone: 'danger' },
        {
          label: 'attention',
          value: buckets.attention,
          tone: buckets.attention > 0 ? 'warn' : 'neutral',
        },
        {
          label: 'missing',
          value: buckets.missing,
          tone: buckets.missing > 0 ? 'neutral' : 'good',
        },
      ],
      currentStep,
      primaryCard,
    };
  }

  if (buckets.attention > 0 || buckets.missing > 0) {
    const emptyShell = workspaceProjectCount === 0;
    return {
      posture: 'attention',
      label: emptyShell ? 'Scaffold ready' : 'Needs attention',
      summary:
        primaryCard?.summary ||
        (emptyShell
          ? 'Workspace shell is healthy — add your first project to continue the evidence loop.'
          : 'Evidence is usable, but at least one card needs review.'),
      detail: currentStep
        ? `${currentStep.title}: ${currentStep.detail}`
        : 'Review warning and stale evidence before release.',
      metrics: [
        { label: 'attention', value: buckets.attention, tone: 'warn' },
        { label: 'blocked', value: 0, tone: 'good' },
        {
          label: 'missing',
          value: buckets.missing,
          tone: buckets.missing > 0 ? 'neutral' : 'good',
        },
      ],
      currentStep,
      primaryCard,
    };
  }

  return {
    posture: buckets.missing === cards.length && cards.length > 0 ? 'empty' : 'healthy',
    label: buckets.missing === cards.length && cards.length > 0 ? 'Not populated' : 'Healthy',
    summary:
      buckets.missing === cards.length && cards.length > 0
        ? 'No evidence artifacts have been generated yet.'
        : 'No blockers or warning evidence cards are active.',
    detail: currentStep
      ? `${currentStep.title}: ${currentStep.detail}`
      : 'Continue through the guided evidence loop when ready.',
    metrics: [
      { label: 'healthy', value: buckets.ok, tone: 'good' },
      {
        label: 'missing',
        value: buckets.missing,
        tone: buckets.missing > 0 ? 'neutral' : 'good',
      },
      { label: 'actions', value: evidence?.activity.length ?? 0, tone: 'neutral' },
    ],
    currentStep,
    primaryCard,
  };
}
