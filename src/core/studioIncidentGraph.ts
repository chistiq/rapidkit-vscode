import type { DashboardEvidenceCard } from './dashboardEvidenceBridge.js';

const WORKSPACE_INTELLIGENCE_INCIDENT_CARDS = new Set([
  'doctor',
  'projectDoctor',
  'pipeline',
  'analyze',
  'readiness',
  'contract',
  'policy',
  'workspaceSync',
  'workspaceRun',
  'workspaceModel',
  'intelligenceSnapshot',
  'workspaceDiff',
  'workspaceImpact',
  'workspaceIntelligenceRun',
  'workspaceVerify',
  'workspaceExplain',
  'workspaceTrace',
  'workspaceWatch',
  'workspaceContextAgent',
  'agentGrounding',
]);

const CANONICAL_REPAIR_PRIORITY = new Map(
  [
    'workspaceSync',
    'workspaceModel',
    'contract',
    'policy',
    'doctor',
    'projectDoctor',
    'pipeline',
    'analyze',
    'readiness',
    'intelligenceSnapshot',
    'workspaceDiff',
    'workspaceImpact',
    'workspaceVerify',
    'workspaceContextAgent',
    'agentGrounding',
    'workspaceWatch',
    'workspaceExplain',
    'workspaceTrace',
    'workspaceIntelligenceRun',
    'workspaceRun',
  ].map((id, index) => [id, index])
);

export type StudioIncidentBlockingCard = {
  id: string;
  label: string;
  status: string;
  artifactPath?: string;
  blockers: string[];
};

export type StudioIncidentGraph = {
  primaryCardId: string;
  resolved: boolean;
  blockingCards: StudioIncidentBlockingCard[];
  blockerCount: number;
};

function cardIsBlocking(card: DashboardEvidenceCard): boolean {
  return card.blocking ?? card.status === 'fail';
}

/**
 * A card repair owns the complete Workspace Intelligence causal closure. This
 * intentionally excludes unrelated lifecycle/infra cards while preventing a
 * derivative Verify or Agent Grounding card from hiding an upstream blocker.
 */
export function buildStudioIncidentGraph(input: {
  primaryCardId: string;
  cards: readonly DashboardEvidenceCard[];
}): StudioIncidentGraph {
  const blockingCards = input.cards
    .filter((card) => WORKSPACE_INTELLIGENCE_INCIDENT_CARDS.has(card.id) && cardIsBlocking(card))
    .map((card) => ({
      id: card.id,
      label: card.label,
      status: card.status,
      ...(card.artifactPath ? { artifactPath: card.artifactPath } : {}),
      blockers: [...(card.blockers ?? [])],
    }))
    .sort(
      (left, right) =>
        (CANONICAL_REPAIR_PRIORITY.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (CANONICAL_REPAIR_PRIORITY.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id)
    );
  const blockerCount = blockingCards.reduce(
    (count, card) => count + Math.max(1, card.blockers.length),
    0
  );
  return {
    primaryCardId: input.primaryCardId,
    resolved: blockingCards.length === 0,
    blockingCards,
    blockerCount,
  };
}
