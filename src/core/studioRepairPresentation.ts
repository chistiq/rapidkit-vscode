import type { WorkspaceRepairCliTransaction } from './workspaceRepairCliClient.js';
import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';

const MAX_STUDIO_REPAIR_MESSAGE_CHARS = 700;

/**
 * Convert CLI-owned diagnostic prose into a bounded, portable UI summary.
 *
 * Complete machine evidence remains available through governed artifacts and
 * transaction inspection. Cards and Chat must never render an embedded JSON
 * report, local filesystem roots, or an unbounded command payload.
 */
export function summarizeStudioRepairMessage(value: string | undefined): string | undefined {
  const redacted = redactLocalPathsForConsumer(value ?? '').trim();
  if (!redacted) {
    return undefined;
  }
  if (/^Target precondition failed before checkpoint:/i.test(redacted)) {
    return 'Fresh evidence no longer matched the approved repair target. Studio will compile a new bounded plan before changing source.';
  }
  const structuredPayload = redacted.search(/(?:^|:\s*)(?:[{]|[[])\s*(?:["{]|[[])/);
  const withoutPayload =
    structuredPayload >= 0 && redacted.length - structuredPayload > 240
      ? `${redacted.slice(0, structuredPayload).replace(/[:\s]+$/, '')}. Detailed diagnostics remain available in the governed transaction.`
      : redacted;
  const normalized = withoutPayload.replace(/\s+/g, ' ').trim();
  return normalized.length <= MAX_STUDIO_REPAIR_MESSAGE_CHARS
    ? normalized
    : `${normalized.slice(0, MAX_STUDIO_REPAIR_MESSAGE_CHARS - 1).trimEnd()}…`;
}

export function deduplicateStudioMessage(value: string | undefined): string | undefined {
  const trimmed = summarizeStudioRepairMessage(value);
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
    const modelCorrectableProposal =
      transaction.decision.options?.length === 1 &&
      transaction.decision.options[0] === 'cancel' &&
      Boolean(transaction.decision.causes?.length) &&
      transaction.decision.causes?.every((cause) => cause.kind === 'failed-precondition');
    if (modelCorrectableProposal) {
      return {
        status: 'review',
        phase: 'repair-replan-required',
        title: 'Refining source target',
        summary:
          reason ??
          'The proposed source change did not prove progress. Studio is tracing the exact causal finding and compiling a different bounded proposal.',
        requiresUserDecision: false,
      };
    }
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
