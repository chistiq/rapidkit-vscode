import { getDashboardCommandAffectedEvidenceCards } from './dashboardCommandRegistry';
import type { DashboardEvidenceCardId, DashboardEvidencePayload } from './dashboardEvidence';

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
