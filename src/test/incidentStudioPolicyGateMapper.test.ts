import { describe, expect, it } from 'vitest';

import {
  canApplyStudioMutationFromTelemetry,
  evaluatePolicyGateEnforcementFromTelemetry,
  mapTelemetryToPolicyGateStatus,
  resolvePolicyGateBlockedReasonsFromTelemetry,
} from '../ui/panels/incidentStudioPolicyGateMapper';

describe('incidentStudioPolicyGateMapper', () => {
  it('maps telemetry hard gates into enforceable policy gate status', () => {
    const status = mapTelemetryToPolicyGateStatus({
      studioHardGateStatus: {
        gates: {
          verifyPhaseReachPass: true,
          bridgeRouteCompletionPass: true,
          overallPass: true,
        },
      },
      studioStabilizationKpiStatus: {
        gates: {
          overallPass: true,
          verifyPathCompletionRatePass: true,
          falseConfidenceRatePass: true,
          rollbackRecoverySuccessRatePass: true,
        },
      },
    });

    expect(status?.overallPass).toBe(true);
    expect(
      evaluatePolicyGateEnforcementFromTelemetry({
        studioHardGateStatus: {
          gates: {
            verifyPhaseReachPass: true,
            bridgeRouteCompletionPass: true,
            overallPass: true,
          },
        },
        studioStabilizationKpiStatus: {
          gates: {
            overallPass: true,
            verifyPathCompletionRatePass: true,
            falseConfidenceRatePass: true,
            rollbackRecoverySuccessRatePass: true,
          },
        },
      }).canCompleteVerify
    ).toBe(true);
  });

  it('blocks verify completion when hard gate metrics fail', () => {
    const enforcement = evaluatePolicyGateEnforcementFromTelemetry({
      studioHardGateStatus: {
        gates: {
          verifyPhaseReachPass: false,
          bridgeRouteCompletionPass: true,
          overallPass: false,
        },
      },
    });

    expect(enforcement.canCompleteVerify).toBe(false);
    expect(
      resolvePolicyGateBlockedReasonsFromTelemetry({
        studioHardGateStatus: {
          gates: {
            verifyPhaseReachPass: false,
            bridgeRouteCompletionPass: true,
            overallPass: false,
          },
        },
      })
    ).toContain('Verify phase reach < minimum threshold');
  });

  it('blocks mutating actions when enterprise stabilization is frozen', () => {
    const decision = canApplyStudioMutationFromTelemetry({
      enterpriseStabilizationGateStatus: {
        expansionFrozen: true,
        freezeReason: 'Consecutive windows failed',
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Consecutive windows failed');
  });
});
