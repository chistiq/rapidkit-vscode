import type { DashboardEvidenceCard, DashboardEvidencePayload } from './dashboardEvidence';
import type { DashboardEvidenceCardId } from '@workspai-contracts/dashboardEvidenceCards';

export type DashboardEvidenceRefreshMode = 'full' | 'patch';

export type DashboardEvidenceMessageMeta = {
  requestId?: number;
  refreshMode?: DashboardEvidenceRefreshMode;
  patchCardIds?: DashboardEvidenceCardId[];
};

export function nextEvidenceRequestId(current: number): number {
  return current + 1;
}

export function mergeEvidenceCardPatch(
  current: DashboardEvidencePayload,
  patch: Pick<DashboardEvidencePayload, 'cards'> & Partial<DashboardEvidencePayload>
): DashboardEvidencePayload {
  const patchById = new Map(patch.cards.map((card) => [card.id, card]));
  const mergedCards = current.cards.map((card) => patchById.get(card.id) ?? card);

  for (const card of patch.cards) {
    if (!mergedCards.some((entry) => entry.id === card.id)) {
      mergedCards.push(card);
    }
  }

  return {
    ...current,
    ...patch,
    cards: mergedCards,
  };
}

export function isStaleEvidenceResponse(
  payload: DashboardEvidencePayload | null | undefined,
  options: {
    expectedRequestId?: number;
    activeWorkspacePath?: string | null;
    allowMissingRequestId?: boolean;
  }
): boolean {
  if (!payload) {
    return true;
  }

  if (
    options.activeWorkspacePath &&
    payload.workspacePath &&
    payload.workspacePath !== options.activeWorkspacePath
  ) {
    return true;
  }

  if (options.expectedRequestId == null) {
    return false;
  }

  if (payload.requestId == null) {
    return options.allowMissingRequestId !== true;
  }

  return payload.requestId !== options.expectedRequestId;
}

export function applyDashboardEvidenceMessage(
  current: DashboardEvidencePayload | null,
  incoming: DashboardEvidencePayload | null | undefined,
  options: {
    expectedRequestId?: number;
    activeWorkspacePath?: string | null;
    allowMissingRequestId?: boolean;
  }
): DashboardEvidencePayload | null {
  if (!incoming) {
    return current;
  }

  if (
    isStaleEvidenceResponse(incoming, {
      expectedRequestId: options.expectedRequestId,
      activeWorkspacePath: options.activeWorkspacePath,
      allowMissingRequestId: options.allowMissingRequestId,
    })
  ) {
    return current;
  }

  if (incoming.refreshMode === 'patch' && current) {
    return mergeEvidenceCardPatch(current, incoming);
  }

  return incoming;
}

export function emptyEvidencePayloadForWorkspace(
  workspacePath: string | undefined,
  requestId: number
): DashboardEvidencePayload {
  return {
    workspacePath,
    cards: [],
    activity: [],
    opsChain: null,
    onboarding: {
      isFreshInstall: false,
      recentWorkspaceCount: 0,
      hasActiveWorkspace: Boolean(workspacePath),
    },
    requestId,
    refreshMode: 'full',
  };
}

export function patchTouchesCard(
  patchCardIds: DashboardEvidenceCardId[] | undefined,
  cardId: DashboardEvidenceCardId
): boolean {
  return Boolean(patchCardIds?.includes(cardId));
}

export function findEvidenceCardInPayload(
  payload: DashboardEvidencePayload | null | undefined,
  cardId: DashboardEvidenceCardId
): DashboardEvidenceCard | undefined {
  return payload?.cards.find((card) => card.id === cardId);
}
