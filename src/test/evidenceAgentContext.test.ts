import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DashboardEvidenceCard,
  DashboardEvidencePayload,
} from '../../webview-ui/src/lib/dashboardEvidence';
import {
  buildEvidenceAttentionInbox,
  countEvidenceAttentionBuckets,
  evidenceAttentionVisibleLimit,
} from '../../webview-ui/src/lib/evidenceAgentContext';

function evidence(cards: DashboardEvidenceCard[]): DashboardEvidencePayload {
  return {
    cards,
    activity: [],
    onboarding: {
      isFreshInstall: false,
      recentWorkspaceCount: 1,
      hasActiveWorkspace: true,
    },
  };
}

function card(
  overrides: Pick<DashboardEvidenceCard, 'id' | 'label' | 'status'> & Partial<DashboardEvidenceCard>
): DashboardEvidenceCard {
  return {
    summary: `${overrides.label} summary`,
    scope: 'workspace',
    blockers: [],
    ...overrides,
  };
}

describe('evidence agent context attention ranking', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('orders blockers by severity, recency, and governance impact for Home triage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T12:00:00.000Z'));

    const items = buildEvidenceAttentionInbox(
      evidence([
        card({
          id: 'workspaceContextAgent',
          label: 'Agent Context',
          status: 'fail',
          generatedAt: '2026-06-30T12:00:00.000Z',
          blockers: ['context stale'],
        }),
        card({
          id: 'readiness',
          label: 'Readiness',
          status: 'warn',
          generatedAt: '2026-07-02T11:55:00.000Z',
          blockers: ['release gate blocked', 'verify required', 'policy evidence missing'],
        }),
        card({
          id: 'pipeline',
          label: 'Governance Gate',
          status: 'fail',
          generatedAt: '2026-07-02T11:50:00.000Z',
          blockers: ['pipeline failed'],
        }),
        card({
          id: 'mirror',
          label: 'Mirror',
          status: 'warn',
          generatedAt: '2026-07-02T11:59:00.000Z',
          blockers: ['mirror warning'],
        }),
      ])
    );

    expect(items.slice(0, 3).map((item) => item.card.id)).toEqual([
      'pipeline',
      'workspaceContextAgent',
      'readiness',
    ]);
    expect(items[0]?.attentionScore).toBeGreaterThan(items[1]?.attentionScore ?? 0);
    expect(items[0]?.rankReasons).toContain('blocked');
    expect(items[0]?.rankReasons).toContain('governance impact');
    expect(items[2]?.rankReasons).toContain('recent evidence');
  });

  it('uses the contract-backed blocking posture and classifies every card exactly once', () => {
    const payload = evidence([
      card({
        id: 'workspaceModel',
        label: 'Workspace Model',
        status: 'pass',
        metrics: { projectCount: 2 },
      }),
      card({
        id: 'readiness',
        label: 'Readiness',
        status: 'pass',
        blocking: false,
      }),
      card({
        id: 'doctor',
        label: 'Doctor',
        status: 'fail',
        blockers: ['Runtime dependency is missing'],
        blocking: true,
      }),
      card({
        id: 'analyze',
        label: 'Analyze',
        status: 'warn',
        blockers: ['Review complexity trend'],
        blocking: false,
      }),
      card({
        id: 'workspaceContextAgent',
        label: 'Agent Context',
        status: 'fail',
        blockers: ['Optional context is stale'],
        blocking: false,
      }),
      card({
        id: 'workspaceDiff',
        label: 'Workspace Diff',
        status: 'pass',
        blockers: ['Workspace model changed since baseline'],
        blocking: false,
      }),
      card({
        id: 'autopilot',
        label: 'Autopilot release',
        status: 'missing',
        blocking: false,
      }),
    ]);

    expect(countEvidenceAttentionBuckets(payload)).toEqual({
      blocked: 1,
      attention: 2,
      missing: 1,
      ok: 3,
    });
    expect(buildEvidenceAttentionInbox(payload).map((item) => item.severity)).toEqual([
      'fail',
      'warn',
      'warn',
    ]);
  });

  it('never hides a blocked card behind the compact inbox limit', () => {
    expect(evidenceAttentionVisibleLimit(12, 4, 3)).toBe(4);
    expect(evidenceAttentionVisibleLimit(12, 2, 3)).toBe(3);
    expect(evidenceAttentionVisibleLimit(2, 4, 3)).toBe(2);
  });
});
