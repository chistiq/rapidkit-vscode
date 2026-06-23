import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from './dashboardEvidence';
import { findEvidenceCard } from './dashboardEvidence';
import {
  buildEvidenceCardCommandData,
  type EvidenceWorkspaceContext,
} from './dashboardEvidenceDirectRun';
import {
  getDashboardCommandMeta,
  type DashboardCommand,
  type DashboardCommandScope,
} from './dashboardCommandRegistry';

export type DashboardEvidenceCommandAction = {
  command: DashboardCommand;
  label: string;
  scope: DashboardCommandScope;
  trackActivity: boolean;
  commandData?: Record<string, unknown>;
};

export const EVIDENCE_CARD_COMMANDS: Partial<Record<DashboardEvidenceCardId, DashboardCommand>> = {
  doctor: 'checkWorkspaceHealth',
  projectDoctor: 'projectDoctor',
  pipeline: 'workspacePipeline',
  analyze: 'workspaceAnalyze',
  readiness: 'workspaceReadiness',
  bootstrap: 'workspaceBootstrap',
  workspaceSync: 'workspaceSync',
  foundation: 'workspaceFoundationEnsure',
  contract: 'workspaceContractVerify',
  autopilot: 'workspaceAutopilotRelease',
  workspaceRun: 'workspaceRunTest',
  setup: 'workspaceSetup',
  importReadiness: 'projectDoctor',
  snapshot: 'workspaceSnapshotCreate',
  workspaceModel: 'workspaceModel',
  intelligenceSnapshot: 'workspaceIntelligenceSnapshot',
  workspaceDiff: 'workspaceDiff',
  workspaceImpact: 'workspaceImpact',
  workspaceVerify: 'workspaceVerify',
  workspaceContextAgent: 'workspaceContextAgent',
  agentGrounding: 'workspaceAgentSync',
  share: 'workspaceShare',
  archive: 'workspaceArchive',
  mirror: 'mirrorStatus',
  cache: 'cacheStatus',
  policy: 'workspacePolicyShow',
  infra: 'workspaceInfra',
};

function resolveWorkspaceRunCommand(card: DashboardEvidenceCard): DashboardCommand {
  const summary = card.summary?.trim().toLowerCase() ?? '';
  if (summary.startsWith('build')) {
    return 'workspaceRunBuild';
  }
  if (summary.startsWith('start')) {
    return 'workspaceRunStart';
  }
  if (summary.startsWith('init')) {
    return 'workspaceRunInit';
  }
  return 'workspaceRunTest';
}

export function resolveEvidenceCardCommandAction(
  card: DashboardEvidenceCard,
  options?: {
    workspace?: EvidenceWorkspaceContext;
    evidence?: DashboardEvidencePayload | null;
  }
): DashboardEvidenceCommandAction | undefined {
  let command =
    card.id === 'workspaceRun' ? resolveWorkspaceRunCommand(card) : EVIDENCE_CARD_COMMANDS[card.id];

  if (card.id === 'workspaceVerify' && options?.evidence) {
    const impact = findEvidenceCard(options.evidence, 'workspaceImpact');
    const impactReady =
      Boolean(impact?.artifactPath?.trim()) &&
      impact?.status !== 'missing' &&
      impact?.status !== 'fail';
    if (!impactReady) {
      command = 'workspaceIntelligenceChain';
    }
  }

  const meta = command ? getDashboardCommandMeta(command) : undefined;
  if (!command || !meta) {
    return undefined;
  }
  const commandData = buildEvidenceCardCommandData(card, command, options?.workspace);
  return {
    command,
    label: meta.label,
    scope: meta.scope,
    trackActivity: meta.trackActivity,
    ...(commandData ? { commandData } : {}),
  };
}

export function resolveEvidenceCardCommand(
  card: DashboardEvidenceCard
): DashboardCommand | undefined {
  return resolveEvidenceCardCommandAction(card)?.command;
}

export function buildIncidentStudioEvidenceOpen(card: DashboardEvidenceCard): {
  target: NonNullable<DashboardEvidenceCard['incidentStudioTarget']>;
  cardId: DashboardEvidenceCardId;
  scope: DashboardEvidenceCard['scope'];
} | null {
  const target = resolveIncidentStudioTargetFromCard(card);
  if (!target) {
    return null;
  }
  return {
    target,
    cardId: card.id,
    scope: card.scope,
  };
}

export function resolveIncidentStudioTargetFromCard(
  card: DashboardEvidenceCard
): NonNullable<DashboardEvidenceCard['incidentStudioTarget']> | undefined {
  if (card.incidentStudioTarget) {
    return card.incidentStudioTarget;
  }

  switch (card.id) {
    case 'doctor':
    case 'projectDoctor':
    case 'setup':
    case 'bootstrap':
    case 'foundation':
    case 'contract':
    case 'workspaceSync':
      return 'doctor';
    case 'analyze':
      return 'analyze';
    case 'readiness':
    case 'pipeline':
    case 'policy':
    case 'infra':
      return 'readiness';
    case 'workspaceVerify':
    case 'autopilot':
    case 'archive':
    case 'share':
      return 'release';
    case 'workspaceModel':
    case 'intelligenceSnapshot':
    case 'workspaceContextAgent':
    case 'agentGrounding':
    case 'workspaceRun':
    case 'mirror':
    case 'cache':
      return 'model';
    case 'workspaceDiff':
    case 'workspaceImpact':
    case 'snapshot':
    case 'importReadiness':
      return 'impact';
    default:
      return undefined;
  }
}

export function opsChainStepLabel(step: string): string {
  switch (step) {
    case 'bootstrap':
      return 'Bootstrap';
    case 'doctor':
      return 'Doctor';
    case 'analyze':
      return 'Analyze';
    case 'readiness':
      return 'Readiness';
    default:
      return step;
  }
}
