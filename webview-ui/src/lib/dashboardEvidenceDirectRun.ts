import type { DashboardCommand } from './dashboardCommandRegistry';
import type { DashboardEvidenceCard } from './dashboardEvidence';
import { isBootstrapPendingCard } from './dashboardEvidence';

export type EvidenceWorkspaceContext = {
  path?: string;
  name?: string;
};

/** Cards without an artifact should run the mapped CLI command directly (no quick picks). */
export function evidenceCardNeedsDirectRun(card: DashboardEvidenceCard): boolean {
  if (isBootstrapPendingCard(card)) {
    return true;
  }
  if (card.status === 'missing') {
    return true;
  }
  if (!card.artifactPath?.trim()) {
    return true;
  }
  return false;
}

const EVIDENCE_DIRECT_COMMAND_FLAGS: Partial<Record<DashboardCommand, Record<string, unknown>>> = {
  workspaceBootstrap: { preferExistingProfile: true },
  checkWorkspaceHealth: { preferredAction: 'check' },
  workspaceFoundationEnsure: { mode: 'ensure', json: true },
  workspaceSetup: { preferProfileSetupRuntimes: true },
  projectDoctor: { preferredAction: 'check' },
};

export function buildEvidenceCardCommandData(
  card: DashboardEvidenceCard,
  command: DashboardCommand,
  workspace?: EvidenceWorkspaceContext
): Record<string, unknown> | undefined {
  if (!evidenceCardNeedsDirectRun(card)) {
    if (!workspace?.path) {
      return undefined;
    }
    return { path: workspace.path, name: workspace.name };
  }

  const data: Record<string, unknown> = {
    source: 'evidence',
    evidenceDirectRun: true,
    ...(EVIDENCE_DIRECT_COMMAND_FLAGS[command] ?? {}),
  };

  if (workspace?.path) {
    data.path = workspace.path;
  }
  if (workspace?.name) {
    data.name = workspace.name;
  }
  if (
    command === 'workspaceBootstrap' &&
    typeof card.metrics?.profile === 'string' &&
    card.metrics.profile.trim()
  ) {
    data.profile = card.metrics.profile.trim();
  }

  return data;
}
