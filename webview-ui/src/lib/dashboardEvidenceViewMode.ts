import type { DashboardCommand } from './dashboardCommandRegistry';
import type { DashboardEvidenceCardId } from '@workspai-contracts/dashboardEvidenceCards';
import type {
  DashboardEvidenceCard,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from './dashboardEvidence';
import { findEvidenceCard, isBootstrapPendingCard } from './dashboardEvidence';
import { workspaceRegisteredProjectCount } from './dashboardReleaseReadiness';
import { cardCountsAsReleaseBlocker } from './dashboardScaffoldEvidence';

export type EvidenceViewMode = 'guided' | 'balanced' | 'expanded';

export const EVIDENCE_VIEW_MODES: ReadonlyArray<EvidenceViewMode> = [
  'guided',
  'balanced',
  'expanded',
];

export const EVIDENCE_VIEW_MODE_LABELS: Record<EvidenceViewMode, string> = {
  guided: 'Needs action',
  balanced: 'Release checks',
  expanded: 'All evidence',
};

export const EVIDENCE_VIEW_MODE_HINTS: Record<EvidenceViewMode, string> = {
  guided: 'Only blocked and warning artifacts.',
  balanced: 'Release gates and grouped evidence.',
  expanded: 'Every evidence artifact and command history.',
};

export function normalizeEvidenceViewMode(value: unknown): EvidenceViewMode {
  if (value === 'guided' || value === 'balanced' || value === 'expanded') {
    return value;
  }
  return 'guided';
}

const VIEW_MODE_RANK: Record<EvidenceViewMode, number> = {
  guided: 0,
  balanced: 1,
  expanded: 2,
};

const CARD_MIN_VIEW_MODE: Partial<Record<DashboardEvidenceCardId, EvidenceViewMode>> = {
  doctor: 'guided',
  bootstrap: 'guided',
  setup: 'guided',
  workspaceSync: 'guided',
  analyze: 'guided',
  readiness: 'guided',
  pipeline: 'guided',
  autopilot: 'guided',
  workspaceVerify: 'guided',
  projectDoctor: 'guided',
  importReadiness: 'guided',
  foundation: 'balanced',
  contract: 'balanced',
  workspaceRun: 'balanced',
  workspaceModel: 'balanced',
  intelligenceSnapshot: 'balanced',
  workspaceDiff: 'balanced',
  workspaceImpact: 'balanced',
  workspaceIntelligenceRun: 'guided',
  workspaceExplain: 'balanced',
  workspaceWhy: 'balanced',
  workspaceTrace: 'balanced',
  workspaceWatch: 'balanced',
  workspaceContextAgent: 'balanced',
  agentGrounding: 'balanced',
  snapshot: 'balanced',
  share: 'balanced',
  archive: 'balanced',
  mirror: 'balanced',
  cache: 'balanced',
  policy: 'balanced',
  infra: 'balanced',
};

export function evidenceCardMinimumViewMode(cardId: DashboardEvidenceCardId): EvidenceViewMode {
  return CARD_MIN_VIEW_MODE[cardId] ?? 'balanced';
}

export function isEvidenceCardVisibleForViewMode(
  cardId: DashboardEvidenceCardId,
  viewMode: EvidenceViewMode
): boolean {
  return VIEW_MODE_RANK[viewMode] >= VIEW_MODE_RANK[evidenceCardMinimumViewMode(cardId)];
}

export function filterEvidenceCardsForViewMode(
  cards: DashboardEvidenceCard[],
  viewMode: EvidenceViewMode
): DashboardEvidenceCard[] {
  if (viewMode === 'expanded') {
    return cards;
  }
  return cards.filter((card) => isEvidenceCardVisibleForViewMode(card.id, viewMode));
}

export type EvidenceWorkflowGroupId =
  | 'health'
  | 'release'
  | 'project'
  | 'intelligence'
  | 'governance';

export type EvidenceWorkflowGroup = {
  id: EvidenceWorkflowGroupId;
  label: string;
  description: string;
  cardIds: DashboardEvidenceCardId[];
};

export const EVIDENCE_WORKFLOW_GROUPS: ReadonlyArray<EvidenceWorkflowGroup> = [
  {
    id: 'health',
    label: 'Health & bootstrap',
    description: 'Doctor, bootstrap, and workspace sync',
    cardIds: ['doctor', 'bootstrap', 'setup', 'workspaceSync', 'foundation', 'contract'],
  },
  {
    id: 'release',
    label: 'Release gates',
    description: 'Pipeline, analyze, readiness, verify, autopilot',
    cardIds: ['pipeline', 'analyze', 'readiness', 'workspaceVerify', 'autopilot'],
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Project doctor, import readiness, workspace run',
    cardIds: ['projectDoctor', 'importReadiness', 'workspaceRun'],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'Model, snapshot, diff, impact, verify, explain, agent context',
    cardIds: [
      'workspaceModel',
      'intelligenceSnapshot',
      'workspaceDiff',
      'workspaceImpact',
      'workspaceIntelligenceRun',
      'workspaceVerify',
      'workspaceExplain',
      'workspaceWhy',
      'workspaceTrace',
      'workspaceWatch',
      'workspaceContextAgent',
      'agentGrounding',
      'snapshot',
    ],
  },
  {
    id: 'governance',
    label: 'Governance & handoff',
    description: 'Mirror, cache, policy, share, archive',
    cardIds: ['mirror', 'cache', 'policy', 'infra', 'share', 'archive'],
  },
];

export function groupEvidenceCardsForViewMode(
  cards: DashboardEvidenceCard[],
  viewMode: EvidenceViewMode
): Array<{ group: EvidenceWorkflowGroup; cards: DashboardEvidenceCard[] }> {
  const visible = filterEvidenceCardsForViewMode(cards, viewMode);
  const byId = new Map(visible.map((card) => [card.id, card]));

  return EVIDENCE_WORKFLOW_GROUPS.map((group) => ({
    group,
    cards: group.cardIds
      .map((id) => byId.get(id))
      .filter((card): card is DashboardEvidenceCard => Boolean(card)),
  })).filter((entry) => entry.cards.length > 0);
}

export type EvidenceGuidedStepId =
  | 'health'
  | 'project'
  | 'analyze'
  | 'readiness'
  | 'verify'
  | 'release';

export type EvidenceGuidedStepState = 'complete' | 'current' | 'locked' | 'attention';

export type EvidenceGuidedStep = {
  id: EvidenceGuidedStepId;
  title: string;
  detail: string;
  state: EvidenceGuidedStepState;
  cardIds: DashboardEvidenceCardId[];
  command?: DashboardCommand;
  incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget'];
};

function stageGreenEnough(status: DashboardEvidenceStatus): boolean {
  return status === 'pass' || status === 'warn';
}

/** Workspace sync "Attention" with zero projects is normal before bootstrap/doctor — not a primary action. */
export function isEmptyWorkspaceRegistryWarn(card: DashboardEvidenceCard | undefined): boolean {
  if (!card || card.id !== 'workspaceSync' || card.status !== 'warn') {
    return false;
  }
  if ((card.blockers?.length ?? 0) > 0) {
    return false;
  }
  const projects = Number(card.metrics?.projectCount ?? card.metrics?.projects);
  return Number.isFinite(projects) && projects === 0;
}

export const HEALTH_STEP_CARD_ORDER = [
  'bootstrap',
  'setup',
  'doctor',
  'workspaceSync',
] as const satisfies readonly DashboardEvidenceCardId[];

export function healthStepCardNeedsAction(card: DashboardEvidenceCard): boolean {
  if (isBootstrapPendingCard(card)) {
    return true;
  }
  if (card.status === 'fail' || card.status === 'missing') {
    return true;
  }
  if (isEmptyWorkspaceRegistryWarn(card)) {
    return false;
  }
  return card.status === 'warn';
}

export function isEmptyWorkspaceProjectStepNoise(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): boolean {
  if (workspaceProjectCount !== 0) {
    return false;
  }
  if (card.id !== 'projectDoctor' && card.id !== 'importReadiness') {
    return false;
  }
  return card.status === 'warn' || card.status === 'missing';
}

export function pickGuidedStepPrimaryCard(
  stepId: EvidenceGuidedStepId,
  cards: DashboardEvidenceCard[],
  workspaceProjectCount: number | null = null
): DashboardEvidenceCard | undefined {
  if (cards.length === 0) {
    return undefined;
  }

  if (stepId === 'project' && workspaceProjectCount === 0) {
    const actionable = cards.filter((entry) => !isEmptyWorkspaceProjectStepNoise(entry, 0));
    if (actionable.length === 0) {
      return undefined;
    }
    return (
      actionable.find((entry) => entry.status === 'fail') ??
      actionable.find((entry) => entry.status === 'warn') ??
      actionable[0]
    );
  }

  if (stepId === 'health') {
    for (const cardId of HEALTH_STEP_CARD_ORDER) {
      const card = cards.find((entry) => entry.id === cardId);
      if (card && healthStepCardNeedsAction(card)) {
        return card;
      }
    }
    return cards.find((entry) => healthStepCardNeedsAction(entry)) ?? cards[0];
  }

  return (
    cards.find((entry) => entry.status === 'fail') ??
    cards.find((entry) => entry.status === 'warn') ??
    cards.find((entry) => isBootstrapPendingCard(entry)) ??
    cards.find((entry) => entry.status === 'missing') ??
    cards[0]
  );
}

/** Fallback card when a guided step has no actionable evidence cards yet (e.g. empty workspace project step). */
export function buildGuidedStepFocusCard(
  step: EvidenceGuidedStep
): DashboardEvidenceCard | undefined {
  if (step.state !== 'attention' && step.state !== 'current') {
    return undefined;
  }
  if (!step.command && step.cardIds.length === 0) {
    return undefined;
  }
  const focusId = step.cardIds[0] ?? 'bootstrap';
  return {
    id: focusId,
    label: step.title,
    status: step.state === 'attention' ? 'warn' : 'missing',
    summary: step.detail,
    scope: 'workspace',
    blockers: [],
    incidentStudioTarget: step.incidentStudioTarget,
    ...(step.command ? { metrics: { guidedCommand: step.command } } : {}),
  };
}

function healthStepComplete(evidence: DashboardEvidencePayload | null | undefined): boolean {
  const doctor = findEvidenceCard(evidence, 'doctor');
  const bootstrap = findEvidenceCard(evidence, 'bootstrap');
  const setup = findEvidenceCard(evidence, 'setup');
  const projectCount = workspaceRegisteredProjectCount(evidence);
  if (
    !doctor ||
    doctor.status === 'missing' ||
    (doctor.status === 'fail' && cardCountsAsReleaseBlocker(doctor, projectCount))
  ) {
    return false;
  }
  if (
    !bootstrap ||
    bootstrap.status === 'fail' ||
    isBootstrapPendingCard(bootstrap) ||
    bootstrap.status === 'missing'
  ) {
    return false;
  }
  if (setup?.status === 'fail') {
    return false;
  }
  return true;
}

function healthStepNeedsAttention(evidence: DashboardEvidencePayload | null | undefined): boolean {
  const doctor = findEvidenceCard(evidence, 'doctor');
  const bootstrap = findEvidenceCard(evidence, 'bootstrap');
  const setup = findEvidenceCard(evidence, 'setup');
  const workspaceSync = findEvidenceCard(evidence, 'workspaceSync');
  const projectCount = workspaceRegisteredProjectCount(evidence);
  return (
    (doctor?.status === 'fail' && cardCountsAsReleaseBlocker(doctor, projectCount)) ||
    doctor?.status === 'warn' ||
    isBootstrapPendingCard(bootstrap) ||
    bootstrap?.status === 'fail' ||
    bootstrap?.status === 'warn' ||
    setup?.status === 'fail' ||
    setup?.status === 'warn' ||
    workspaceSync?.status === 'fail' ||
    (workspaceSync?.status === 'warn' && !isEmptyWorkspaceRegistryWarn(workspaceSync))
  );
}

function projectStepComplete(
  evidence: DashboardEvidencePayload | null | undefined,
  hasProject: boolean
): boolean {
  const projectCount = workspaceRegisteredProjectCount(evidence);
  if (projectCount === 0) {
    return false;
  }
  if (hasProject) {
    return true;
  }
  return projectCount !== null && projectCount > 0;
}

export function buildEvidenceGuidedSteps(input: {
  evidence: DashboardEvidencePayload | null | undefined;
  hasProject: boolean;
}): EvidenceGuidedStep[] {
  const { evidence, hasProject } = input;
  const projectCount = workspaceRegisteredProjectCount(evidence);
  const workspaceEmpty = projectCount === 0;

  const healthComplete = healthStepComplete(evidence);
  const projectComplete = projectStepComplete(evidence, hasProject);
  const analyzeCard = findEvidenceCard(evidence, 'analyze');
  const readinessCard = findEvidenceCard(evidence, 'readiness');
  const verifyCard = findEvidenceCard(evidence, 'workspaceVerify');
  const impactCard = findEvidenceCard(evidence, 'workspaceImpact');
  const autopilotCard = findEvidenceCard(evidence, 'autopilot');
  const impactReady =
    Boolean(impactCard?.artifactPath?.trim()) &&
    impactCard?.status !== 'missing' &&
    impactCard?.status !== 'fail';

  const analyzeComplete = stageGreenEnough(analyzeCard?.status ?? 'missing');
  const readinessComplete = stageGreenEnough(readinessCard?.status ?? 'missing');
  const verifyComplete = verifyCard?.status === 'pass' || verifyCard?.status === 'warn';
  const releaseComplete = autopilotCard?.status === 'pass';

  const stepBlueprint: Array<{
    id: EvidenceGuidedStepId;
    title: string;
    detail: string;
    cardIds: DashboardEvidenceCardId[];
    command?: DashboardCommand;
    incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget'];
    complete: boolean;
    needsAttention: boolean;
    prerequisiteComplete: boolean;
  }> = [
    {
      id: 'health',
      title: 'Workspace health',
      detail: 'Confirm bootstrap, toolchain setup, and doctor are green.',
      cardIds: ['bootstrap', 'setup', 'doctor', 'workspaceSync'],
      command: 'checkWorkspaceHealth',
      incidentStudioTarget: 'doctor',
      complete: healthComplete,
      needsAttention: healthStepNeedsAttention(evidence),
      prerequisiteComplete: true,
    },
    {
      id: 'project',
      title: workspaceEmpty ? 'Add your first project' : 'Select a project',
      detail: workspaceEmpty
        ? 'Scaffold or import a backend service before analyze and release gates.'
        : 'Pick a project when you need project-scoped doctor and run evidence.',
      cardIds: ['projectDoctor', 'importReadiness'],
      command: workspaceEmpty ? 'importProject' : undefined,
      complete: projectComplete,
      needsAttention: workspaceEmpty,
      prerequisiteComplete: healthComplete,
    },
    {
      id: 'analyze',
      title: 'Analyze workspace',
      detail:
        'Run workspace analyze (interactive, non-strict). Use Governance Gate for strict CI evidence.',
      cardIds: ['analyze', 'pipeline'],
      command: 'workspaceAnalyze',
      incidentStudioTarget: 'analyze',
      complete: analyzeComplete,
      needsAttention:
        analyzeCard?.status === 'fail' ||
        analyzeCard?.status === 'warn' ||
        (analyzeCard?.blockers?.length ?? 0) > 0,
      prerequisiteComplete: healthComplete && projectComplete,
    },
    {
      id: 'readiness',
      title: 'Check readiness',
      detail: 'Validate release policy and bootstrap evidence.',
      cardIds: ['readiness', 'pipeline'],
      command: 'workspaceReadiness',
      incidentStudioTarget: 'readiness',
      complete: readinessComplete,
      needsAttention:
        readinessCard?.status === 'fail' ||
        readinessCard?.status === 'warn' ||
        (readinessCard?.blockers?.length ?? 0) > 0,
      prerequisiteComplete: healthComplete && projectComplete && analyzeComplete,
    },
    {
      id: 'verify',
      title: 'Verify gates',
      detail: impactReady
        ? 'Run workspace verify or open Studio for telemetry verify gates.'
        : 'Run the canonical intelligence chain to refresh the model, impact, evidence, and verification artifacts.',
      cardIds: impactReady
        ? ['workspaceVerify']
        : [
            'workspaceModel',
            'intelligenceSnapshot',
            'workspaceDiff',
            'workspaceImpact',
            'workspaceVerify',
          ],
      command: impactReady ? 'workspaceVerify' : 'workspaceIntelligenceChain',
      incidentStudioTarget: 'release',
      complete: verifyComplete,
      needsAttention: verifyCard?.status === 'fail' || verifyCard?.status === 'warn',
      prerequisiteComplete:
        healthComplete && projectComplete && analyzeComplete && readinessComplete,
    },
    {
      id: 'release',
      title: 'Autopilot release',
      detail: 'Attempt governed release when gates are green enough.',
      cardIds: ['autopilot'],
      command: 'workspaceAutopilotRelease',
      incidentStudioTarget: 'release',
      complete: releaseComplete,
      needsAttention:
        autopilotCard?.status === 'fail' ||
        autopilotCard?.status === 'warn' ||
        (autopilotCard?.blockers?.length ?? 0) > 0,
      prerequisiteComplete:
        healthComplete && projectComplete && analyzeComplete && readinessComplete && verifyComplete,
    },
  ];

  let currentAssigned = false;

  return stepBlueprint.map((step) => {
    let state: EvidenceGuidedStepState;
    if (!step.prerequisiteComplete) {
      state = 'locked';
    } else if (step.complete && !step.needsAttention) {
      state = 'complete';
    } else if (!currentAssigned) {
      currentAssigned = true;
      state = step.needsAttention ? 'attention' : 'current';
    } else if (step.needsAttention) {
      state = 'attention';
    } else if (step.complete) {
      state = 'complete';
    } else {
      state = 'locked';
    }

    return {
      id: step.id,
      title: step.title,
      detail: step.detail,
      state,
      cardIds: step.cardIds,
      command: step.command,
      incidentStudioTarget: step.incidentStudioTarget,
    };
  });
}

export function evidenceGuidedStepCards(
  step: EvidenceGuidedStep,
  evidence: DashboardEvidencePayload | null | undefined
): DashboardEvidenceCard[] {
  return step.cardIds
    .map((id) => findEvidenceCard(evidence, id))
    .filter((card): card is DashboardEvidenceCard => Boolean(card));
}
