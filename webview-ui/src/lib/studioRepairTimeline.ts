import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';

export const STUDIO_REPAIR_TIMELINE_LIMIT = 40;

export function studioTimelineActivityKind(
  progress: Pick<SidebarStudioActionProgressView, 'action' | 'phase' | 'title'>
): 'inspect' | 'fix' | 'verify' | 'complete' {
  if (progress.action === 'start-terminal' || progress.action === 'terminal-command') {
    return 'fix';
  }
  if (progress.action === 'cli-repair-engine' || (progress.phase ?? '').startsWith('cli-repair-')) {
    return 'fix';
  }
  if (/^(inspect|read|search|list|discover|delegate)-/.test(progress.action)) {
    return 'inspect';
  }
  const phase = `${progress.phase ?? ''} ${progress.action}`;
  if (/verif|readiness|contract/i.test(phase)) {
    return 'verify';
  }
  if (/appl|patch|fix|remedi|command|prepar/i.test(phase)) {
    return 'fix';
  }
  if (/resolv|complete|done/i.test(phase)) {
    return 'complete';
  }
  return 'inspect';
}

export function studioHistoricalActivityLabel(progress: SidebarStudioActionProgressView): string {
  if (progress.transactionState === 'rolled-back') {
    return 'Restored';
  }
  const kind = studioTimelineActivityKind(progress);
  const verifyPassed =
    progress.status === 'done' &&
    (progress.phase === 'verified' ||
      progress.phase === 'goal-verified' ||
      /verified$/i.test(progress.title ?? ''));
  if (progress.status === 'failed' || (kind === 'verify' && !verifyPassed)) {
    if (kind === 'verify') {
      return 'Not verified';
    }
    if (kind === 'fix') {
      return 'Did not apply';
    }
    if (kind === 'inspect' && (progress.occurrences ?? 0) >= 2) {
      return 'Inspected';
    }
    return 'Failed';
  }
  if (progress.status === 'review') {
    return kind === 'verify' ? 'Not verified' : 'Needs approval';
  }
  if (verifyPassed) {
    return 'Verified';
  }
  if (progress.changedPaths?.length) {
    return 'Changed';
  }
  if (
    progress.action === 'live-evidence' ||
    progress.action === 'run-governed-command' ||
    progress.title === 'Evidence refreshed'
  ) {
    return 'Evidence refreshed';
  }
  if (/prepar|repair path/i.test(`${progress.phase ?? ''} ${progress.title ?? ''}`)) {
    return 'Prepared';
  }
  if (kind === 'fix' && /approv/i.test(`${progress.phase ?? ''} ${progress.title ?? ''}`)) {
    return 'Prepared';
  }
  if (kind === 'fix') {
    return 'Applied';
  }
  if (kind === 'complete') {
    return 'Resolved';
  }
  return 'Inspected';
}

export function isNoisyStudioInspectFailure(progress: SidebarStudioActionProgressView): boolean {
  return (
    progress.status === 'failed' &&
    studioTimelineActivityKind(progress) === 'inspect' &&
    progress.policyRejected !== true &&
    (progress.occurrences ?? 1) < 2
  );
}

export function studioHistoricalOutcomeStatus(
  progress: SidebarStudioActionProgressView
): SidebarStudioActionProgressView['status'] {
  const label = studioHistoricalActivityLabel(progress);
  if (label === 'Needs approval') {
    return 'review';
  }
  if (
    label === 'Not verified' ||
    label === 'Did not apply' ||
    label === 'Failed' ||
    label === 'Restored'
  ) {
    return 'failed';
  }
  if (progress.status === 'running') {
    return 'running';
  }
  if (progress.status === 'review') {
    return 'review';
  }
  return progress.status === 'failed' ? 'failed' : 'done';
}

export function studioTimelineOccurrenceLabel(
  progress: SidebarStudioActionProgressView
): string | undefined {
  if (!progress.occurrences || progress.occurrences < 2) {
    return undefined;
  }
  const unit = studioTimelineActivityKind(progress) === 'inspect' ? 'reads' : 'attempts';
  return `${studioHistoricalActivityLabel(progress)} · ${progress.occurrences} ${unit}`;
}

export function studioVisibleRepairHistory(
  timeline: SidebarStudioActionProgressView[]
): SidebarStudioActionProgressView[] {
  return timeline.slice(-7, -1);
}

export function studioRepairHistoryDisclosureLabel(
  timeline: SidebarStudioActionProgressView[]
): string {
  const history = studioVisibleRepairHistory(timeline);
  const stepCount = history.length;
  const reads = history.reduce((sum, entry) => {
    if (studioTimelineActivityKind(entry) !== 'inspect') {
      return sum;
    }
    return sum + Math.max(1, entry.occurrences ?? 1);
  }, 0);
  const steps = `Worked on ${stepCount} step${stepCount === 1 ? '' : 's'}`;
  return reads > stepCount ? `${steps} · ${reads} file reads` : steps;
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
  if (studioTimelineActivityKind(progress) === 'inspect') {
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
    : [studioTimelineActivityKind(progress), progress.action].join(':');
}

/**
 * Preserve user-visible repair phases instead of replacing the entire Studio
 * status card on every host event. Repeated heartbeats update the latest phase.
 */
export function appendStudioRepairTimelineEntry(
  timeline: SidebarStudioActionProgressView[],
  progress: SidebarStudioActionProgressView,
  coalesce = true,
  limit = STUDIO_REPAIR_TIMELINE_LIMIT
): SidebarStudioActionProgressView[] {
  // Permission, approval, start and completion are phases of the same call.
  // Match by invocation before the activity-kind coalescer: changing from
  // "command-approved" to a tool's own phase must not strand an old spinner.
  const invocationIndex = progress.invocationId
    ? timeline.findIndex(
        (entry) =>
          entry.invocationId === progress.invocationId &&
          (entry.requestId === progress.requestId ||
            (Boolean(entry.receipt) && entry.receipt?.eventId === progress.receipt?.eventId))
      )
    : -1;
  if (invocationIndex >= 0) {
    const existing = timeline[invocationIndex];
    const phaseHistory = [
      ...new Map(
        [
          ...(existing.phaseHistory ?? []),
          ...(existing.receipt ? [existing.receipt] : []),
          ...(progress.receipt ? [progress.receipt] : []),
        ].map((receipt) => [receipt.eventId, receipt])
      ).values(),
    ].sort((a, b) => a.sequence - b.sequence);
    if ((existing.eventSequence ?? 0) > (progress.eventSequence ?? Number.MAX_SAFE_INTEGER)) {
      return phaseHistory.length
        ? timeline.map((entry, index) =>
            index === invocationIndex ? { ...entry, phaseHistory } : entry
          )
        : timeline;
    }
    return timeline.map((entry, index) =>
      index === invocationIndex
        ? {
            ...progress,
            ...(phaseHistory.length ? { phaseHistory } : {}),
            receipt: progress.receipt ?? entry.receipt,
            fileChanges:
              progress.fileChanges?.length || progress.transactionState === 'rolled-back'
                ? progress.fileChanges
                : entry.fileChanges,
            changedPaths:
              progress.changedPaths?.length || progress.transactionState === 'rolled-back'
                ? progress.changedPaths
                : entry.changedPaths,
            activityPaths: progress.activityPaths?.length
              ? progress.activityPaths
              : entry.activityPaths,
            transactionId: progress.transactionId ?? entry.transactionId,
            transactionState: progress.transactionState ?? entry.transactionState,
            outputText: progress.outputText ?? entry.outputText,
            outputWarning: progress.outputWarning ?? entry.outputWarning,
            contentParts: progress.contentParts ?? entry.contentParts,
            transcriptId: entry.transcriptId ?? progress.transcriptId,
            commandText: progress.commandText ?? entry.commandText,
          }
        : entry
    );
  }
  const previous = timeline[timeline.length - 1];
  if (
    coalesce &&
    previous &&
    previous.requestId === progress.requestId &&
    progressIdentity(previous) === progressIdentity(progress)
  ) {
    const repeatedInvocation =
      previous.invocationId !== progress.invocationId &&
      Boolean(progress.invocationId) &&
      (previous.policyRejected === true || studioTimelineActivityKind(progress) === 'inspect');
    return [
      ...timeline.slice(0, -1),
      {
        ...progress,
        transcriptId: previous.transcriptId ?? progress.transcriptId,
        ...(previous.activityPaths?.length || progress.activityPaths?.length
          ? {
              activityPaths: [
                ...new Set([...(previous.activityPaths ?? []), ...(progress.activityPaths ?? [])]),
              ].slice(-100),
            }
          : {}),
        occurrences: repeatedInvocation
          ? (previous.occurrences ?? 1) + 1
          : (progress.occurrences ?? previous.occurrences),
      },
    ];
  }
  return [...timeline, progress].slice(-limit);
}
