import type { IncidentStudioStabilizationKpiStatus } from './incidentStudioPayload';
import { normalizeBlockerReason } from './incidentStudioBlockerText';

function formatPercentValue(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  return `${value}%`;
}

export function buildStabilizationBlockers(input: {
  status: IncidentStudioStabilizationKpiStatus;
  routeFallbackNonSuccessShare: number | null;
  verifyIncompleteWarningRate: number | null;
  topVerifyPathMissReasonShare: number | null;
  topVerifyPathMissReason: { reason: string; count: number; share: number } | null;
}): string[] {
  const blockers: string[] = [];
  const {
    status,
    routeFallbackNonSuccessShare,
    verifyIncompleteWarningRate,
    topVerifyPathMissReasonShare,
    topVerifyPathMissReason,
  } = input;

  if (status.gates.routePrecisionPass === false) {
    blockers.push('Route precision is below threshold');
  }
  if (status.gates.verifyPathCompletionRatePass === false) {
    blockers.push('Verify-path completion is below threshold');
  }
  if (status.gates.falseConfidenceRatePass === false) {
    blockers.push('False-confidence rate is above threshold');
  }
  if (status.gates.rollbackRecoverySuccessRatePass === false) {
    blockers.push('Rollback recovery is below threshold');
  }
  if (status.gates.repeatVerifiedResolutionRatePass === false) {
    blockers.push('Repeat verified resolution is below threshold');
  }

  const routeFallbackThreshold = status.thresholds.routeFallbackNonSuccessShareMax ?? 20;
  const routeFallbackFailed =
    status.gates.routeFallbackNonSuccessSharePass === false ||
    (status.gates.routeFallbackNonSuccessSharePass === undefined &&
      routeFallbackNonSuccessShare !== null &&
      routeFallbackNonSuccessShare > routeFallbackThreshold);
  if (routeFallbackFailed) {
    blockers.push(
      `Fallback non-success share (${formatPercentValue(routeFallbackNonSuccessShare)}) exceeds ${routeFallbackThreshold}%`
    );
  }

  const verifyWarningThreshold = status.thresholds.verifyIncompleteWarningRateMax;
  const verifyWarningFailed =
    verifyWarningThreshold !== undefined &&
    (status.gates.verifyIncompleteWarningRatePass === false ||
      (status.gates.verifyIncompleteWarningRatePass === undefined &&
        verifyIncompleteWarningRate !== null &&
        verifyIncompleteWarningRate > verifyWarningThreshold));
  if (verifyWarningFailed) {
    blockers.push(
      `Verify-incomplete warning rate (${formatPercentValue(verifyIncompleteWarningRate)}) exceeds ${verifyWarningThreshold}%`
    );
  }

  const topReasonThreshold = status.thresholds.topVerifyPathMissReasonShareMax ?? 30;
  const topReasonFailed =
    status.gates.topVerifyPathMissReasonSharePass === false ||
    (status.gates.topVerifyPathMissReasonSharePass === undefined &&
      topVerifyPathMissReasonShare !== null &&
      topVerifyPathMissReasonShare > topReasonThreshold);
  if (topReasonFailed) {
    if (topVerifyPathMissReason) {
      blockers.push(
        `Top verify-path miss (${topVerifyPathMissReason.reason}: ${topVerifyPathMissReason.share}%) exceeds ${topReasonThreshold}%`
      );
    } else {
      blockers.push(
        `Top verify-path miss share (${formatPercentValue(topVerifyPathMissReasonShare)}) exceeds ${topReasonThreshold}%`
      );
    }
  }

  return blockers;
}

export type StabilizationEnterpriseClaim = {
  blockers: string[];
  normalizedBlockers: string[];
  enterpriseClaimReady: boolean;
  summaryState: 'WARMING' | 'PASS' | 'HOLD' | 'FAIL';
  enterpriseClaimLabel: 'ready' | 'hold';
  verifyIncompleteWarningCount: number;
  verifyWarningsLine: string | null;
};

export function deriveStabilizationEnterpriseClaim(input: {
  status: IncidentStudioStabilizationKpiStatus | null;
  routeFallbackNonSuccessShare?: number | null;
  verifyIncompleteWarningRate?: number | null;
  topVerifyPathMissReasonShare?: number | null;
  topVerifyPathMissReason?: { reason: string; count: number; share: number } | null;
}): StabilizationEnterpriseClaim {
  const status = input.status;
  if (!status) {
    return {
      blockers: [],
      normalizedBlockers: [],
      enterpriseClaimReady: false,
      summaryState: 'WARMING',
      enterpriseClaimLabel: 'hold',
      verifyIncompleteWarningCount: 0,
      verifyWarningsLine: null,
    };
  }

  const routeFallbackNonSuccessShare =
    input.routeFallbackNonSuccessShare ?? status.metrics.routeFallbackNonSuccessShare ?? null;
  const verifyIncompleteWarningRate =
    input.verifyIncompleteWarningRate ?? status.metrics.verifyIncompleteWarningRate ?? null;
  const topVerifyPathMissReasonShare =
    input.topVerifyPathMissReasonShare ?? status.metrics.topVerifyPathMissReasonShare ?? null;
  const topReasonTop = status.metrics.verifyPathReasonTop?.[0];
  const topVerifyPathMissReason =
    input.topVerifyPathMissReason ??
    (topReasonTop
      ? {
          reason: topReasonTop.reason,
          count: topReasonTop.count,
          share: topVerifyPathMissReasonShare ?? 0,
        }
      : null);

  const blockers = buildStabilizationBlockers({
    status,
    routeFallbackNonSuccessShare,
    verifyIncompleteWarningRate,
    topVerifyPathMissReasonShare,
    topVerifyPathMissReason,
  });
  const normalizedBlockers = blockers.map((blocker) => normalizeBlockerReason(blocker));
  const enterpriseClaimReady = status.gates.overallPass && blockers.length === 0;
  const summaryState = enterpriseClaimReady ? 'PASS' : status.gates.overallPass ? 'HOLD' : 'FAIL';

  const verifyIncompleteWarningCount =
    status.metrics.verifyIncompleteWarningCount ??
    Math.max(status.metrics.verifyRequired - status.metrics.verifyPathPresent, 0);

  const verifyWarningsLine =
    verifyIncompleteWarningCount > 0
      ? `verify warnings: ${verifyIncompleteWarningCount}${
          verifyIncompleteWarningRate !== null
            ? ` (${formatPercentValue(verifyIncompleteWarningRate)})`
            : ''
        }`
      : null;

  return {
    blockers,
    normalizedBlockers,
    enterpriseClaimReady,
    summaryState,
    enterpriseClaimLabel: enterpriseClaimReady ? 'ready' : 'hold',
    verifyIncompleteWarningCount,
    verifyWarningsLine,
  };
}
