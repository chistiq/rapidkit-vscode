import type { NormalizedIncidentActionResultPayload } from './incidentStudioPayload';

export type GuidedIntentChip = {
  id: string;
  label: string;
  detail: string;
  kind: 'inline-command' | 'chat-brain-action';
  command: string;
  actionType?: string;
  actionId?: string;
  isPrimary: boolean;
};

function normalizeCommandText(raw: string): string {
  const normalized = raw.trim();
  return normalized.replace(/^npx\s+--yes\s+--package\s+rapidkit\s+rapidkit\b/i, 'rapidkit').trim();
}

export function buildGuidedIntentChips(input: {
  primaryBoardAction?: {
    label: string;
    command?: string;
    actionType?: string;
    actionId?: string;
  } | null;
  nextCommand?: string | null;
  verifyCommand?: string | null;
  verifyCommandPackRequired?: string | null;
  isProjectAnalysisScope: boolean;
}): GuidedIntentChip[] {
  const fallbackNextCommand = input.isProjectAnalysisScope
    ? 'rapidkit doctor project'
    : 'rapidkit doctor workspace';

  const nextChip: GuidedIntentChip = input.primaryBoardAction?.actionType
    ? {
        id: 'guided-board-action-chip',
        label: input.primaryBoardAction.label,
        detail: 'Run the primary remediation step and review generated changes.',
        kind: 'chat-brain-action',
        command: input.primaryBoardAction.label,
        actionType: input.primaryBoardAction.actionType,
        actionId: input.primaryBoardAction.actionId,
        isPrimary: true,
      }
    : input.primaryBoardAction
      ? {
          id: 'guided-board-action-chip',
          label: input.primaryBoardAction.label,
          detail: 'Run the primary remediation step now.',
          kind: 'inline-command',
          command: normalizeCommandText(input.primaryBoardAction.command || fallbackNextCommand),
          isPrimary: true,
        }
      : input.nextCommand
        ? {
            id: 'guided-next-command-chip',
            label: 'Do this next',
            detail: 'Run the primary remediation step now.',
            kind: 'inline-command',
            command: normalizeCommandText(input.nextCommand),
            isPrimary: true,
          }
        : {
            id: input.isProjectAnalysisScope
              ? 'guided-next-project-doctor'
              : 'guided-next-workspace-doctor',
            label: input.isProjectAnalysisScope ? 'Run project doctor' : 'Run workspace doctor',
            detail: input.isProjectAnalysisScope
              ? 'Start with deterministic project diagnostics before any fix.'
              : 'Start with deterministic workspace diagnostics before any fix.',
            kind: 'inline-command',
            command: fallbackNextCommand,
            isPrimary: true,
          };

  const verifyCommandRaw =
    input.verifyCommand || input.verifyCommandPackRequired || fallbackNextCommand;
  const verifyCommand = normalizeCommandText(verifyCommandRaw);
  const verifyChip: GuidedIntentChip = {
    id: 'guided-verify-command-chip',
    label: 'Proof this worked',
    detail: 'Run deterministic verification before claiming completion.',
    kind: 'inline-command',
    command: verifyCommand,
    isPrimary: false,
  };

  const chips: GuidedIntentChip[] = [{ ...nextChip, isPrimary: true }];
  if (nextChip.command !== verifyChip.command) {
    chips.push({ ...verifyChip, isPrimary: false });
  }

  return chips.slice(0, 2);
}

export function resolveGuidedIntentChipsFromStudioContext(input: {
  scopeType: 'workspace' | 'project';
  primaryBoardAction?: {
    label: string;
    command?: string;
    actionType?: string;
    actionId?: string;
  } | null;
  actionResult?: NormalizedIncidentActionResultPayload | null;
}): GuidedIntentChip[] {
  const verifyPackRequired =
    input.actionResult?.verifyCommandPack?.commands.find((entry) => entry.required)?.command ||
    input.actionResult?.verifyCommandPack?.commands[0]?.command ||
    null;

  return buildGuidedIntentChips({
    primaryBoardAction: input.primaryBoardAction ?? null,
    nextCommand: input.actionResult?.decisionClarity?.nextStep ?? null,
    verifyCommand: input.actionResult?.decisionClarity?.verifyPlan[0] ?? null,
    verifyCommandPackRequired: verifyPackRequired,
    isProjectAnalysisScope: input.scopeType === 'project',
  });
}
