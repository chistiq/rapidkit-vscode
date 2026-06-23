import type {
  PolicyGateState,
  ReleaseGatePosture,
} from '@/components/StudioRedesign/state/studioState';
import {
  canApplyStudioMutationFromTelemetryCore,
  resolvePolicyGateBlockedReasonsFromTelemetryCore,
  type IncidentStudioTelemetryGateSliceCore,
} from './incidentStudioTelemetryPolicyCore';
import { classifyTelemetryBlockers } from './incidentStudioTruthModel';

export type IncidentStudioTelemetryGateSlice = IncidentStudioTelemetryGateSliceCore & {
  releaseReadinessValidationKpiStatus?: {
    workspacePath?: string;
    timeWindow?: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt?: string | null;
    windowEndAt?: string;
    metrics?: {
      releaseReadinessArtifactsExported?: number;
      goDecisionsExported?: number;
      noGoDecisionsExported?: number;
      decisionsValidated?: number;
      decisionsCorrect?: number;
      noGoDecisionsValidated?: number;
      noGoPreventedIncident?: number;
      releaseReadinessDecisionAccuracy?: number | null;
      noGoPreventedIncidentRate?: number | null;
    };
    gates?: {
      telemetryEvidencePass?: boolean;
      releaseReadinessDecisionAccuracyAvailable?: boolean;
      noGoPreventedIncidentRateAvailable?: boolean;
      overallPass?: boolean;
    };
  } | null;
  studioReproPackKpiStatus?: {
    workspacePath?: string;
    timeWindow?: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt?: string | null;
    windowEndAt?: string;
    metrics?: {
      reproPackCaptured?: number;
      reproPackExported?: number;
      reproPackImported?: number;
      incidentReplayReady?: number;
      incidentReplayMemoryEnriched?: number;
      reproPackShareRate?: number | null;
      replayToResolutionRate?: number | null;
    };
    gates?: {
      telemetryEvidencePass?: boolean;
      reproPackShareRatePass?: boolean;
      replayToResolutionRatePass?: boolean;
      overallPass?: boolean;
    };
  } | null;
  commandSummary?: {
    totalEvents?: number;
    lastCommand?: string | null;
    lastCommandAt?: string | null;
    commandUsage?: Array<{ command: string; count: number }>;
    surfaceBreakdown?: {
      actionEvents?: number;
      askEvents?: number;
      actionVsAskShare?: number | null;
    };
  } | null;
};

function mapAnalyzeVerdictToFlowState(
  verdict?: 'ready' | 'needs-attention' | 'blocked'
): PolicyGateState['flowState'] {
  if (verdict === 'ready') {
    return 'passing';
  }
  if (verdict === 'blocked') {
    return 'blocking';
  }
  if (verdict === 'needs-attention') {
    return 'warning';
  }
  return 'pending';
}

function mapAnalyzeVerdictToReleasePosture(
  verdict?: 'ready' | 'needs-attention' | 'blocked'
): ReleaseGatePosture {
  if (verdict === 'ready') {
    return 'go';
  }
  if (verdict === 'blocked') {
    return 'no-go';
  }
  return 'pending';
}

export function resolvePolicyGateBlockedReasonsFromTelemetry(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): string[] {
  return resolvePolicyGateBlockedReasonsFromTelemetryCore(telemetry);
}

export function canApplyStudioMutationFromTelemetry(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): { allowed: boolean; reason: string | null } {
  return canApplyStudioMutationFromTelemetryCore(telemetry);
}

export const resolveVerifyGateBlockedReasonsFromTelemetry =
  resolvePolicyGateBlockedReasonsFromTelemetry;

export function resolveTelemetryStateFromTelemetry(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): PolicyGateState['telemetryState'] {
  if (!telemetry) {
    return 'pending';
  }
  if (telemetry.enterpriseStabilizationGateStatus?.expansionFrozen) {
    return 'stale';
  }

  const hard = telemetry.studioHardGateStatus;
  const stabilization = telemetry.studioStabilizationKpiStatus;
  if (!hard && !stabilization) {
    return 'pending';
  }

  if (hard?.gates?.overallPass && stabilization?.gates?.overallPass) {
    return 'complete';
  }

  return 'partial';
}

export function mergePolicyGatesFromTelemetry(
  current: PolicyGateState,
  telemetry?: IncidentStudioTelemetryGateSlice | null,
  analyzeVerdict?: 'ready' | 'needs-attention' | 'blocked',
  options?: { artifactReleaseReady?: boolean }
): PolicyGateState {
  const telemetryState = resolveTelemetryStateFromTelemetry(telemetry);
  const blockedReasons = resolvePolicyGateBlockedReasonsFromTelemetry(telemetry);
  const analyzeFlow = mapAnalyzeVerdictToFlowState(analyzeVerdict);
  const analyzeRelease = mapAnalyzeVerdictToReleasePosture(analyzeVerdict);
  const artifactReleaseReady = options?.artifactReleaseReady === true;

  const hardBlocked = telemetry?.studioHardGateStatus?.gates?.overallPass === false;
  const stabilizationBlocked =
    telemetry?.studioStabilizationKpiStatus?.gates?.overallPass === false;
  const enterpriseBlocked =
    telemetry?.enterpriseStabilizationGateStatus?.last7d?.hardGatePass === false;
  const expansionFrozen = telemetry?.enterpriseStabilizationGateStatus?.expansionFrozen === true;

  const classified = classifyTelemetryBlockers(blockedReasons);
  const releaseBlocking = expansionFrozen ? [] : classified.releaseBlocking;
  const studioLearning = classified.studioLearning;

  let flowState = current.flowState;
  let releasePosture = current.releasePosture;

  const releaseBlocked =
    analyzeFlow === 'blocking' ||
    releaseBlocking.length > 0 ||
    (hardBlocked && !artifactReleaseReady) ||
    (stabilizationBlocked && !artifactReleaseReady && releaseBlocking.length > 0) ||
    (enterpriseBlocked && !artifactReleaseReady && releaseBlocking.length > 0);

  if (releaseBlocked) {
    flowState = 'blocking';
    releasePosture = 'no-go';
  } else if (artifactReleaseReady && analyzeVerdict === 'ready') {
    flowState = studioLearning.length > 0 || telemetryState === 'partial' ? 'warning' : 'passing';
    releasePosture = 'go';
  } else if (
    studioLearning.length > 0 ||
    telemetryState === 'partial' ||
    analyzeFlow === 'warning' ||
    expansionFrozen ||
    telemetry?.studioStabilizationKpiStatus?.gates?.routePrecisionPass === false
  ) {
    flowState = flowState === 'blocking' ? 'blocking' : 'warning';
    releasePosture =
      analyzeVerdict === 'ready' && !releaseBlocked
        ? 'go'
        : releasePosture === 'go'
          ? 'pending'
          : releasePosture;
  } else if (
    telemetry?.studioHardGateStatus?.gates?.overallPass &&
    telemetry?.studioStabilizationKpiStatus?.gates?.overallPass &&
    analyzeFlow === 'passing'
  ) {
    flowState = 'passing';
    releasePosture = 'go';
  } else if (analyzeVerdict) {
    flowState = analyzeFlow;
    releasePosture = analyzeRelease;
  }

  return {
    ...current,
    flowState,
    telemetryState,
    releasePosture,
    freshness:
      telemetry?.studioHardGateStatus?.windowEndAt ||
      telemetry?.studioStabilizationKpiStatus?.windowEndAt ||
      current.freshness,
  };
}

export function isVerifyActionBlockedByPolicyGates(input: {
  policyGates: PolicyGateState;
  verifyGateBlockedReasons?: string[];
  artifactReleaseReady?: boolean;
}): boolean {
  if (input.artifactReleaseReady) {
    return false;
  }

  const releaseBlocking = classifyTelemetryBlockers(
    input.verifyGateBlockedReasons ?? []
  ).releaseBlocking;

  return (
    input.policyGates.flowState === 'blocking' ||
    input.policyGates.telemetryState === 'stale' ||
    releaseBlocking.length > 0
  );
}
