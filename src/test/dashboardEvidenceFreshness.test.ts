import { describe, expect, it } from 'vitest';

import {
  evidenceNeedsFreshnessAttention,
  outcomeCards,
  resolveEvidenceFreshness,
  type DashboardEvidenceCard,
} from '../../webview-ui/src/lib/dashboardEvidence';

const NOW = Date.parse('2026-06-18T12:00:00.000Z');

function card(overrides: Partial<DashboardEvidenceCard>): DashboardEvidenceCard {
  return {
    id: 'analyze',
    label: 'Analyze',
    status: 'pass',
    summary: 'Clean',
    scope: 'workspace',
    ...overrides,
  };
}

describe('dashboard evidence freshness', () => {
  it('labels fresh, aging, stale, and unknown artifacts deterministically', () => {
    expect(
      resolveEvidenceFreshness(card({ generatedAt: '2026-06-18T11:30:00.000Z' }), NOW)
    ).toMatchObject({
      status: 'fresh',
      label: 'Fresh',
      detail: 'Updated 30m ago',
    });

    expect(
      resolveEvidenceFreshness(card({ generatedAt: '2026-06-18T03:00:00.000Z' }), NOW)
    ).toMatchObject({
      status: 'aging',
      label: 'Aging',
      detail: 'Updated 9h ago',
    });

    expect(
      resolveEvidenceFreshness(card({ generatedAt: '2026-06-16T12:00:00.000Z' }), NOW)
    ).toMatchObject({
      status: 'stale',
      label: 'Stale',
      detail: 'Updated 2d ago',
    });

    expect(resolveEvidenceFreshness(card({ generatedAt: undefined }), NOW)).toMatchObject({
      status: 'unknown',
      label: 'No timestamp',
    });
  });

  it('promotes stale passing evidence into outcome review attention', () => {
    const stalePass = card({
      id: 'readiness',
      label: 'Readiness',
      generatedAt: '2026-06-16T12:00:00.000Z',
    });
    const freshPass = card({
      id: 'doctor',
      label: 'Doctor',
      generatedAt: '2026-06-18T11:55:00.000Z',
    });

    expect(evidenceNeedsFreshnessAttention(stalePass, NOW)).toBe(true);
    expect(evidenceNeedsFreshnessAttention(freshPass, NOW)).toBe(false);

    expect(
      outcomeCards(
        {
          cards: [stalePass, freshPass],
          activity: [],
          onboarding: {
            isFreshInstall: false,
            recentWorkspaceCount: 1,
            hasActiveWorkspace: true,
          },
        },
        NOW
      ).map((entry) => entry.id)
    ).toEqual(['readiness']);
  });
});
