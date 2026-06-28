import type { DashboardSection } from './dashboardSections';
import type { DashboardOperateZone } from './dashboardOperateZones';
import type { DashboardCommand, DashboardCommandScope } from './dashboardCommandRegistry';
import type { DashboardEvidenceCardId } from '@workspai-contracts/dashboardEvidenceCards';
import type { StudioIncidentSummaryView } from './studioBlockerHandoff';

export type { DashboardEvidenceCardId };

export type DashboardEvidenceStatus = 'pass' | 'warn' | 'fail' | 'missing';

export type DashboardEvidenceScope = 'workspace' | 'project';

export type DashboardEvidenceFreshnessStatus = 'fresh' | 'aging' | 'stale' | 'unknown';

export type DashboardEvidenceFreshness = {
  status: DashboardEvidenceFreshnessStatus;
  label: string;
  detail: string;
  ageMs?: number;
};

const EVIDENCE_AGING_AFTER_MS = 6 * 60 * 60 * 1000;
const EVIDENCE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

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
  detailSections?: Array<{ id: string; title: string; body: string }>;
  incidentSummary?: StudioIncidentSummaryView;
  incidentStudioTarget?:
    | 'doctor'
    | 'analyze'
    | 'readiness'
    | 'release'
    | 'impact'
    | 'model'
    | 'pipeline';
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
  currentStepStartedAt?: number;
  lastDetail?: string;
};

export function filterOpsChainForActiveWorkspace(
  chain: DashboardOpsChainState | null | undefined,
  workspacePath?: string | null
): DashboardOpsChainState | null {
  if (!chain?.workspacePath || !workspacePath) {
    return null;
  }
  return chain.workspacePath === workspacePath ? chain : null;
}

export type DashboardOnboardingState = {
  isFreshInstall: boolean;
  recentWorkspaceCount: number;
  hasActiveWorkspace: boolean;
  /** Human-friendly Time-to-First-Value label once the first artifact is produced (roadmap 2.9). */
  ttfvLabel?: string | null;
};

export type DashboardEvidenceRefreshMode = 'full' | 'patch';

/**
 * 30-day health/impact trend (roadmap item 2.8), sourced from the CLI-written
 * `workspace-intelligence-history.json` ring buffer. Each point corresponds to a
 * `workspace verify` run; gate health and impact risk are normalized to 0–100.
 */
export type DashboardTrendPoint = {
  generatedAt: string;
  gateHealth: number;
  impactRisk: number;
  affectedProjects: number;
  gatePassed: boolean;
  blockingReasons: number;
  policyViolations: number;
  verdict: string;
  risk: string;
};

export type DashboardTrendSummary = {
  windowDays: number;
  points: DashboardTrendPoint[];
  latest: DashboardTrendPoint | null;
  gateHealthDelta: number | null;
  impactRiskDelta: number | null;
  gatePassRate: number;
  totalRuns: number;
};

export type DashboardEvidencePayload = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cards: DashboardEvidenceCard[];
  activity: DashboardActivityEntry[];
  opsChain?: DashboardOpsChainState | null;
  onboarding: DashboardOnboardingState;
  trend?: DashboardTrendSummary | null;
  requestId?: number;
  refreshMode?: DashboardEvidenceRefreshMode;
  patchCardIds?: DashboardEvidenceCardId[];
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
      return 'Passed';
    case 'warn':
      return 'Attention';
    case 'fail':
      return 'Blocked';
    default:
      return 'Missing';
  }
}

export function isBootstrapPendingCard(card: DashboardEvidenceCard | undefined): boolean {
  return card?.id === 'bootstrap' && Number(card.metrics?.pendingBootstrap ?? 0) === 1;
}

export function isCorruptArtifactCard(card: DashboardEvidenceCard | undefined): boolean {
  return Number(card?.metrics?.corruptArtifact ?? 0) > 0;
}

export function evidenceCardStatusLabel(card: DashboardEvidenceCard): string {
  if (isCorruptArtifactCard(card)) {
    return 'Corrupt';
  }
  if (isBootstrapPendingCard(card)) {
    return 'Running';
  }
  return evidenceStatusLabel(card.status);
}

function formatEvidenceAge(ageMs: number): string {
  const safeAgeMs = Math.max(0, ageMs);
  const minutes = Math.floor(safeAgeMs / (60 * 1000));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function resolveEvidenceFreshness(
  card: DashboardEvidenceCard,
  nowMs = Date.now()
): DashboardEvidenceFreshness {
  if (card.status === 'missing') {
    return {
      status: 'unknown',
      label: 'No artifact',
      detail: 'Run the matching command to create evidence.',
    };
  }

  if (Number(card.metrics?.staleEvidence ?? 0) > 0) {
    const detail =
      typeof card.metrics?.staleEvidenceDetail === 'string' &&
      card.metrics.staleEvidenceDetail.trim().length > 0
        ? card.metrics.staleEvidenceDetail
        : 'A referenced verification artifact is stale relative to newer workspace evidence.';
    return {
      status: 'stale',
      label: 'Stale evidence',
      detail,
    };
  }

  if (!card.generatedAt) {
    return {
      status: 'unknown',
      label: 'No timestamp',
      detail: 'Artifact exists, but freshness cannot be verified.',
    };
  }

  const generatedMs = Date.parse(card.generatedAt);
  if (!Number.isFinite(generatedMs)) {
    return {
      status: 'unknown',
      label: 'Invalid timestamp',
      detail: 'Artifact timestamp could not be parsed.',
    };
  }

  const ageMs = Math.max(0, nowMs - generatedMs);
  const detail = `Updated ${formatEvidenceAge(ageMs)}`;

  if (ageMs >= EVIDENCE_STALE_AFTER_MS) {
    return { status: 'stale', label: 'Stale', detail, ageMs };
  }
  if (ageMs >= EVIDENCE_AGING_AFTER_MS) {
    return { status: 'aging', label: 'Aging', detail, ageMs };
  }
  return { status: 'fresh', label: 'Fresh', detail, ageMs };
}

export function evidenceNeedsFreshnessAttention(
  card: DashboardEvidenceCard,
  nowMs = Date.now()
): boolean {
  return card.status !== 'missing' && resolveEvidenceFreshness(card, nowMs).status === 'stale';
}

export function outcomeCards(
  payload: DashboardEvidencePayload | null | undefined,
  nowMs = Date.now()
): DashboardEvidenceCard[] {
  return (payload?.cards ?? []).filter(
    (card) =>
      card.status === 'fail' ||
      card.status === 'warn' ||
      (card.blockers?.length ?? 0) > 0 ||
      evidenceNeedsFreshnessAttention(card, nowMs)
  );
}

export function countEvidenceAttention(
  payload: DashboardEvidencePayload | null | undefined,
  nowMs = Date.now()
): number {
  return outcomeCards(payload, nowMs).length;
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
  'setup',
  'readiness',
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

function compactEvidenceSummary(card: DashboardEvidenceCard | undefined, fallback: string): string {
  if (!card) {
    return fallback;
  }
  const summary = card.summary?.trim();
  if (summary && (card.status !== 'missing' || isBootstrapPendingCard(card))) {
    return summary.length > 48 ? `${summary.slice(0, 47)}…` : summary;
  }
  if (card.status === 'missing') {
    return fallback;
  }
  return evidenceCardStatusLabel(card);
}

export function formatHomeEvidenceDetail(
  evidence: DashboardEvidencePayload | null | undefined
): string {
  const doctor = findEvidenceCard(evidence, 'doctor');
  const analyze = findEvidenceCard(evidence, 'analyze');
  const readiness = findEvidenceCard(evidence, 'readiness');
  const workspaceRun = findEvidenceCard(evidence, 'workspaceRun');
  const parts = [
    doctor ? `Doctor: ${compactEvidenceSummary(doctor, evidenceStatusLabel(doctor.status))}` : null,
    analyze
      ? `Analyze: ${compactEvidenceSummary(analyze, evidenceStatusLabel(analyze.status))}`
      : null,
    readiness
      ? `Readiness: ${compactEvidenceSummary(readiness, evidenceStatusLabel(readiness.status))}`
      : null,
    workspaceRun && workspaceRun.status !== 'missing'
      ? `Run: ${compactEvidenceSummary(workspaceRun, evidenceStatusLabel(workspaceRun.status))}`
      : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return 'Run doctor from the Run tab to populate artifacts';
  }
  return parts.join(' · ');
}

export function formatHomeGovernanceDetail(
  evidence: DashboardEvidencePayload | null | undefined
): string {
  const pipeline = findEvidenceCard(evidence, 'pipeline');
  const bootstrap = findEvidenceCard(evidence, 'bootstrap');
  const setup = findEvidenceCard(evidence, 'setup');
  const mirror = findEvidenceCard(evidence, 'mirror');
  const parts = [
    pipeline
      ? `Pipeline: ${compactEvidenceSummary(pipeline, evidenceStatusLabel(pipeline.status))}`
      : null,
    bootstrap
      ? `Bootstrap: ${compactEvidenceSummary(bootstrap, evidenceStatusLabel(bootstrap.status))}`
      : null,
    setup && setup.status !== 'missing'
      ? `Setup: ${compactEvidenceSummary(setup, evidenceStatusLabel(setup.status))}`
      : null,
    mirror ? `Mirror: ${compactEvidenceSummary(mirror, evidenceStatusLabel(mirror.status))}` : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return 'Bootstrap and sync from Run → Governance';
  }
  return parts.join(' · ');
}

export function homeEvidenceMetricValue(
  evidence: DashboardEvidencePayload | null | undefined,
  attentionCount: number
): string {
  if (attentionCount > 0) {
    return `${attentionCount} need attention`;
  }
  const doctor = findEvidenceCard(evidence, 'doctor');
  if (!doctor || doctor.status === 'missing') {
    return 'No artifacts yet';
  }
  if (doctor.status === 'pass') {
    return 'Healthy';
  }
  return evidenceStatusLabel(doctor.status);
}

export function homeGovernanceMetricValue(
  evidence: DashboardEvidencePayload | null | undefined,
  attentionCount: number,
  hasWorkspace: boolean
): string {
  if (!hasWorkspace) {
    return 'Locked';
  }
  if (attentionCount > 0) {
    return `${attentionCount} need attention`;
  }
  const pipeline = findEvidenceCard(evidence, 'pipeline');
  const bootstrap = findEvidenceCard(evidence, 'bootstrap');
  const setup = findEvidenceCard(evidence, 'setup');
  if (
    bootstrap?.status === 'fail' ||
    setup?.status === 'fail' ||
    bootstrap?.status === 'warn' ||
    setup?.status === 'warn'
  ) {
    return evidenceStatusLabel(
      bootstrap?.status === 'fail' || setup?.status === 'fail' ? 'fail' : 'warn'
    );
  }
  if (!pipeline || pipeline.status === 'missing') {
    return 'Missing';
  }
  if (pipeline.status === 'pass') {
    return 'Pipeline passed';
  }
  return evidenceStatusLabel(pipeline.status);
}

export type DashboardNextStepPriority = 'critical' | 'recommended' | 'optional';

export type DashboardNextStep = {
  id: string;
  title: string;
  detail: string;
  priority: DashboardNextStepPriority;
  section?: DashboardSection;
  operateZone?: DashboardOperateZone;
  command?: DashboardCommand;
  commandLabel?: string;
  commandScope?: DashboardCommandScope;
  commandTrackActivity?: boolean;
  commandData?: Record<string, unknown>;
  incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget'];
};
