import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

export type StudioFixActionId = 'fix-lens' | 'verify-gates' | 'run-analyze' | 'doctor-fix';

/**
 * Test-pinned default fix action per evidence card.
 * Hints from CLI `resolutionHints[]` override this table.
 */
export const STUDIO_CARD_FIX_ROUTING: Readonly<Record<string, StudioFixActionId>> = {
  doctor: 'doctor-fix',
  projectDoctor: 'doctor-fix',
  importReadiness: 'doctor-fix',
  analyze: 'run-analyze',
  workspaceModel: 'run-analyze',
  workspaceVerify: 'verify-gates',
  readiness: 'verify-gates',
  pipeline: 'verify-gates',
  workspaceImpact: 'fix-lens',
  workspaceDiff: 'fix-lens',
  contract: 'verify-gates',
  workspaceExplain: 'verify-gates',
  agentGrounding: 'verify-gates',
  workspaceContextAgent: 'verify-gates',
};

export function resolveStudioFixActionForHandoff(handoff: StudioBlockerHandoff): StudioFixActionId {
  const hinted = handoff.resolutionHints
    ?.flatMap((entry) => entry.fixHints ?? [])
    .find((hint) => hint.studioActionId)?.studioActionId;
  if (hinted) {
    return hinted;
  }

  if (handoff.cardId === 'workspaceImpact' || handoff.resolutionClass === 'semantic-attention') {
    return 'fix-lens';
  }

  return STUDIO_CARD_FIX_ROUTING[handoff.cardId] ?? 'fix-lens';
}

export function normalizeStudioHandoffSource(
  value: unknown
): StudioBlockerHandoff['handoffSource'] {
  if (typeof value !== 'string') {
    return 'dashboard';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'repair') {
    return 'repair';
  }
  if (normalized === 'artifacts' || normalized === 'evidence' || normalized === 'console') {
    return 'artifacts';
  }
  if (normalized === 'advisor') {
    return 'advisor';
  }
  if (normalized === 'tree') {
    return 'tree';
  }
  return 'dashboard';
}
