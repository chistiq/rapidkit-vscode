import contract from './studio-card-repair-capabilities.v1.json';

import { DASHBOARD_EVIDENCE_CARD_IDS } from './dashboardEvidenceCards.js';

export type StudioCardRepairCapability = {
  cardId: string;
  scope: 'workspace' | 'project';
  producerCommand: string;
  producerArtifact: string;
  verifyCommand: string;
  verifyArtifact: string;
  aggregateVerifyCommand: string;
  targetClosure: 'exact-producer-and-causal-action-set';
  aggregateRepair: 'sequential-causal-queue';
  transactionScope: 'one-causal-finding-family';
  workspacePosture: 'reported-separately';
  repairPolicy: 'diagnose-and-repair' | 'source-repair-then-produce' | 'refresh-producer';
  remediationArtifacts: string[];
};

const capabilities = contract.cards as StudioCardRepairCapability[];
const byCardId = new Map(capabilities.map((entry) => [entry.cardId, entry]));

if (
  capabilities.length !== DASHBOARD_EVIDENCE_CARD_IDS.length ||
  DASHBOARD_EVIDENCE_CARD_IDS.some((cardId) => !byCardId.has(cardId))
) {
  throw new Error(
    'Studio card repair capabilities are incomplete. Sync canonical Workspai CLI contracts.'
  );
}

export const STUDIO_CARD_REPAIR_CAPABILITIES =
  capabilities as readonly StudioCardRepairCapability[];

export function resolveStudioCardRepairCapability(
  cardId: string
): StudioCardRepairCapability | undefined {
  return byCardId.get(cardId);
}

export function requireStudioCardRepairCapability(cardId: string): StudioCardRepairCapability {
  const capability = resolveStudioCardRepairCapability(cardId);
  if (!capability) {
    throw new Error(
      `No canonical Studio repair capability is published for card "${cardId}". ` +
        'Repair cannot fall back to an unrelated evidence producer.'
    );
  }
  return capability;
}

export function studioCardSupportsGovernedSourceMutation(cardId: string): boolean {
  // A repair policy selects the contract-owned first action; it is not an
  // authorization boundary. If that accelerator leaves the card blocked, an
  // autonomous Studio session must retain its governed source capability
  // plane. Canonical .workspai state remains protected independently by the
  // workspace path policy and the CLI Repair Engine transaction contract.
  requireStudioCardRepairCapability(cardId);
  return true;
}
