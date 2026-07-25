import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { isDashboardEvidenceCardId } from '../contracts/dashboardEvidenceCards.js';

export type StudioFixActionId = 'fix-lens' | 'verify-gates' | 'run-analyze' | 'doctor-fix';

/**
 * Test-pinned default fix action per evidence card.
 * Hints from CLI `resolutionHints[]` override this table.
 */
export const STUDIO_CARD_FIX_ROUTING: Readonly<Record<string, StudioFixActionId>> = {
  doctor: 'doctor-fix',
  projectDoctor: 'doctor-fix',
  importReadiness: 'doctor-fix',
  bootstrap: 'verify-gates',
  setup: 'verify-gates',
  workspaceRun: 'verify-gates',
  analyze: 'run-analyze',
  workspaceModel: 'run-analyze',
  workspaceIntelligenceRun: 'verify-gates',
  snapshot: 'verify-gates',
  intelligenceSnapshot: 'run-analyze',
  workspaceWatch: 'run-analyze',
  workspaceVerify: 'verify-gates',
  readiness: 'verify-gates',
  pipeline: 'verify-gates',
  autopilot: 'verify-gates',
  workspaceImpact: 'fix-lens',
  workspaceDiff: 'fix-lens',
  contract: 'verify-gates',
  workspaceExplain: 'verify-gates',
  workspaceWhy: 'verify-gates',
  workspaceTrace: 'verify-gates',
  agentGrounding: 'verify-gates',
  workspaceContextAgent: 'verify-gates',
  workspaceSync: 'verify-gates',
  foundation: 'verify-gates',
  share: 'verify-gates',
  archive: 'verify-gates',
  mirror: 'verify-gates',
  cache: 'verify-gates',
  policy: 'verify-gates',
  infra: 'verify-gates',
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

  return isDashboardEvidenceCardId(handoff.cardId)
    ? STUDIO_CARD_FIX_ROUTING[handoff.cardId]
    : 'verify-gates';
}

/**
 * Verification-only actions cannot resolve a blocked FIX handoff. Route them
 * through evidence-grounded AI repair before another verify attempt.
 */
export function shouldUseEvidencePatchRepair(
  handoff: StudioBlockerHandoff,
  fixAction: StudioFixActionId
): boolean {
  if (
    (handoff.commandRunCount != null && handoff.commandRunCount > 0) ||
    handoff.resolutionClass === 'command-failed-repeat'
  ) {
    return true;
  }
  return (
    fixAction !== 'doctor-fix' &&
    fixAction !== 'fix-lens' &&
    (fixAction === 'verify-gates' || handoff.resolutionClass === 'config-fixable')
  );
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
