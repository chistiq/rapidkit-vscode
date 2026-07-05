export type SidebarStudioReturnStatus = 'verified-refreshed' | 'still-blocked' | 'audit-not-saved';

export type SidebarStudioReturnState = {
  status: SidebarStudioReturnStatus;
  title: string;
  detail: string;
  refreshedCardIds: string[];
  topBlocker?: string;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function buildSidebarStudioReturnState(input: {
  verifySucceeded?: unknown;
  cardStatus?: unknown;
  blockers?: unknown;
  refreshedCardIds?: unknown;
}): SidebarStudioReturnState {
  const refreshedCardIds = stringArray(input.refreshedCardIds);
  const blockers = stringArray(input.blockers);
  const cardStatus = input.cardStatus;
  const verifySucceeded = input.verifySucceeded === true;

  if (verifySucceeded && cardStatus === 'pass') {
    return {
      status: 'verified-refreshed',
      title: 'Blocker resolved',
      detail:
        refreshedCardIds.length > 0
          ? `${refreshedCardIds.length} dashboard card(s) refreshed. Return to Dashboard when you are ready.`
          : 'Dashboard evidence refreshed. Return to Dashboard when you are ready.',
      refreshedCardIds,
    };
  }

  const topBlocker = blockers[0];
  if (verifySucceeded && cardStatus !== 'pass') {
    return {
      status: 'still-blocked',
      title: 'Step verified, blocker remains',
      detail:
        topBlocker ??
        'The verify command ran successfully, but the refreshed evidence still needs another repair step.',
      refreshedCardIds,
      topBlocker,
    };
  }
  return {
    status: 'still-blocked',
    title: 'Next blocker found',
    detail: topBlocker ?? 'Verify completed, but the refreshed evidence still needs attention.',
    refreshedCardIds,
    topBlocker,
  };
}

export function buildSidebarStudioAuditReturnState(input: {
  registryRecorded?: boolean;
  feedbackRecorded?: boolean;
  error?: string;
}): SidebarStudioReturnState {
  return {
    status: 'audit-not-saved',
    title: 'Audit not saved',
    detail:
      input.error ||
      `Registry ${input.registryRecorded ? 'saved' : 'not saved'}; feedback ${
        input.feedbackRecorded ? 'saved' : 'not saved'
      }.`,
    refreshedCardIds: [],
  };
}
