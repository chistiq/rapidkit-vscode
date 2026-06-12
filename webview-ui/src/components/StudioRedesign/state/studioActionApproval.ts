import { AIActionContractView } from './studioState';

export type StudioActionApprovalTone = 'ok' | 'warning' | 'error' | 'neutral';

export interface StudioActionApprovalGate {
  tone: StudioActionApprovalTone;
  label: 'Ready for approval' | 'Needs review' | 'Blocked' | 'No contract';
  summary: string;
  riskLabel: string;
  requiresApproval: boolean;
  hardBlocked: boolean;
  mutationSensitive: boolean;
  canApplyAfterApproval: boolean;
  canVerify: boolean;
  canRollbackAfterApproval: boolean;
  metrics: Array<{
    label: string;
    value: string;
    tone: StudioActionApprovalTone;
  }>;
  holds: Array<{
    code: string;
    detail: string;
    tone: StudioActionApprovalTone;
  }>;
}

export function buildStudioActionApprovalGate(
  actionContract?: AIActionContractView | null
): StudioActionApprovalGate {
  if (!actionContract?.contract) {
    return {
      tone: 'neutral',
      label: 'No contract',
      summary: 'Generate a governed action contract before apply, verify, or rollback.',
      riskLabel: 'n/a',
      requiresApproval: true,
      hardBlocked: true,
      mutationSensitive: false,
      canApplyAfterApproval: false,
      canVerify: false,
      canRollbackAfterApproval: false,
      metrics: [],
      holds: [
        { code: 'missing-contract', detail: 'No AI action contract is loaded.', tone: 'warning' },
      ],
    };
  }

  const { contract, validation } = actionContract;
  const errorIssues = validation.issues.filter((issue) => issue.severity === 'error');
  const warningIssues = validation.issues.filter((issue) => issue.severity === 'warning');
  const structuralHolds: StudioActionApprovalGate['holds'] = [];

  if (contract.requiresApproval !== true) {
    structuralHolds.push({
      code: 'approval-required',
      detail: 'Action contracts must require explicit user approval.',
      tone: 'error',
    });
  }
  if (contract.actionType === 'fix' && contract.affectedFiles.length === 0) {
    structuralHolds.push({
      code: 'missing-affected-files',
      detail: 'Fix contracts must declare affected files.',
      tone: 'error',
    });
  }
  if (contract.actionType === 'fix' && contract.rollbackPlan.length === 0) {
    structuralHolds.push({
      code: 'missing-rollback',
      detail: 'Fix contracts must include a rollback plan.',
      tone: 'error',
    });
  }
  if (contract.verificationCommands.length === 0) {
    structuralHolds.push({
      code: 'missing-verification',
      detail: 'Verification commands are required before execution.',
      tone: 'error',
    });
  }

  const hardBlocked =
    validation.status === 'blocked' ||
    errorIssues.length > 0 ||
    structuralHolds.some((hold) => hold.tone === 'error');
  const needsReview =
    validation.status === 'needs-review' ||
    warningIssues.length > 0 ||
    contract.riskLevel === 'high';
  const mutationSensitive = contract.actionType === 'fix' || contract.proposedCommands.length > 0;
  const tone: StudioActionApprovalTone = hardBlocked ? 'error' : needsReview ? 'warning' : 'ok';

  return {
    tone,
    label: hardBlocked ? 'Blocked' : needsReview ? 'Needs review' : 'Ready for approval',
    summary: hardBlocked
      ? 'Execution is held until contract blockers are resolved.'
      : needsReview
        ? 'Review risk, files, commands, and rollback proof before execution.'
        : 'Contract is valid and ready for explicit approval.',
    riskLabel: `${contract.riskLevel} risk · ${Math.round(contract.confidence * 100)}% confidence`,
    requiresApproval: contract.requiresApproval,
    hardBlocked,
    mutationSensitive,
    canApplyAfterApproval: validation.canApply && !hardBlocked,
    canVerify: validation.canVerify && !hardBlocked,
    canRollbackAfterApproval: validation.canRollback && !hardBlocked,
    metrics: [
      {
        label: 'Risk',
        value: contract.riskLevel,
        tone: contract.riskLevel === 'high' ? 'warning' : 'ok',
      },
      {
        label: 'Files',
        value: String(contract.affectedFiles.length),
        tone: contract.affectedFiles.length ? 'ok' : 'warning',
      },
      {
        label: 'Apply cmds',
        value: String(contract.proposedCommands.length),
        tone: contract.proposedCommands.length ? 'ok' : 'neutral',
      },
      {
        label: 'Verify cmds',
        value: String(contract.verificationCommands.length),
        tone: contract.verificationCommands.length ? 'ok' : 'error',
      },
      {
        label: 'Rollback',
        value: String(contract.rollbackPlan.length),
        tone: contract.rollbackPlan.length
          ? 'ok'
          : contract.actionType === 'fix'
            ? 'error'
            : 'neutral',
      },
      {
        label: 'Issues',
        value: String(validation.issues.length),
        tone: errorIssues.length ? 'error' : warningIssues.length ? 'warning' : 'ok',
      },
    ],
    holds: [
      ...structuralHolds,
      ...validation.issues.map((issue) => ({
        code: issue.code,
        detail: issue.detail,
        tone: issue.severity === 'error' ? ('error' as const) : ('warning' as const),
      })),
    ],
  };
}
