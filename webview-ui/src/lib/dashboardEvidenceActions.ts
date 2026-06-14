import type { DashboardEvidenceCard, DashboardEvidenceCardId } from './dashboardEvidence';
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
  snapshot: 'workspaceSnapshotCreate',
  share: 'workspaceShare',
  archive: 'exportWorkspace',
};

export function resolveEvidenceCardCommandAction(
  card: DashboardEvidenceCard
): DashboardEvidenceCommandAction | undefined {
  const command = EVIDENCE_CARD_COMMANDS[card.id];
  const meta = command ? getDashboardCommandMeta(command) : undefined;
  if (!command || !meta) {
    return undefined;
  }
  return {
    command,
    label: meta.label,
    scope: meta.scope,
    trackActivity: meta.trackActivity,
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
  if (!card.incidentStudioTarget) {
    return null;
  }
  return {
    target: card.incidentStudioTarget,
    cardId: card.id,
    scope: card.scope,
  };
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
