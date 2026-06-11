import type { DashboardEvidenceCard, DashboardEvidenceCardId } from './dashboardEvidence';

export const EVIDENCE_CARD_COMMANDS: Partial<Record<DashboardEvidenceCardId, string>> = {
  doctor: 'checkWorkspaceHealth',
  projectDoctor: 'projectDoctor',
  analyze: 'workspaceAnalyze',
  readiness: 'workspaceReadiness',
  bootstrap: 'workspaceBootstrap',
  autopilot: 'workspaceAutopilotRelease',
  snapshot: 'workspaceSnapshotCreate',
  share: 'workspaceShare',
  archive: 'workspaceArchive',
};

export function resolveEvidenceCardCommand(card: DashboardEvidenceCard): string | undefined {
  return EVIDENCE_CARD_COMMANDS[card.id];
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
