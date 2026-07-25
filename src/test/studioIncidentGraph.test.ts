import { describe, expect, it } from 'vitest';

import type { DashboardEvidenceCard } from '../core/dashboardEvidenceBridge.js';
import { buildStudioIncidentGraph } from '../core/studioIncidentGraph.js';

function card(
  id: DashboardEvidenceCard['id'],
  status: DashboardEvidenceCard['status'],
  blockers: string[] = []
): DashboardEvidenceCard {
  return {
    id,
    label: id,
    status,
    summary: id,
    scope: 'workspace',
    blockers,
    blocking: status === 'fail',
  };
}

describe('Studio incident graph', () => {
  it('keeps a repair open while upstream and derivative intelligence cards block', () => {
    const graph = buildStudioIncidentGraph({
      primaryCardId: 'agentGrounding',
      cards: [
        card('agentGrounding', 'pass'),
        card('readiness', 'fail', ['dependency vulnerability']),
        card('workspaceVerify', 'fail', ['readiness is blocking']),
      ],
    });

    expect(graph.resolved).toBe(false);
    expect(graph.blockingCards.map((entry) => entry.id)).toEqual(['readiness', 'workspaceVerify']);
    expect(graph.blockerCount).toBe(2);
  });

  it('does not let unrelated infrastructure cards hold an intelligence repair open', () => {
    const graph = buildStudioIncidentGraph({
      primaryCardId: 'workspaceVerify',
      cards: [card('workspaceVerify', 'pass'), card('infra', 'fail', ['cluster unavailable'])],
    });

    expect(graph.resolved).toBe(true);
    expect(graph.blockingCards).toEqual([]);
  });

  it('orders dependent blockers by the canonical repair chain', () => {
    const graph = buildStudioIncidentGraph({
      primaryCardId: 'agentGrounding',
      cards: [
        card('workspaceVerify', 'fail'),
        card('readiness', 'fail'),
        card('workspaceSync', 'fail'),
      ],
    });

    expect(graph.blockingCards.map((entry) => entry.id)).toEqual([
      'workspaceSync',
      'readiness',
      'workspaceVerify',
    ]);
  });
});
