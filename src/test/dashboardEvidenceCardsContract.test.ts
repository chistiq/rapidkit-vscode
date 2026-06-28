import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_EVIDENCE_CARD_IDS,
  DASHBOARD_EVIDENCE_CARDS_CONTRACT_VERSION,
  isDashboardEvidenceCardId,
} from '../contracts/dashboardEvidenceCards';
import type { DashboardEvidenceCardId as HostCardId } from '../core/dashboardEvidenceBridge';

describe('dashboard evidence cards contract', () => {
  it('exports a stable v1 card id list', () => {
    expect(DASHBOARD_EVIDENCE_CARDS_CONTRACT_VERSION).toBe('1');
    expect(DASHBOARD_EVIDENCE_CARD_IDS.length).toBe(31);
    expect(isDashboardEvidenceCardId('doctor')).toBe(true);
    expect(isDashboardEvidenceCardId('not-a-card')).toBe(false);
  });

  it('matches host bridge card id union members', () => {
    const hostIds: HostCardId[] = [
      'doctor',
      'projectDoctor',
      'pipeline',
      'analyze',
      'readiness',
      'bootstrap',
      'workspaceSync',
      'foundation',
      'contract',
      'autopilot',
      'workspaceRun',
      'setup',
      'importReadiness',
      'snapshot',
      'workspaceModel',
      'intelligenceSnapshot',
      'workspaceDiff',
      'workspaceImpact',
      'workspaceVerify',
      'workspaceExplain',
      'workspaceWhy',
      'workspaceTrace',
      'workspaceWatch',
      'workspaceContextAgent',
      'agentGrounding',
      'share',
      'archive',
      'mirror',
      'cache',
      'policy',
      'infra',
    ];

    expect(hostIds).toEqual([...DASHBOARD_EVIDENCE_CARD_IDS]);
  });
});
