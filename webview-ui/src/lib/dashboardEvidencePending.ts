import { getDashboardCommandAffectedEvidenceCards } from './dashboardCommandRegistry';
import type { DashboardEvidenceCardId, DashboardEvidencePayload } from './dashboardEvidence';

export function mergePendingEvidenceCardIds(
  ...groups: DashboardEvidenceCardId[][]
): DashboardEvidenceCardId[] {
  return [...new Set(groups.flat())];
}

export function resolveRefreshSettledCardIds(
  payload?: DashboardEvidencePayload | null
): Set<DashboardEvidenceCardId> {
  const settled = new Set<DashboardEvidenceCardId>();
  if (!payload) {
    return settled;
  }

  if (payload.refreshMode === 'full') {
    for (const card of payload.cards ?? []) {
      settled.add(card.id);
    }
    return settled;
  }

  if (payload.refreshMode === 'patch') {
    for (const cardId of payload.patchCardIds ?? []) {
      settled.add(cardId);
    }
    for (const card of payload.cards ?? []) {
      if (payload.patchCardIds?.includes(card.id)) {
        settled.add(card.id);
      }
    }
  }

  return settled;
}

export function evidenceCardPendingLabel(
  cardId: DashboardEvidenceCardId,
  runPending: DashboardEvidenceCardId[],
  refreshPending: DashboardEvidenceCardId[]
): string | null {
  if (refreshPending.includes(cardId)) {
    return 'Refreshing';
  }
  if (runPending.includes(cardId)) {
    return 'Running';
  }
  return null;
}

export function resolveSettledEvidenceCardIds(
  payload?: DashboardEvidencePayload | null
): Set<DashboardEvidenceCardId> {
  const settled = new Set<DashboardEvidenceCardId>();

  for (const card of payload?.cards ?? []) {
    if (card.status !== 'missing' || card.generatedAt || card.artifactPath) {
      settled.add(card.id);
    }
  }

  for (const entry of payload?.activity ?? []) {
    if (entry.status !== 'completed' && entry.status !== 'failed') {
      continue;
    }
    for (const cardId of getDashboardCommandAffectedEvidenceCards(entry.command)) {
      settled.add(cardId);
    }
  }

  for (const cardId of resolveRefreshSettledCardIds(payload)) {
    settled.add(cardId);
  }

  return settled;
}

export function reconcilePendingEvidenceCardIds(
  current: DashboardEvidenceCardId[],
  payload?: DashboardEvidencePayload | null
): DashboardEvidenceCardId[] {
  const settled = resolveSettledEvidenceCardIds(payload);
  if (settled.size === 0) {
    return current;
  }
  return current.filter((cardId) => !settled.has(cardId));
}

export function clearPendingEvidenceForCommand(
  current: DashboardEvidenceCardId[],
  command: string
): DashboardEvidenceCardId[] {
  const affected = getDashboardCommandAffectedEvidenceCards(command);
  if (affected.length === 0) {
    return current;
  }
  const affectedSet = new Set(affected);
  return current.filter((cardId) => !affectedSet.has(cardId));
}
