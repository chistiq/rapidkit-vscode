import { describe, expect, it } from 'vitest';

import { deriveStabilizationEnterpriseClaim } from '../../webview-ui/src/lib/incidentStudioStabilizationClaim';
import type { IncidentStudioStabilizationKpiStatus } from '../../webview-ui/src/lib/incidentStudioPayload';

const stabilizationFixture: IncidentStudioStabilizationKpiStatus = {
  workspacePath: '/workspace/acme',
  timeWindow: 'last7d',
  windowStartAt: '2026-05-01T00:00:00Z',
  windowEndAt: '2026-05-08T00:00:00Z',
  thresholds: {
    routePrecisionMin: 80,
    routeFallbackNonSuccessShareMax: 20,
    verifyPathCompletionRateMin: 70,
    verifyIncompleteWarningRateMax: 10,
    topVerifyPathMissReasonShareMax: 30,
    falseConfidenceRateMax: 15,
    rollbackRecoverySuccessRateMin: 70,
    repeatVerifiedResolutionRateMin: 70,
  },
  metrics: {
    nextActionClicked: 24,
    routeMatchedWithoutFallback: 21,
    routeFallbackCount: 3,
    routePrecision: 88,
    routeFallbackNonSuccessShare: 33,
    verifyRequired: 20,
    verifyPathPresent: 17,
    verifyPathCompletionRate: 85,
    verifyIncompleteWarningCount: 3,
    verifyIncompleteWarningRate: 15,
    verifyFailed: 2,
    rollbackAttempted: 2,
    rollbackSucceeded: 2,
    falseConfidenceRate: 5,
    rollbackRecoverySuccessRate: 100,
    repeatedIncidentDetected: 4,
    repeatVerifiedResolved: 4,
    repeatVerifiedResolutionRate: 100,
    repeatVerifiedWithArtifactReady: 4,
    repeatVerifiedWithArtifactRate: 100,
    fallbackReasonBreakdown: {
      success: 2,
      bare_keyword_only: 1,
      fix_preview_fallback: 0,
      orchestrate_default: 0,
      other: 0,
    },
    verifyPathReasonTop: [{ reason: 'Checklist drift', count: 2 }],
    topVerifyPathMissReasonShare: 25,
    recoveryClassBreakdown: {
      auto_rollback: 2,
      manual_recovery: 0,
      unspecified: 0,
    },
  },
  gates: {
    telemetryEvidencePass: true,
    routePrecisionPass: true,
    routeFallbackNonSuccessSharePass: false,
    verifyPathCompletionRatePass: true,
    verifyIncompleteWarningRatePass: false,
    falseConfidenceRatePass: true,
    rollbackRecoverySuccessRatePass: true,
    repeatVerifiedResolutionRatePass: true,
    topVerifyPathMissReasonSharePass: true,
    overallPass: true,
  },
};

describe('incidentStudioStabilizationClaim', () => {
  it('derives HOLD claim when advisory blockers fail even if overallPass remains true', () => {
    const claim = deriveStabilizationEnterpriseClaim({ status: stabilizationFixture });

    expect(claim.summaryState).toBe('HOLD');
    expect(claim.enterpriseClaimLabel).toBe('hold');
    expect(claim.verifyWarningsLine).toBe('verify warnings: 3 (15%)');
  });
});
