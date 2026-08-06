import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import { requireStudioCardRepairCapability } from '../contracts/studioCardRepairCapabilities.js';

const DEFAULT_VERIFY_COMMAND = 'npx workspai workspace verify --json';

export function buildStudioSourceCommandForCard(cardId: string): string {
  return requireStudioCardRepairCapability(cardId).producerCommand;
}

/** Executable Workspai CLI snippet per evidence card — derived from dashboard command contracts. */
export const CARD_SOURCE_SHELL: Record<string, string> = Object.fromEntries(
  DASHBOARD_EVIDENCE_CARD_IDS.map((cardId) => [cardId, buildStudioSourceCommandForCard(cardId)])
);

export { DEFAULT_VERIFY_COMMAND };
