import { describe, expect, it } from 'vitest';

import {
  isVerifyActionBlockedByPolicyGates,
  mergePolicyGatesFromTelemetry,
  resolvePolicyGateBlockedReasonsFromTelemetry,
} from '../../webview-ui/src/lib/incidentStudioPolicyGateMapper';

describe('incidentStudioPolicyGateMapper (webview)', () => {
  it('merges telemetry failures into blocking policy gate state', () => {
    const merged = mergePolicyGatesFromTelemetry(
      {
        flowState: 'passing',
        telemetryState: 'complete',
        releasePosture: 'go',
      },
      {
        studioHardGateStatus: {
          windowEndAt: '2026-06-10T12:00:00.000Z',
          gates: {
            verifyPhaseReachPass: false,
            bridgeRouteCompletionPass: true,
            overallPass: false,
          },
        },
      },
      'needs-attention'
    );

    expect(merged.flowState).toBe('blocking');
    expect(merged.releasePosture).toBe('no-go');
    expect(merged.telemetryState).toBe('partial');
  });

  it('marks telemetry stale when enterprise expansion is frozen', () => {
    const merged = mergePolicyGatesFromTelemetry(
      {
        flowState: 'warning',
        telemetryState: 'partial',
        releasePosture: 'pending',
      },
      {
        enterpriseStabilizationGateStatus: {
          expansionFrozen: true,
          freezeReason: 'Hard gate regression',
        },
      }
    );

    expect(merged.telemetryState).toBe('stale');
    expect(merged.flowState).toBe('warning');
    expect(
      resolvePolicyGateBlockedReasonsFromTelemetry({
        enterpriseStabilizationGateStatus: {
          expansionFrozen: true,
          freezeReason: 'Hard gate regression',
        },
      })
    ).toContain('Hard gate regression');
  });

  it('keeps release posture go when artifacts are approved despite learning KPIs', () => {
    const merged = mergePolicyGatesFromTelemetry(
      {
        flowState: 'passing',
        telemetryState: 'complete',
        releasePosture: 'go',
      },
      {
        studioHardGateStatus: {
          gates: {
            verifyPhaseReachPass: false,
            bridgeRouteCompletionPass: false,
            overallPass: false,
          },
        },
      },
      'ready',
      { artifactReleaseReady: true }
    );

    expect(merged.releasePosture).toBe('go');
    expect(merged.flowState).toBe('warning');
  });

  it('blocks verify actions when policy gates are blocking', () => {
    expect(
      isVerifyActionBlockedByPolicyGates({
        policyGates: {
          flowState: 'blocking',
          telemetryState: 'partial',
          releasePosture: 'no-go',
        },
      })
    ).toBe(true);
  });

  it('does not block verify when artifacts are release-ready', () => {
    expect(
      isVerifyActionBlockedByPolicyGates({
        policyGates: {
          flowState: 'warning',
          telemetryState: 'partial',
          releasePosture: 'go',
        },
        verifyGateBlockedReasons: ['Bridge route completion < minimum threshold'],
        artifactReleaseReady: true,
      })
    ).toBe(false);
  });
});
