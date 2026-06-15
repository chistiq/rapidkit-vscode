import type { IncidentStudioTelemetryGateSliceCore } from './incidentStudioTelemetryPolicyCore';

export type EnterpriseStabilizationLoopState = 'warming' | 'frozen' | 'recovering' | 'stable';

export type EnterpriseStabilizationLoopView = {
  state: EnterpriseStabilizationLoopState;
  expansionFrozen: boolean;
  freezeReason: string | null;
};

export function deriveEnterpriseStabilizationLoopView(
  telemetry?: IncidentStudioTelemetryGateSliceCore | null
): EnterpriseStabilizationLoopView | null {
  const enterprise = telemetry?.enterpriseStabilizationGateStatus;
  if (!enterprise) {
    return null;
  }

  const last7dPass = enterprise.last7d?.overallPass ?? null;
  const last30dPass = enterprise.last30d?.overallPass ?? null;
  const consecutiveWindowsPass = enterprise.consecutiveWindowsPass ?? 0;
  const expansionFrozen = enterprise.expansionFrozen === true;

  let state: EnterpriseStabilizationLoopState = 'warming';
  if (expansionFrozen) {
    state = 'frozen';
  } else if (last7dPass && last30dPass && consecutiveWindowsPass >= 2) {
    state = 'stable';
  } else if (last7dPass || last30dPass || consecutiveWindowsPass > 0) {
    state = 'recovering';
  }

  return {
    state,
    expansionFrozen,
    freezeReason: enterprise.freezeReason ?? null,
  };
}

export function resolveStabilizationLoopBlockReason(
  loopView: EnterpriseStabilizationLoopView | null | undefined
): string | null {
  if (!loopView?.expansionFrozen) {
    return null;
  }
  return loopView.freezeReason || 'Enterprise stabilization expansion is frozen.';
}
