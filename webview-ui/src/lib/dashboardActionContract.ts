import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { resolveDashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from './dashboardEvidence';
import type { EvidenceWorkspaceContext } from './dashboardEvidenceDirectRun';
import {
  buildIncidentStudioEvidenceOpen,
  resolveEvidenceCardCommandAction,
  type DashboardEvidenceCommandAction,
} from './dashboardEvidenceActions';

export interface DashboardEvidenceActionContract {
  cardId: DashboardEvidenceCard['id'];
  cardScope: DashboardEvidenceCard['scope'];
  commandAction?: DashboardEvidenceCommandAction;
  commandLabel: string;
  executionChannel?: DashboardCommandExecutionChannel;
  commandState: 'ready' | 'pending';
  disabledReason?: string;
  artifactPath?: string;
  artifactLabel: string;
  artifactState: 'ready' | 'pending';
  studioTarget?: ReturnType<typeof buildIncidentStudioEvidenceOpen>;
  studioLabel: string;
  copilotLabel: string;
  studioPayload: DashboardEvidenceAgentPayload;
  copilotPayload: DashboardEvidenceAgentPayload;
}

export type DashboardEvidenceAgentCard = Pick<
  DashboardEvidenceCard,
  'id' | 'label' | 'status' | 'summary' | 'scope' | 'artifactPath' | 'blockers' | 'metrics'
>;

export interface DashboardEvidenceAgentPayload {
  workspacePath?: string;
  workspaceName?: string;
  projectPath?: string;
  projectName?: string;
  card: DashboardEvidenceAgentCard;
  actionContext: {
    source: 'dashboard-evidence';
    cardId: DashboardEvidenceCard['id'];
    cardScope: DashboardEvidenceCard['scope'];
    command?: DashboardEvidenceCommandAction['command'];
    commandLabel?: string;
    commandScope?: DashboardEvidenceCommandAction['scope'];
    artifactPath?: string;
    artifactState: 'ready' | 'pending';
    studioTarget?: ReturnType<typeof buildIncidentStudioEvidenceOpen>;
  };
}

function artifactLabel(artifactPath?: string): string {
  if (!artifactPath?.trim()) {
    return 'Artifact pending';
  }
  const parts = artifactPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || 'Artifact ready';
}

function serializeEvidenceCardForAgent(card: DashboardEvidenceCard): DashboardEvidenceAgentCard {
  return {
    id: card.id,
    label: card.label,
    status: card.status,
    summary: card.summary,
    scope: card.scope,
    artifactPath: card.artifactPath,
    blockers: card.blockers,
    metrics: card.metrics,
  };
}

function buildEvidenceAgentPayload(
  card: DashboardEvidenceCard,
  options: {
    workspace?: EvidenceWorkspaceContext;
    project?: EvidenceWorkspaceContext;
    commandAction?: DashboardEvidenceCommandAction;
    studioTarget?: ReturnType<typeof buildIncidentStudioEvidenceOpen>;
    artifactState: 'ready' | 'pending';
  }
): DashboardEvidenceAgentPayload {
  const projectPath = card.scope === 'project' ? options.project?.path : undefined;
  const projectName = card.scope === 'project' ? options.project?.name : undefined;
  return {
    ...(options.workspace?.path ? { workspacePath: options.workspace.path } : {}),
    ...(options.workspace?.name ? { workspaceName: options.workspace.name } : {}),
    ...(projectPath ? { projectPath } : {}),
    ...(projectName ? { projectName } : {}),
    card: serializeEvidenceCardForAgent(card),
    actionContext: {
      source: 'dashboard-evidence',
      cardId: card.id,
      cardScope: card.scope,
      ...(options.commandAction?.command ? { command: options.commandAction.command } : {}),
      ...(options.commandAction?.label ? { commandLabel: options.commandAction.label } : {}),
      ...(options.commandAction?.scope ? { commandScope: options.commandAction.scope } : {}),
      ...(card.artifactPath ? { artifactPath: card.artifactPath } : {}),
      artifactState: options.artifactState,
      ...(options.studioTarget ? { studioTarget: options.studioTarget } : {}),
    },
  };
}

export function buildDashboardEvidenceActionContract(
  card: DashboardEvidenceCard,
  options?: {
    workspace?: EvidenceWorkspaceContext;
    project?: EvidenceWorkspaceContext;
    evidence?: DashboardEvidencePayload | null;
  }
): DashboardEvidenceActionContract {
  const commandAction = resolveEvidenceCardCommandAction(card, options);
  const studioTarget = buildIncidentStudioEvidenceOpen(card);
  const artifactReady = Boolean(card.artifactPath?.trim());
  const artifactState = artifactReady ? 'ready' : 'pending';
  const payload = buildEvidenceAgentPayload(card, {
    workspace: options?.workspace,
    project: {
      path: options?.evidence?.projectPath || options?.project?.path,
      name: options?.evidence?.projectName || options?.project?.name,
    },
    commandAction,
    studioTarget,
    artifactState,
  });

  const executionChannel = commandAction
    ? resolveDashboardCommandExecutionChannel(commandAction.command, commandAction.commandData)
    : undefined;

  return {
    cardId: card.id,
    cardScope: card.scope,
    commandAction,
    commandLabel: commandAction?.label ?? 'No deterministic command',
    executionChannel,
    commandState: commandAction ? 'ready' : 'pending',
    disabledReason: commandAction ? undefined : 'No deterministic command is mapped for this card.',
    artifactPath: card.artifactPath,
    artifactLabel: artifactLabel(card.artifactPath),
    artifactState,
    studioTarget,
    studioLabel: studioTarget ? `Studio: ${studioTarget.target}` : 'Studio: scope review',
    copilotLabel: `Copilot: ${card.scope} evidence pack`,
    studioPayload: payload,
    copilotPayload: payload,
  };
}
