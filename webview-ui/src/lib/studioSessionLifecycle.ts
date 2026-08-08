import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';

export type StudioTerminalFailurePresentation = {
  title: string;
  summary: string;
  technicalDetail?: string;
  terminalReason?: string;
  connectionFailure: boolean;
};

export function describeStudioTerminalFailure(input: {
  error: string;
  terminalReason?: string;
  requiresUserDecision?: boolean;
}): StudioTerminalFailurePresentation {
  const error = input.error.trim();
  const terminalReason = input.terminalReason?.trim() || undefined;
  const connectionFailure =
    terminalReason === 'cli-repair-contract-mismatch' ||
    /repair protocol handshake failed|no installed executable is safe to use/i.test(error);
  if (connectionFailure) {
    return {
      title: 'CLI connection failed',
      summary:
        'Studio could not start the repair because VS Code could not launch the installed Workspai CLI. No workspace files were changed.',
      ...(error ? { technicalDetail: error } : {}),
      terminalReason: terminalReason ?? 'cli-repair-contract-mismatch',
      connectionFailure: true,
    };
  }
  if (input.requiresUserDecision) {
    return {
      title: 'Decision required',
      summary: error || 'Studio needs your approval before it can continue safely.',
      terminalReason: terminalReason ?? 'review-required',
      connectionFailure: false,
    };
  }
  return {
    title: 'Repair stopped',
    summary: error || 'Studio stopped before canonical verification could close the repair.',
    ...(terminalReason ? { terminalReason } : {}),
    connectionFailure: false,
  };
}

export function isStudioRepairActivelyOwned(input: {
  sessionStatus?: string;
  autoFixBusy: boolean;
  patchApplyBusy: boolean;
  progressStatus?: SidebarStudioActionProgressView['status'];
}): boolean {
  if (input.sessionStatus !== 'streaming') {
    return false;
  }
  return input.autoFixBusy || input.patchApplyBusy || input.progressStatus === 'running';
}

export function terminalizeStudioProgress(
  progress: SidebarStudioActionProgressView | null | undefined,
  input: {
    title: string;
    summary: string;
    reviewRequired?: boolean;
    terminalReason?: string;
    technicalDetail?: string;
  }
): SidebarStudioActionProgressView | null {
  if (!progress) {
    return null;
  }
  return {
    ...progress,
    status: input.reviewRequired ? 'review' : 'failed',
    phase: input.reviewRequired ? 'decision-required' : 'repair-stopped',
    title: input.title,
    summary: input.summary,
    terminalReason: input.terminalReason,
    technicalDetail: input.technicalDetail,
    nextAction: undefined,
    nextActionLabel: undefined,
  };
}

export function terminalizeStudioTimeline(
  timeline: SidebarStudioActionProgressView[],
  input: Parameters<typeof terminalizeStudioProgress>[1]
): SidebarStudioActionProgressView[] {
  const last = timeline[timeline.length - 1];
  const terminal = terminalizeStudioProgress(last, input);
  if (!terminal) {
    return [];
  }
  if (input.terminalReason === 'cli-repair-contract-mismatch') {
    return [terminal];
  }
  const history = settleStudioTimeline(timeline.slice(0, -1))
    .filter((entry) => entry.status !== 'failed')
    .slice(-5);
  return [...history, terminal];
}

export function settleStudioTimeline(
  timeline: SidebarStudioActionProgressView[]
): SidebarStudioActionProgressView[] {
  return timeline.map((entry) =>
    entry.status === 'running'
      ? {
          ...entry,
          status: 'done',
          phase: entry.phase === 'observing-evidence' ? 'evidence-observed' : entry.phase,
          nextAction: undefined,
          nextActionLabel: undefined,
        }
      : entry
  );
}
