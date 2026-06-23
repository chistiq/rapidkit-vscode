import { describe, expect, it } from 'vitest';

import {
  buildPhaseGuidance,
  deriveUiPhaseFromSignals,
  normalizeHostConversationPhase,
  resolveIncidentPhaseContext,
} from '../../webview-ui/src/lib/incidentStudioPhaseBridge';

describe('incidentStudioPhaseBridge', () => {
  it('normalizes host conversation phases', () => {
    expect(normalizeHostConversationPhase('verify')).toBe('verify');
    expect(normalizeHostConversationPhase('invalid')).toBeUndefined();
  });

  it('derives verify phase when action contract can verify', () => {
    expect(
      deriveUiPhaseFromSignals({
        canVerify: true,
        hasActionContract: true,
      })
    ).toBe('verify');
  });

  it('maps diagnose phase to workspace advisor command via CLC3 guidance', () => {
    const context = resolveIncidentPhaseContext({
      workspaceReady: true,
      diagnosisReady: true,
      studioEvidence: {
        generatedAt: new Date().toISOString(),
        score: 90,
        verdict: 'needs-attention',
        findings: { fail: 1, warn: 0, info: 0 },
        topFindings: [],
      },
    });

    const guidance = buildPhaseGuidance({ phase: 'diagnose', context });
    expect(guidance.command).toContain('impact-lens');
    expect(guidance.primaryAction.length).toBeGreaterThan(0);
  });
});
