import cardContract from './dashboard-evidence-cards.v1.json';

export const DASHBOARD_EVIDENCE_CARD_IDS = cardContract.cardIds as readonly string[];

export type DashboardEvidenceCardId = (typeof cardContract.cardIds)[number];

export const DASHBOARD_EVIDENCE_CARDS_CONTRACT_VERSION = cardContract.version;

export function isDashboardEvidenceCardId(value: string): value is DashboardEvidenceCardId {
  return (DASHBOARD_EVIDENCE_CARD_IDS as readonly string[]).includes(value);
}
