import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';

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
  input: { title: string; summary: string; reviewRequired?: boolean }
): SidebarStudioActionProgressView | null {
  if (!progress) {
    return null;
  }
  return {
    ...progress,
    status: input.reviewRequired ? 'review' : 'done',
    phase: input.reviewRequired ? 'decision-required' : 'repair-stopped',
    title: input.title,
    summary: input.summary,
    nextAction: undefined,
    nextActionLabel: undefined,
  };
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
