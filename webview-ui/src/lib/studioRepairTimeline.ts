import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';

export const STUDIO_REPAIR_TIMELINE_LIMIT = 40;

function activityKind(phase: string): 'inspect' | 'fix' | 'verify' | 'complete' {
  if (/verif|readiness|contract/i.test(phase)) {
    return 'verify';
  }
  if (/appl|patch|fix|remedi|command/i.test(phase)) {
    return 'fix';
  }
  if (/resolv|complete|done/i.test(phase)) {
    return 'complete';
  }
  return 'inspect';
}

function progressIdentity(progress: SidebarStudioActionProgressView): string {
  if (progress.action === 'cli-repair-engine' || (progress.phase ?? '').startsWith('cli-repair-')) {
    return 'activity:cli-repair';
  }
  if (progress.action === 'live-evidence' || progress.phase === 'observing-evidence') {
    return 'live-evidence:observing-evidence';
  }
  // Reads are supporting activity, not separate repair outcomes. Coalesce
  // consecutive source/evidence/search/diagnostic observations into the latest
  // visible read, like a modern agent transcript, while retaining actual
  // mutations, validation, decisions, and failures as distinct entries.
  if (activityKind(progress.phase ?? progress.action) === 'inspect') {
    return 'activity:inspect';
  }
  if (progress.policyRejected) {
    return [
      'policy-rejected',
      progress.action,
      progress.commandText?.trim().replace(/\s+/g, ' ') ?? progress.phase ?? '',
    ].join(':');
  }
  return progress.invocationId
    ? `invocation:${progress.invocationId}`
    : [activityKind(progress.phase ?? progress.action), progress.action].join(':');
}

/**
 * Preserve user-visible repair phases instead of replacing the entire Studio
 * status card on every host event. Repeated heartbeats update the latest phase.
 */
export function appendStudioRepairTimelineEntry(
  timeline: SidebarStudioActionProgressView[],
  progress: SidebarStudioActionProgressView
): SidebarStudioActionProgressView[] {
  const previous = timeline[timeline.length - 1];
  if (previous && progressIdentity(previous) === progressIdentity(progress)) {
    const repeatedInvocation =
      previous.policyRejected === true &&
      progress.policyRejected === true &&
      previous.invocationId !== progress.invocationId;
    return [
      ...timeline.slice(0, -1),
      {
        ...progress,
        occurrences: repeatedInvocation
          ? (previous.occurrences ?? 1) + 1
          : (progress.occurrences ?? previous.occurrences),
      },
    ];
  }
  return [...timeline, progress].slice(-STUDIO_REPAIR_TIMELINE_LIMIT);
}
