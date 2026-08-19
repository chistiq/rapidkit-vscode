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
      title: 'Source repair stopped',
      summary:
        'Studio blocked a repeated evidence command because no causal source edit was made. The workspace source was left unchanged.',
      ...(error ? { technicalDetail: error } : {}),
      terminalReason,
      connectionFailure: false,
    };
  }
  if (
    terminalReason === 'model-source-progress-exhausted' ||
    terminalReason === 'causal-source-progress-exhausted'
  ) {
    return {
      title: 'Repair paused',
      summary:
        'Studio exhausted its bounded autonomous recovery path without a verified source change. The durable session can resume with added context or a fresh model turn.',
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
