import type { DashboardEvidenceCardId } from '../contracts/dashboardEvidenceCards.js';
import {
  buildDashboardEvidenceBundle,
  type DashboardEvidenceBundle,
  type DashboardEvidenceCard,
} from './dashboardEvidenceBridge.js';

export async function buildDashboardEvidenceCardsForIds(input: {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cardIds: DashboardEvidenceCardId[];
}): Promise<DashboardEvidenceCard[]> {
  if (!input.workspacePath || input.cardIds.length === 0) {
    return [];
  }

  const bundle = await buildDashboardEvidenceBundle({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    projectName: input.projectName,
  });

  return pickEvidenceCardsFromBundle(bundle, input.cardIds);
}

export function pickEvidenceCardsFromBundle(
  bundle: DashboardEvidenceBundle,
  cardIds: DashboardEvidenceCardId[]
): DashboardEvidenceCard[] {
  const requested = new Set(cardIds);
  return bundle.cards.filter((card) => requested.has(card.id));
}
