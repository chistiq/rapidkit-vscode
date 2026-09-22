import type { SidebarStudioActionProgressView } from './sidebarStudioActionProgress';
import { isNoisyStudioInspectFailure, studioTimelineActivityKind } from './studioRepairTimeline';

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
  repairTransactionState?: string;
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
  if (terminalReason === 'ai-provider-unavailable') {
    if (input.repairTransactionState === 'rolled-back') {
      return {
        title: 'Latest repair rolled back · AI connection needed',
        summary:
          'The CLI restored the bounded source change because verification remained blocked. Reconnect the AI provider to plan a different causal source repair.',
        ...(error ? { technicalDetail: error } : {}),
        terminalReason,
        connectionFailure: false,
      };
    }
    return {
      title: 'AI connection needed',
      summary:
        'Studio could not reach the configured AI provider. The latest CLI repair outcome is retained; reconnect before requesting a new source proposal.',
      ...(error ? { technicalDetail: error } : {}),
      terminalReason,
      connectionFailure: false,
    };
  }
  if (
    terminalReason === 'environment-prerequisite-required' ||
    terminalReason === 'repair-toolchain-unavailable'
  ) {
    return {
      title: 'Environment setup required',
      summary:
        error ||
        'A required runtime or executable is unavailable. Configure it, then recheck the environment to produce a fresh repair plan.',
      terminalReason,
      connectionFailure: false,
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
  if (terminalReason === 'repair-cancelled') {
    return {
      title: 'Automatic repair ended',
      summary:
        error ||
        'Source ownership was released without an unverified success. No automatic repair remains pending.',
      terminalReason,
      connectionFailure: false,
    };
  }
  if (terminalReason === 'repair-rolled-back') {
    return {
      title: 'Source changes rolled back',
      summary: error || 'The CLI restored its checkpoint after verification remained blocked.',
      terminalReason,
      connectionFailure: false,
    };
  }
  if (terminalReason === 'source-repair-policy-loop') {
    return {
      title: 'Recovery stopped',
      summary:
        'Studio blocked a repeated evidence command because no materially different causal action followed. Governed workspace state remains available for review.',
      ...(error ? { technicalDetail: error } : {}),
      terminalReason,
      connectionFailure: false,
    };
  }
  if (terminalReason === 'model-tool-protocol-exhausted') {
    return {
      title: 'Model cannot drive tools',
      summary:
        'This model did not return a valid tool call. Switch to a tool-capable model and resume the same session. The task was not marked complete.',
      ...(error ? { technicalDetail: error } : {}),
      terminalReason,
      connectionFailure: false,
    };
  }
  if (
    terminalReason === 'model-source-progress-exhausted' ||
    terminalReason === 'causal-source-progress-exhausted' ||
    terminalReason === 'model-causal-progress-exhausted' ||
    terminalReason === 'causal-progress-exhausted'
  ) {
    return {
      title: 'Verification still open',
      summary:
        'The task is not complete and nothing was marked verified. Studio paused so this attempt would not keep spending tokens. Resume continues the same session with another bounded attempt.',
      ...(error ? { technicalDetail: error } : {}),
      terminalReason,
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
  if (input.sessionStatus === 'streaming') {
    return true;
  }
  if (
    input.sessionStatus === 'error' ||
    input.sessionStatus === 'cancelled' ||
    input.sessionStatus === 'completed'
  ) {
    return input.autoFixBusy || input.patchApplyBusy;
  }
  return input.autoFixBusy || input.patchApplyBusy || input.progressStatus === 'running';
}

export function isStudioUserFacingNarration(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12 || trimmed.length > 2_000) {
    return false;
  }
  if (/^[{[]/.test(trimmed) || /"toolName"\s*:/.test(trimmed)) {
    return false;
  }
  return /[A-Za-z]/.test(trimmed);
}

export function describeStudioCausalFailure(
  progress: SidebarStudioActionProgressView | undefined
): string | undefined {
  if (!progress) {
    return undefined;
  }
  const text = `${progress.title ?? ''} ${progress.summary ?? ''} ${progress.technicalDetail ?? ''}`;
  if (/repair transaction/i.test(text) && /fewer than 1 items/i.test(text)) {
    return 'The approved CLI remediation step did not apply because the repair transaction had no file checkpoint.';
  }
  if (
    progress.action === 'execute-remediation-step' ||
    /did not apply|remediation step did not/i.test(text)
  ) {
    return 'The approved CLI remediation step did not apply.';
  }
  if (studioTimelineActivityKind(progress) === 'verify') {
    return 'Canonical verify still reports remaining work.';
  }
  if (studioTimelineActivityKind(progress) === 'inspect' && (progress.occurrences ?? 0) >= 3) {
    return `The model re-read the same evidence ${progress.occurrences} times instead of changing source.`;
  }
  if (progress.title?.trim()) {
    return `Last blocked step: ${progress.title.trim()}.`;
  }
  return undefined;
}

export function findLastStudioCausalFailure(
  timeline: SidebarStudioActionProgressView[]
): SidebarStudioActionProgressView | undefined {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.terminalReason || entry.phase === 'repair-stopped') {
      continue;
    }
    if (entry.status !== 'failed' && entry.status !== 'review') {
      continue;
    }
    if (studioTimelineActivityKind(entry) === 'inspect' && entry.policyRejected !== true) {
      continue;
    }
    return entry;
  }
  const lastInspect = [...timeline]
    .reverse()
    .find((entry) => studioTimelineActivityKind(entry) === 'inspect');
  if ((lastInspect?.occurrences ?? 0) >= 3) {
    return lastInspect;
  }
  return undefined;
}

function withCausalPauseSummary(
  summary: string,
  timeline: SidebarStudioActionProgressView[]
): string {
  const last = findLastStudioCausalFailure(timeline);
  const lastApply = [...timeline]
    .reverse()
    .find((entry) => entry.action === 'execute-remediation-step' && entry.status === 'failed');
  const lastInspectLoop = [...timeline]
    .reverse()
    .find(
      (entry) => studioTimelineActivityKind(entry) === 'inspect' && (entry.occurrences ?? 0) >= 3
    );
  const details = [
    lastApply && lastApply !== last ? describeStudioCausalFailure(lastApply) : undefined,
    lastInspectLoop && lastInspectLoop !== last
      ? describeStudioCausalFailure(lastInspectLoop)
      : undefined,
    describeStudioCausalFailure(last),
  ].filter((entry): entry is string => Boolean(entry));
  const unique = [...new Set(details)];
  const detail = unique.join(' ');
  if (!detail || summary.includes(detail)) {
    return summary;
  }
  return `${summary} ${detail}`;
}

export function describeStudioCliRepairPhase(input: {
  phase?: string;
  sourceReplan?: boolean;
  decisionRequired?: boolean;
  rolledBack?: boolean;
  closed?: boolean;
}): { title: string; summary: string } {
  if (input.sourceReplan) {
    return {
      title: 'Choosing a different fix',
      summary: 'The last edit did not close the finding. Studio is targeting a different cause.',
    };
  }
  if (input.decisionRequired) {
    return {
      title: 'Decision needed',
      summary: 'This change needs an explicit choice before it can continue.',
    };
  }
  if (input.rolledBack) {
    return {
      title: 'Restored the last change',
      summary:
        'Verification still failed, so the files were put back. A different edit can follow.',
    };
  }
  if (input.closed) {
    return {
      title: 'Verified the change',
      summary: 'Checkpoint, tests, and canonical verification all passed.',
    };
  }
  if (input.phase === 'plan' || input.phase === 'approval') {
    return {
      title: 'Preparing the change',
      summary: 'Bounding and approving the smallest safe edit.',
    };
  }
  return {
    title: 'Applying the repair',
    summary:
      'Changing, checking, and verifying the files. Nothing is kept unless verification passes.',
  };
}

export function terminalizeStudioProgress(
  progress: SidebarStudioActionProgressView | null | undefined,
  input: {
    title: string;
    summary: string;
    reviewRequired?: boolean;
    terminalReason?: string;
    missingExecutable?: string;
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
    missingExecutable: input.missingExecutable ?? progress.missingExecutable,
    technicalDetail: input.technicalDetail,
    nextAction: undefined,
    nextActionLabel: undefined,
  };
}

export function terminalizeStudioTimeline(
  timeline: SidebarStudioActionProgressView[],
  input: Parameters<typeof terminalizeStudioProgress>[1]
): SidebarStudioActionProgressView[] {
  const prior = timeline.slice(0, -1);
  const settled = settleStudioTimeline(prior);
  const last = timeline[timeline.length - 1];
  const pauseInput = {
    ...input,
    summary: withCausalPauseSummary(input.summary, settled),
  };
  const terminal = terminalizeStudioProgress(last, pauseInput);
  if (!terminal) {
    return [];
  }
  if (input.terminalReason === 'cli-repair-contract-mismatch') {
    return [terminal];
  }
  const history = settled.filter((entry) => !isNoisyStudioInspectFailure(entry)).slice(-5);
  return [...history, terminal];
}

export function settleStudioTimeline(
  timeline: SidebarStudioActionProgressView[]
): SidebarStudioActionProgressView[] {
  return timeline.map((entry) => {
    if (entry.status !== 'running') {
      return entry;
    }
    const kind = studioTimelineActivityKind(entry);
    if (kind === 'fix' || kind === 'verify') {
      return {
        ...entry,
        status: 'failed' as const,
        nextAction: undefined,
        nextActionLabel: undefined,
      };
    }
    return {
      ...entry,
      status: 'done' as const,
      phase: entry.phase === 'observing-evidence' ? 'evidence-observed' : entry.phase,
      nextAction: undefined,
      nextActionLabel: undefined,
    };
  });
}
