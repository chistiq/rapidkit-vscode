export type StudioRepairReceiptEvent = {
  type: string;
  data: unknown;
};

export type StudioVerifiedRepairReceipt = {
  answer: string;
  changedPaths: string[];
  transactionIds: string[];
  verificationSummary: string;
};

export type StudioCliRepairDisposition = {
  closed: boolean;
  generalSourceRepair: boolean;
  rolledBackForAnotherSourceAttempt: boolean;
  requiresUserDecision: boolean;
  nextAction: 'closed' | 'general-source-repair' | 'review-required' | 'repair-stopped';
  terminalReason?: 'cli-repair-decision-required' | 'repair-toolchain-unavailable';
  missingExecutables: Array<{ projectPath: string; executable: string }>;
};

type StudioRepairDecisionCause = {
  kind:
    | 'missing-executable'
    | 'unsupported-adapter'
    | 'failed-precondition'
    | 'risk-approval'
    | 'policy-exception'
    | 'source-repair-required';
  projectPath?: string;
  executable?: string;
};

const NON_SOURCE_REPAIR_PATH =
  /(?:^|\/)(?:(?:\.workspai|\.rapidkit)(?:\/|$)|(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb?)$)/i;

/**
 * Keep the model's source capability plane outside canonical Workspai state.
 *
 * CLI receipts can originate on every supported platform, so candidate paths
 * are normalized before policy matching and durable replay.
 */
export function selectStudioSourceRepairCandidates(paths: readonly string[], limit = 20): string[] {
  const candidates = new Set<string>();
  for (const candidate of paths) {
    const normalized = candidate.trim().replace(/\\/g, '/');
    if (!normalized || NON_SOURCE_REPAIR_PATH.test(normalized)) {
      continue;
    }
    candidates.add(normalized);
    if (candidates.size >= Math.max(1, limit)) {
      break;
    }
  }
  return [...candidates];
}

/**
 * Classify a non-closed CLI transaction without guessing from its prose.
 *
 * Decision causes are emitted by the CLI repair engine. The extension never
 * infers source repair, missing tools, runtime support, or policy decisions
 * from English prose or blocker-specific conditions.
 */
export function resolveStudioCliRepairDisposition(input: {
  transaction: {
    state: string;
    decision?: { options?: string[]; causes?: StudioRepairDecisionCause[] };
    verification?: {
      status?: string;
      targetStatus?: string;
      summary?: string;
    };
    adapterEvaluations?: Array<{
      projectPath: string;
      missingExecutables?: string[];
    }>;
  };
  sourceCandidates: readonly string[];
}): StudioCliRepairDisposition {
  const closed = input.transaction.state === 'closed';
  const decisionCauses = input.transaction.decision?.causes ?? [];
  const typedMissingExecutables = decisionCauses
    .filter(
      (cause): cause is StudioRepairDecisionCause & { executable: string } =>
        cause.kind === 'missing-executable' && Boolean(cause.executable)
    )
    .map((cause) => ({
      projectPath: cause.projectPath ?? '.',
      executable: cause.executable,
    }));
  const adapterMissingExecutables = (input.transaction.adapterEvaluations ?? []).flatMap(
    (adapter) =>
      (adapter.missingExecutables ?? []).map((executable) => ({
        projectPath: adapter.projectPath,
        executable,
      }))
  );
  const missingExecutables = [
    ...new Map(
      [...typedMissingExecutables, ...adapterMissingExecutables].map((entry) => [
        `${entry.projectPath}\0${entry.executable}`,
        entry,
      ])
    ).values(),
  ];
  const decisionRequired =
    input.transaction.state === 'decision-required' &&
    Boolean(input.transaction.decision) &&
    Array.isArray(input.transaction.decision?.options) &&
    input.transaction.decision.options.length > 0;
  const sourceRepairDecision =
    decisionRequired &&
    decisionCauses.length > 0 &&
    decisionCauses.every((cause) => cause.kind === 'source-repair-required');
  const rolledBackForAnotherSourceAttempt =
    input.transaction.state === 'rolled-back' &&
    (input.transaction.verification?.status === 'failed' ||
      input.transaction.verification?.targetStatus === 'failed');
  const generalSourceRepair =
    !closed &&
    input.sourceCandidates.length > 0 &&
    (sourceRepairDecision || rolledBackForAnotherSourceAttempt);
  const requiresUserDecision = decisionRequired && !generalSourceRepair;
  const nextAction = closed
    ? 'closed'
    : generalSourceRepair
      ? 'general-source-repair'
      : requiresUserDecision
        ? 'review-required'
        : 'repair-stopped';
  return {
    closed,
    generalSourceRepair,
    rolledBackForAnotherSourceAttempt,
    requiresUserDecision,
    nextAction,
    ...(requiresUserDecision
      ? {
          terminalReason:
            missingExecutables.length > 0
              ? ('repair-toolchain-unavailable' as const)
              : ('cli-repair-decision-required' as const),
        }
      : {}),
    missingExecutables,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Build the final user-facing receipt exclusively from durable runtime events.
 *
 * The model is not allowed to author completion claims. File changes come from
 * CLI transaction output and closure copy comes from canonical verification.
 */
export function buildStudioVerifiedRepairReceipt(session: {
  events: StudioRepairReceiptEvent[];
}): StudioVerifiedRepairReceipt {
  const changedPaths = new Set<string>();
  const transactionIds = new Set<string>();
  let verificationSummary = 'Canonical verification passed for the selected blocker.';
  for (const event of session.events) {
    const data = record(event.data);
    if (!data) {
      continue;
    }
    const output = record(data.output);
    for (const candidate of [data.changedPaths, output?.changedPaths]) {
      if (!Array.isArray(candidate)) {
        continue;
      }
      candidate.forEach((entry) => {
        if (typeof entry === 'string' && entry.trim()) {
          changedPaths.add(entry.trim());
        }
      });
    }
    const transaction = record(output?.transaction);
    if (typeof transaction?.transactionId === 'string') {
      transactionIds.add(transaction.transactionId);
    }
    if (event.type !== 'verify.completed') {
      continue;
    }
    const cardVerification = record(output?.cardVerification);
    const workspaceVerification = record(output?.workspaceVerification);
    if (cardVerification?.resolved === true && workspaceVerification?.resolved === true) {
      verificationSummary =
        'Selected blocker and dependent workspace gates passed fresh verification.';
    } else if (cardVerification?.resolved === true) {
      verificationSummary = 'Selected blocker passed; unrelated workspace findings remain visible.';
    }
  }
  const paths = [...changedPaths].sort();
  const ids = [...transactionIds];
  const changedSummary =
    paths.length === 0
      ? 'No source file mutation was required.'
      : `Changed ${paths.length} file${paths.length === 1 ? '' : 's'}: ${paths.slice(0, 6).join(', ')}${paths.length > 6 ? `, +${paths.length - 6} more` : ''}.`;
  return {
    answer: `Fixed and verified. ${changedSummary} ${verificationSummary}`,
    changedPaths: paths,
    transactionIds: ids,
    verificationSummary,
  };
}
