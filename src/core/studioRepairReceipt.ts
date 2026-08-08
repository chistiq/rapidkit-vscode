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
