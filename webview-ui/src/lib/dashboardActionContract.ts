import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { resolveDashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from './dashboardEvidence';
import { isCorruptArtifactCard } from './dashboardEvidence';
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
  artifactState: DashboardEvidenceArtifactState;
  studioTarget?: ReturnType<typeof buildIncidentStudioEvidenceOpen>;
  studioLabel: string;
  copilotLabel: string;
  primaryAction: DashboardEvidencePrimaryAction;
  studioPayload: DashboardEvidenceAgentPayload;
  copilotPayload: DashboardEvidenceAgentPayload;
}

export type DashboardEvidencePrimaryAction =
  | { type: 'run'; label: string }
  | { type: 'studio'; label: string }
  | { type: 'done'; label: string };

export type DashboardEvidenceArtifactState = 'ready' | 'pending' | 'corrupt';

export type DashboardEvidenceAgentCard = Pick<
  DashboardEvidenceCard,
  | 'id'
  | 'label'
  | 'status'
  | 'summary'
  | 'scope'
  | 'artifactPath'
  | 'blockers'
  | 'metrics'
  | 'incidentSummary'
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
    artifactState: DashboardEvidenceArtifactState;
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
    incidentSummary: card.incidentSummary,
  };
}

function buildEvidenceAgentPayload(
  card: DashboardEvidenceCard,
  options: {
    workspace?: EvidenceWorkspaceContext;
    project?: EvidenceWorkspaceContext;
    commandAction?: DashboardEvidenceCommandAction;
    studioTarget?: ReturnType<typeof buildIncidentStudioEvidenceOpen>;
    artifactState: DashboardEvidenceArtifactState;
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

function resolvePrimaryEvidenceAction(input: {
  card: DashboardEvidenceCard;
  commandAction?: DashboardEvidenceCommandAction;
  studioTarget?: ReturnType<typeof buildIncidentStudioEvidenceOpen>;
}): DashboardEvidencePrimaryAction {
  if (input.card.status === 'pass') {
    return { type: 'done', label: 'Done' };
  }
  if (isCorruptArtifactCard(input.card) && input.commandAction) {
    return { type: 'run', label: input.commandAction.label };
  }
  if (input.card.status === 'missing' && input.commandAction) {
    return { type: 'run', label: input.commandAction.label || 'Run once' };
  }
  if ((input.card.status === 'fail' || input.card.status === 'warn') && input.studioTarget) {
    return {
      type: 'studio',
      label: input.card.status === 'fail' ? 'Fix in Studio' : 'Open in Studio',
    };
  }
  if (input.commandAction) {
    return { type: 'run', label: input.commandAction.label };
  }
  return { type: 'studio', label: input.studioTarget ? 'Open in Studio' : 'Review' };
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
  const corruptArtifact = isCorruptArtifactCard(card);
  const artifactState: DashboardEvidenceArtifactState = corruptArtifact
    ? 'corrupt'
    : artifactReady
      ? 'ready'
      : 'pending';
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
    artifactLabel: corruptArtifact
      ? `Corrupt artifact: ${artifactLabel(card.artifactPath)}`
      : Number(card.metrics?.derivedArtifact ?? 0) > 0
        ? `Derived: ${artifactLabel(card.artifactPath)}`
        : artifactLabel(card.artifactPath),
    artifactState,
    studioTarget,
    studioLabel: studioTarget ? `Studio: ${studioTarget.target}` : 'Studio: scope review',
    copilotLabel: `Copilot: ${card.scope} evidence pack`,
    primaryAction: resolvePrimaryEvidenceAction({ card, commandAction, studioTarget }),
    studioPayload: payload,
    copilotPayload: payload,
  };
}
