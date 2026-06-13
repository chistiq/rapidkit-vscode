import { describe, expect, it } from 'vitest';

import {
  canApplyStudioMutationFromTelemetryCore as hostCanApply,
  mapTelemetryToPolicyGateStatus as hostMap,
  resolvePolicyGateBlockedReasonsFromTelemetryCore as hostReasons,
} from '../core/incidentStudioTelemetryPolicyCore';
import {
  canApplyStudioMutationFromTelemetryCore as webviewCanApply,
  mapTelemetryToPolicyGateStatus as webviewMap,
  resolvePolicyGateBlockedReasonsFromTelemetryCore as webviewReasons,
} from '../../webview-ui/src/lib/incidentStudioTelemetryPolicyCore';

const FIXTURES = [
  { label: 'empty', telemetry: null },
  {
    label: 'frozen expansion',
    telemetry: {
      enterpriseStabilizationGateStatus: {
        expansionFrozen: true,
        freezeReason: 'LOOP - FROZEN',
        last7d: { overallPass: false, hardGatePass: false },
      },
    },
  },
  {
    label: 'hard gate fail',
    telemetry: {
      studioHardGateStatus: {
        gates: {
          verifyPhaseReachPass: false,
          bridgeRouteCompletionPass: false,
          overallPass: false,
        },
      },
    },
  },
  {
    label: 'stabilization fail',
    telemetry: {
      studioStabilizationKpiStatus: {
        gates: {
          overallPass: false,
          routePrecisionPass: false,
          verifyPathCompletionRatePass: false,
          falseConfidenceRatePass: true,
          rollbackRecoverySuccessRatePass: true,
        },
      },
      studioHardGateStatus: {
        gates: {
          verifyPhaseReachPass: true,
          bridgeRouteCompletionPass: true,
          overallPass: true,
        },
      },
    },
  },
  {
    label: 'all pass',
    telemetry: {
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
          routePrecisionPass: true,
          verifyPathCompletionRatePass: true,
          falseConfidenceRatePass: true,
          rollbackRecoverySuccessRatePass: true,
        },
      },
      enterpriseStabilizationGateStatus: {
        last7d: { overallPass: true, hardGatePass: true },
      },
    },
  },
] as const;

describe('incident studio policy gate host/webview parity', () => {
  for (const fixture of FIXTURES) {
    it(`mapTelemetryToPolicyGateStatus matches for ${fixture.label}`, () => {
      expect(webviewMap(fixture.telemetry)).toEqual(hostMap(fixture.telemetry));
    });

    it(`resolvePolicyGateBlockedReasons matches for ${fixture.label}`, () => {
      expect(webviewReasons(fixture.telemetry)).toEqual(hostReasons(fixture.telemetry));
    });

    it(`canApplyStudioMutation matches for ${fixture.label}`, () => {
      expect(webviewCanApply(fixture.telemetry)).toEqual(hostCanApply(fixture.telemetry));
    });
  }
});
