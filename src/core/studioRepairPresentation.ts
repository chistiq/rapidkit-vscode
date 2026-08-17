import type { WorkspaceRepairCliTransaction } from './workspaceRepairCliClient.js';

export function deduplicateStudioMessage(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const seen = new Set<string>();
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.replace(/\s+/g, ' ').toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(' ');
}

export type StudioRepairOutcomePresentation = {
  status: 'done' | 'review' | 'failed';
  phase: string;
  title: string;
  summary: string;
  requiresUserDecision: boolean;
  terminalReason?: string;
};

export function describeStudioRepairOutcome(
  transaction: Pick<WorkspaceRepairCliTransaction, 'state' | 'decision'>
): StudioRepairOutcomePresentation {
  const reason = deduplicateStudioMessage(transaction.decision?.reason);
  if (transaction.state === 'closed') {
    return {
      status: 'done',
      phase: 'repair-closed',
      title: 'Repair verified',
      summary: 'The CLI closed the transaction after canonical verification.',
      requiresUserDecision: false,
    };
  }
  if (transaction.state === 'decision-required' && transaction.decision) {
    return {
      status: 'review',
      phase: 'repair-decision-required',
      title: 'Decision required',
      summary: reason ?? 'The CLI requires an explicit engineering decision before continuing.',
      requiresUserDecision: true,
      terminalReason: 'cli-repair-decision-required',
    };
  }
  if (transaction.state === 'cancelled') {
    return {
      status: 'failed',
      phase: 'repair-cancelled',
      title: 'Automatic repair ended',
      summary:
        'Source ownership was released without an unverified success. No automatic repair remains pending.',
      requiresUserDecision: false,
      terminalReason: 'repair-cancelled',
    };
  }
  if (transaction.state === 'rolled-back') {
    return {
      status: 'failed',
      phase: 'repair-rolled-back',
      title: 'Source changes rolled back',
      summary:
        reason ?? 'The CLI restored the checkpoint because canonical verification did not close.',
      requiresUserDecision: false,
      terminalReason: 'repair-rolled-back',
    };
  }
  return {
    status: 'failed',
    phase: `repair-${transaction.state}`,
    title: 'Repair did not close',
    summary: reason ?? `The CLI repair ended in ${transaction.state}.`,
    requiresUserDecision: false,
    terminalReason: `repair-${transaction.state}`,
  };
}
