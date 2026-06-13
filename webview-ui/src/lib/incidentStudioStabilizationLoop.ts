import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';

export type EnterpriseStabilizationLoopState = 'warming' | 'frozen' | 'recovering' | 'stable';

export type EnterpriseStabilizationLoopView = {
  state: EnterpriseStabilizationLoopState;
  expansionFrozen: boolean;
  freezeReason: string | null;
  consecutiveWindowsPass: number;
  last7dPass: boolean | null;
  last30dPass: boolean | null;
  recoveryHint: string | null;
};

export function deriveEnterpriseStabilizationLoopView(
  telemetry?: IncidentStudioTelemetryGateSlice | null
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

  const recoveryHint = expansionFrozen
    ? enterprise.freezeReason ||
      'Expansion is frozen until enterprise stabilization windows recover.'
    : state === 'recovering'
      ? 'Complete verify paths and refresh telemetry until both 7d and 30d windows pass.'
      : state === 'stable'
        ? 'Enterprise stabilization windows are passing; expansion is allowed.'
        : 'Run verify-gates and refresh telemetry to hydrate stabilization KPIs.';

  return {
    state,
    expansionFrozen,
    freezeReason: enterprise.freezeReason ?? null,
    consecutiveWindowsPass,
    last7dPass,
    last30dPass,
    recoveryHint,
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
