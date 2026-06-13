import type { AIActionContractView } from '@/components/StudioRedesign/state/studioState';
import { buildStudioActionApprovalGate } from '@/components/StudioRedesign/state/studioActionApproval';

export type StudioAIActionOperation = 'apply' | 'verify' | 'rollback';

export function resolveStudioAIActionOperationBlockReason(
  operation: StudioAIActionOperation,
  actionContract?: AIActionContractView | null,
  options?: {
    policyMutationBlocked?: boolean;
    policyReason?: string;
  }
): string | null {
  if (options?.policyMutationBlocked && (operation === 'apply' || operation === 'rollback')) {
    return options.policyReason || 'Enterprise policy gates are blocking mutating actions.';
  }

  if (!actionContract?.contract) {
    return 'No governed AI action contract is loaded.';
  }

  const approvalGate = buildStudioActionApprovalGate(actionContract);
  if (operation === 'apply') {
    if (!actionContract.validation.canApply) {
      return 'Contract validation blocked apply for this action.';
    }
    if (!approvalGate.canApplyAfterApproval) {
      return approvalGate.holds[0]?.detail || 'Apply is blocked until contract review passes.';
    }
  }

  if (operation === 'verify') {
    if (!actionContract.validation.canVerify) {
      return 'Contract validation blocked verify for this action.';
    }
    if (!approvalGate.canVerify) {
      return approvalGate.holds[0]?.detail || 'Verify is blocked until contract review passes.';
    }
  }

  if (operation === 'rollback') {
    if (!actionContract.validation.canRollback) {
      return 'Contract validation blocked rollback for this action.';
    }
    if (!approvalGate.canRollbackAfterApproval) {
      return approvalGate.holds[0]?.detail || 'Rollback is blocked until contract review passes.';
    }
  }

  return null;
}

export function canDispatchStudioAIActionOperation(
  operation: StudioAIActionOperation,
  actionContract?: AIActionContractView | null,
  options?: {
    policyMutationBlocked?: boolean;
    policyReason?: string;
  }
): boolean {
  return resolveStudioAIActionOperationBlockReason(operation, actionContract, options) === null;
}
