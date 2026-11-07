import {
  studioActivityReceipt,
  correlateStudioActivityReceipts,
  type StudioActivityReceipt,
} from '@workspai-contracts/studioActivity';
import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';

const toolLabels: Record<string, string> = {
  'inspect-agent-instructions': 'Read repository instructions',
  'inspect-workspace': 'Read workspace inventory',
  'inspect-project-agent-entry': 'Check project grounding',
  'inspect-workspace-changes': 'Review workspace changes',
  'onboard-project': 'Register project with Workspai',
  'query-workspace-graph': 'Search workspace graph',
  'run-workspace-command': 'Run project command',
  'verify-blocker': 'Check diagnostics and changes',
};

/** History is observation only: it cannot restore approvals, execution or destinations. */
export function studioReceiptProgress(
  receipt: StudioActivityReceipt,
  historical = false
): SidebarStudioActionProgressView {
  return {
    action: `activity:${receipt.kind}`,
    status: historical && receipt.status === 'running' ? 'review' : receipt.status,
    phase: receipt.eventType,
    title:
      receipt.kind === 'tool' && receipt.toolName
        ? (toolLabels[receipt.toolName] ?? receipt.title)
        : receipt.title,
    summary:
      historical && receipt.status === 'running'
        ? `${receipt.summary} Recorded start/progress; no current execution is implied.`.trim()
        : /^Model selected governed tool [\w-]+\.$/.test(receipt.summary)
          ? ''
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

export function isStudioChangeObservation(
  entry: Pick<SidebarStudioActionProgressView, 'action' | 'receipt'>
): boolean {
  return ['inspect-workspace-changes', 'verify-blocker', 'verify-goal'].includes(
    entry.receipt?.toolName ?? entry.action
  );
}

/** Successful model transport is supporting history of the action it chose.
 * Keep running/failed decisions visible, and never cross a request boundary.
 * No receipt is discarded and separate tool invocations remain separate.
 */
export function compactStudioActivityEntries(
  entries: readonly SidebarStudioActionProgressView[]
): SidebarStudioActionProgressView[] {
  const supporting = (entry: SidebarStudioActionProgressView) =>
    entry.receipt?.kind === 'session' ||
    entry.receipt?.eventType === 'request.started' ||
    (entry.receipt?.kind === 'checkpoint' && entry.status === 'done');
  const receipts = (entry: SidebarStudioActionProgressView) => [
    ...(entry.phaseHistory ?? []),
    ...(entry.receipt ? [entry.receipt] : []),
  ];
  const bounds = (entry: SidebarStudioActionProgressView) => {
    const sequences = receipts(entry).map((receipt) => receipt.sequence);
    return { start: Math.min(...sequences), end: Math.max(...sequences) };
  };
  const actions = entries.filter((entry) => !supporting(entry));
  const owners = new Map<string, string | undefined>();
  for (const sessionId of new Set(entries.map((entry) => entry.sessionId))) {
    const sessionReceipts = entries
      .filter((entry) => entry.sessionId === sessionId)
      .flatMap(receipts)
      .sort((a, b) => a.sequence - b.sequence);
    for (const receipt of correlateStudioActivityReceipts(sessionReceipts)) {
      owners.set(receipt.eventId, receipt.requestId);
    }
  }
  const attached = new Map<SidebarStudioActionProgressView, StudioActivityReceipt[]>();
  const standalone = new Set<SidebarStudioActionProgressView>();
  // Session states may have no requestId. Anchor only inside an observed call's
  // interval, or to the closest action in the same session/request. Keep all
  // original receipts in that action's disclosure, without replaying controls.
  for (const entry of entries.filter(supporting)) {
    const sequence = entry.receipt!.sequence;
    const requestId = entry.requestId ?? owners.get(entry.receipt!.eventId);
    const candidates = actions.filter(
      (action) =>
        action.receipt &&
        action.sessionId === entry.sessionId &&
        (requestId ? action.requestId === requestId : !action.requestId)
    );
    const within = candidates.find((action) => {
      const range = bounds(action);
      return range.start <= sequence && range.end >= sequence;
    });
    const previous = candidates
      .filter((action) => bounds(action).end <= sequence)
      .sort((a, b) => bounds(b).end - bounds(a).end)[0];
    const next = candidates
      .filter((action) => bounds(action).start >= sequence)
      .sort((a, b) => bounds(a).start - bounds(b).start)[0];
    const owner = within ?? previous ?? next;
    if (owner) {
      attached.set(owner, [...(attached.get(owner) ?? []), ...receipts(entry)]);
    } else {
      standalone.add(entry);
    }
  }
  const projected = entries
    .filter((entry) => !supporting(entry) || standalone.has(entry))
    .map((entry) =>
      attached.has(entry)
        ? {
            ...entry,
            phaseHistory: [
              ...new Map(
                [...receipts(entry), ...attached.get(entry)!].map((receipt) => [
                  receipt.eventId,
                  receipt,
                ])
              ).values(),
            ].sort((a, b) => a.sequence - b.sequence),
          }
        : entry
    );
  const result: SidebarStudioActionProgressView[] = [];
  for (const entry of projected) {
    const previous = result.at(-1);
    if (
      previous?.receipt?.kind === 'model' &&
      previous.status === 'done' &&
      entry.receipt &&
      ['tool', 'approval', 'permission', 'verification', 'outcome'].includes(entry.receipt.kind) &&
      previous.sessionId === entry.sessionId &&
      previous.requestId &&
      previous.requestId === entry.requestId
    ) {
      const receipts = [
        ...(previous.phaseHistory ?? []),
        previous.receipt,
        ...(entry.phaseHistory ?? []),
        entry.receipt,
      ];
      result[result.length - 1] = {
        ...entry,
        phaseHistory: [
          ...new Map(receipts.map((receipt) => [receipt.eventId, receipt])).values(),
        ].sort((left, right) => left.sequence - right.sequence),
      };
    } else {
      result.push(entry);
    }
  }
  return result;
}
