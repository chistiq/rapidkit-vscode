import type { DashboardSection } from './dashboardSections';
import type { DashboardCommand, DashboardCommandScope } from './dashboardCommandRegistry';

export type DashboardEvidenceStatus = 'pass' | 'warn' | 'fail' | 'missing';

export type DashboardEvidenceScope = 'workspace' | 'project';

export type DashboardEvidenceCardId =
  | 'doctor'
  | 'projectDoctor'
  | 'pipeline'
  | 'analyze'
  | 'readiness'
  | 'bootstrap'
  | 'workspaceSync'
  | 'foundation'
  | 'contract'
  | 'autopilot'
  | 'snapshot'
  | 'share'
  | 'archive'
  | 'mirror'
  | 'cache'
  | 'policy'
  | 'infra';

export type DashboardEvidenceCard = {
  id: DashboardEvidenceCardId;
  label: string;
  status: DashboardEvidenceStatus;
  summary: string;
  scope: DashboardEvidenceScope;
  generatedAt?: string;
  artifactPath?: string;
  metrics?: Record<string, number | string>;
  blockers?: string[];
  incidentStudioTarget?: 'doctor' | 'analyze' | 'readiness' | 'release';
};

export type DashboardActivityEntry = {
  id: string;
  command: string;
  label: string;
  scope: 'workspace' | 'project' | 'module' | 'system';
  status: 'dispatched' | 'completed' | 'failed';
  timestamp: number;
  detail?: string;
  runCount?: number;
};

export type DashboardOpsChainStep = 'bootstrap' | 'doctor' | 'analyze' | 'readiness';

export type DashboardOpsChainState = {
  id: string;
  workspacePath: string;
  workspaceName?: string;
  triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add';
  steps: DashboardOpsChainStep[];
  currentStep: DashboardOpsChainStep;
  completedSteps: DashboardOpsChainStep[];
  status: 'running' | 'completed' | 'blocked';
  startedAt: number;
  updatedAt: number;
  lastDetail?: string;
};

export type DashboardOnboardingState = {
  isFreshInstall: boolean;
  recentWorkspaceCount: number;
  hasActiveWorkspace: boolean;
};

export type DashboardEvidencePayload = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cards: DashboardEvidenceCard[];
  activity: DashboardActivityEntry[];
  opsChain?: DashboardOpsChainState | null;
  onboarding: DashboardOnboardingState;
};

export function findEvidenceCard(
  payload: DashboardEvidencePayload | null | undefined,
  id: DashboardEvidenceCardId
): DashboardEvidenceCard | undefined {
  return payload?.cards.find((card) => card.id === id);
}

export function releaseHubStageStatus(
  payload: DashboardEvidencePayload | null | undefined,
  stage: 'readiness' | 'analyze' | 'release'
): DashboardEvidenceStatus {
  if (stage === 'readiness') {
    return findEvidenceCard(payload, 'readiness')?.status ?? 'missing';
  }
  if (stage === 'analyze') {
    return findEvidenceCard(payload, 'analyze')?.status ?? 'missing';
  }
  return findEvidenceCard(payload, 'autopilot')?.status ?? 'missing';
}

export function evidenceStatusLabel(status: DashboardEvidenceStatus): string {
  switch (status) {
    case 'pass':
      return 'Green';
    case 'warn':
      return 'Attention';
    case 'fail':
      return 'Blocked';
    default:
      return 'No evidence';
  }
}

export function outcomeCards(
  payload: DashboardEvidencePayload | null | undefined
): DashboardEvidenceCard[] {
  return (payload?.cards ?? []).filter(
    (card) => card.status === 'fail' || card.status === 'warn' || (card.blockers?.length ?? 0) > 0
  );
}

export function countEvidenceAttention(
  payload: DashboardEvidencePayload | null | undefined
): number {
  return outcomeCards(payload).length;
}

export function evidenceIsSparse(
  payload: DashboardEvidencePayload | null | undefined,
  hasWorkspace: boolean
): boolean {
  if (!hasWorkspace) {
    return false;
  }
  if (!payload) {
    return true;
  }
  const hasActivity = (payload.activity?.length ?? 0) > 0;
  const hasNonMissing = (payload.cards ?? []).some((card) => card.status !== 'missing');
  return !hasActivity && !hasNonMissing;
}

const OPERATE_EVIDENCE_CARD_IDS: DashboardEvidenceCardId[] = [
  'doctor',
  'bootstrap',
  'workspaceSync',
  'foundation',
  'contract',
  'mirror',
  'policy',
  'infra',
  'cache',
];

export function countOperateAttention(input: {
  evidence?: DashboardEvidencePayload | null;
  complianceStatus?: string;
  mirrorStatus?: string;
}): number {
  const { evidence, complianceStatus, mirrorStatus } = input;
  let count = 0;

  for (const id of OPERATE_EVIDENCE_CARD_IDS) {
    const card = findEvidenceCard(evidence, id);
    if (card?.status === 'fail' || card?.status === 'warn') {
      count += 1;
    }
  }

  if (complianceStatus === 'failing') {
    const bootstrap = findEvidenceCard(evidence, 'bootstrap');
    if (bootstrap?.status !== 'fail') {
      count += 1;
    }
  }

  if (mirrorStatus === 'stale') {
    const mirror = findEvidenceCard(evidence, 'mirror');
    if (mirror?.status !== 'fail' && mirror?.status !== 'warn') {
      count += 1;
    }
  }

  return count;
}

export type DashboardNextStepPriority = 'critical' | 'recommended' | 'optional';

export type DashboardNextStep = {
  id: string;
  title: string;
  detail: string;
  priority: DashboardNextStepPriority;
  section?: DashboardSection;
  command?: DashboardCommand;
  commandLabel?: string;
  commandScope?: DashboardCommandScope;
  commandTrackActivity?: boolean;
  commandData?: Record<string, unknown>;
  incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget'];
};
