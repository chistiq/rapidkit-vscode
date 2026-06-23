import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { resolveDashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from './dashboardEvidence';
import { findEvidenceCard } from './dashboardEvidence';
import {
  getDashboardCommandAffectedEvidenceCards,
  getDashboardCommandMeta,
  type DashboardCommand,
} from './dashboardCommandRegistry';

export interface DashboardCommandActionContract {
  command: DashboardCommand;
  commandLabel: string;
  executionScope: string;
  executionChannel?: DashboardCommandExecutionChannel;
  artifactPath?: string;
  artifactLabel: string;
  artifactState: 'ready' | 'pending';
  disabledReason?: string;
  studioLabel: string;
  copilotLabel: string;
}

function contractScopeLabel(scope?: string): string {
  if (scope === 'project') {
    return 'Project scope';
  }
  if (scope === 'global') {
    return 'Global scope';
  }
  return 'Workspace scope';
}

function artifactLabelFromCard(card?: DashboardEvidenceCard): string {
  if (!card) {
    return 'Artifact pending';
  }
  if (!card.artifactPath?.trim()) {
    return `${card.label} artifact pending`;
  }
  const parts = card.artifactPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || `${card.label} artifact`;
}

export function buildDashboardCommandActionContract(
  command: DashboardCommand,
  options?: {
    evidence?: DashboardEvidencePayload | null;
    disabledReason?: string;
    preferredArtifactCardId?: DashboardEvidenceCard['id'];
  }
): DashboardCommandActionContract {
  const meta = getDashboardCommandMeta(command);
  const affectedCardIds = getDashboardCommandAffectedEvidenceCards(command);
  const artifactCard =
    (options?.preferredArtifactCardId
      ? findEvidenceCard(options.evidence, options.preferredArtifactCardId)
      : undefined) ?? findEvidenceCard(options?.evidence, affectedCardIds[0]);
  const artifactReady = Boolean(artifactCard?.artifactPath?.trim());
  const executionScope = contractScopeLabel(meta?.scope);

  return {
    command,
    commandLabel: meta?.label ?? command,
    executionScope,
    executionChannel: resolveDashboardCommandExecutionChannel(command),
    artifactPath: artifactCard?.artifactPath,
    artifactLabel: artifactLabelFromCard(artifactCard),
    artifactState: artifactReady ? 'ready' : 'pending',
    disabledReason: options?.disabledReason,
    studioLabel: `Studio: ${executionScope.toLowerCase()}`,
    copilotLabel: `Copilot: ${executionScope.toLowerCase()} evidence pack`,
  };
}
