import {
  studioActivityReceipt,
  type StudioActivityReceipt,
} from '@workspai-contracts/studioActivity';
import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';

/** History is observation only: it cannot restore approvals, execution or destinations. */
export function studioReceiptProgress(
  receipt: StudioActivityReceipt,
  historical = false
): SidebarStudioActionProgressView {
  return {
    action: `activity:${receipt.kind}`,
    status: historical && receipt.status === 'running' ? 'review' : receipt.status,
    phase: receipt.eventType,
    title: receipt.title,
    summary:
      historical && receipt.status === 'running'
        ? `${receipt.summary} Recorded start/progress; no current execution is implied.`.trim()
        : receipt.summary,
    sessionId: receipt.sessionId,
    requestId: receipt.requestId,
    invocationId: receipt.invocationId ?? `event:${receipt.eventId}`,
    eventType: receipt.eventType,
    eventSequence: receipt.sequence,
    receipt,
  };
}
export function studioEventProgress(event: unknown, historical = false) {
  const receipt = studioActivityReceipt(event);
  return receipt ? studioReceiptProgress(receipt, historical) : undefined;
}
