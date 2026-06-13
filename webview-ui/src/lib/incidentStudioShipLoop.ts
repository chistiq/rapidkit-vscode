import type {
  PolicyGateState,
  ReleaseGatePosture,
} from '@/components/StudioRedesign/state/studioState';

import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import { isVerifyActionBlockedByPolicyGates } from './incidentStudioPolicyGateMapper';

export type ShipLoopEvidenceStatus = 'pass' | 'warn' | 'fail' | 'missing';

export type ShipLoopEvidenceCard = {
  id: 'analyze' | 'readiness' | 'autopilot' | 'archive';
  status: ShipLoopEvidenceStatus;
  summary?: string;
  blockers?: string[];
  generatedAt?: string;
};

export type ShipLoopStepId =
  | 'analyze'
  | 'verify-gates'
  | 'readiness'
  | 'archive'
  | 'autopilot-release';

export type ShipLoopStepState = 'pass' | 'warn' | 'fail' | 'missing' | 'blocked';

export type EnterpriseShipLoopStepView = {
  id: ShipLoopStepId;
  label: string;
  detail: string;
  state: ShipLoopStepState;
  blockers: string[];
  runnable: boolean;
  runLabel: string;
};

export type EnterpriseShipLoopView = {
  steps: EnterpriseShipLoopStepView[];
  releaseReady: boolean;
  releasePosture: ReleaseGatePosture;
  nextStepId: ShipLoopStepId | null;
  recoveryHint: string | null;
};

export type ShipLoopStudioEvidenceSlice = {
  verdict?: 'ready' | 'needs-attention' | 'blocked';
  generatedAt?: string;
};

function mapVerdictToStatus(
  verdict?: 'ready' | 'needs-attention' | 'blocked'
): ShipLoopEvidenceStatus {
  if (verdict === 'ready') {
    return 'pass';
  }
  if (verdict === 'blocked') {
    return 'fail';
  }
  if (verdict === 'needs-attention') {
    return 'warn';
  }
  return 'missing';
}

function cardForId(
  cards: ShipLoopEvidenceCard[] | undefined,
  id: ShipLoopEvidenceCard['id']
): ShipLoopEvidenceCard | undefined {
  return cards?.find((entry) => entry.id === id);
}

function resolveVerifyStepState(input: {
  telemetry?: IncidentStudioTelemetryGateSlice | null;
  studioEvidence?: ShipLoopStudioEvidenceSlice | null;
  verifyGateBlockedReasons?: string[];
}): { state: ShipLoopStepState; blockers: string[] } {
  const blockedReasons = input.verifyGateBlockedReasons ?? [];
  if (blockedReasons.length > 0) {
    return { state: 'blocked', blockers: blockedReasons };
  }

  const hardPass = input.telemetry?.studioHardGateStatus?.gates?.overallPass;
  if (hardPass === true) {
    return { state: 'pass', blockers: [] };
  }
  if (hardPass === false) {
    return {
      state: 'fail',
      blockers: ['Telemetry hard gates did not pass the latest verify window.'],
    };
  }

  if (input.studioEvidence?.generatedAt) {
    return { state: 'warn', blockers: [] };
  }

  return { state: 'missing', blockers: [] };
}

function isStageGreenEnough(status: ShipLoopEvidenceStatus): boolean {
  return status === 'pass' || status === 'warn';
}

export function deriveEnterpriseShipLoopView(input: {
  shipEvidence?: { cards?: ShipLoopEvidenceCard[] } | null;
  studioEvidence?: ShipLoopStudioEvidenceSlice | null;
  telemetry?: IncidentStudioTelemetryGateSlice | null;
  policyGates?: PolicyGateState;
  releasePosture?: ReleaseGatePosture;
  verifyGateBlockedReasons?: string[];
}): EnterpriseShipLoopView {
  const cards = input.shipEvidence?.cards ?? [];
  const analyzeCard = cardForId(cards, 'analyze');
  const readinessCard = cardForId(cards, 'readiness');
  const archiveCard = cardForId(cards, 'archive');
  const autopilotCard = cardForId(cards, 'autopilot');

  const analyzeStatus: ShipLoopEvidenceStatus =
    analyzeCard?.status ??
    (input.studioEvidence?.verdict
      ? mapVerdictToStatus(input.studioEvidence.verdict)
      : input.studioEvidence?.generatedAt
        ? 'warn'
        : 'missing');

  const verifyResolved = resolveVerifyStepState(input);
  const readinessStatus = readinessCard?.status ?? 'missing';
  const archiveStatus = archiveCard?.status ?? 'missing';
  const autopilotStatus = autopilotCard?.status ?? 'missing';

  const releaseReady =
    isStageGreenEnough(analyzeStatus) &&
    isStageGreenEnough(readinessStatus) &&
    verifyResolved.state !== 'fail' &&
    verifyResolved.state !== 'blocked';

  const steps: EnterpriseShipLoopStepView[] = [
    {
      id: 'analyze',
      label: 'Analyze evidence',
      detail: analyzeCard?.summary || 'Strict workspace analyze report',
      state: analyzeStatus,
      blockers: analyzeCard?.blockers ?? [],
      runnable: true,
      runLabel: analyzeStatus === 'missing' ? 'Run analyze' : 'Refresh',
    },
    {
      id: 'verify-gates',
      label: 'Verify gates',
      detail: 'Release/CI gate command plus telemetry hard gates',
      state: verifyResolved.state,
      blockers: verifyResolved.blockers,
      runnable:
        input.policyGates != null
          ? !isVerifyActionBlockedByPolicyGates({
              policyGates: input.policyGates,
              verifyGateBlockedReasons: input.verifyGateBlockedReasons,
            })
          : (input.verifyGateBlockedReasons?.length ?? 0) === 0,
      runLabel: verifyResolved.state === 'missing' ? 'Verify gates' : 'Re-verify',
    },
    {
      id: 'readiness',
      label: 'Release readiness',
      detail: readinessCard?.summary || 'Publish-readiness and bootstrap evidence',
      state: readinessStatus,
      blockers: readinessCard?.blockers ?? [],
      runnable: true,
      runLabel: readinessStatus === 'missing' ? 'Run readiness' : 'Refresh',
    },
    {
      id: 'archive',
      label: 'Customer archive',
      detail: archiveCard?.summary || 'Workspace archive manifest for ship handoff',
      state: archiveStatus,
      blockers: archiveCard?.blockers ?? [],
      runnable: releaseReady,
      runLabel: archiveStatus === 'missing' ? 'Build archive' : 'Refresh archive',
    },
    {
      id: 'autopilot-release',
      label: 'Autopilot release',
      detail: autopilotCard?.summary || 'Fleet autopilot release gate execution',
      state: releaseReady ? (autopilotStatus === 'missing' ? 'warn' : autopilotStatus) : 'blocked',
      blockers: releaseReady
        ? (autopilotCard?.blockers ?? [])
        : ['Complete analyze, verify, and readiness first.'],
      runnable: releaseReady,
      runLabel: autopilotStatus === 'missing' ? 'Release' : 'Refresh release',
    },
  ];

  const nextStepId =
    steps.find(
      (step) => step.state === 'missing' || step.state === 'fail' || step.state === 'blocked'
    )?.id ?? null;

  let recoveryHint: string | null = null;
  if (nextStepId === 'verify-gates' && verifyResolved.blockers.length > 0) {
    recoveryHint = verifyResolved.blockers[0] ?? null;
  } else if (nextStepId === 'readiness') {
    recoveryHint = 'Run readiness to hydrate publish-readiness evidence before archive or release.';
  } else if (nextStepId === 'analyze') {
    recoveryHint = 'Run analyze to seed gate commands and release posture.';
  } else if (!releaseReady) {
    recoveryHint =
      'Ship loop requires analyze and readiness evidence before archive or autopilot release.';
  } else if (autopilotStatus === 'fail') {
    recoveryHint = 'Autopilot release evidence failed — inspect blockers and re-run verify gates.';
  } else if (autopilotStatus === 'pass') {
    recoveryHint =
      'Ship loop evidence is green; archive and release artifacts are ready for handoff.';
  }

  return {
    steps,
    releaseReady,
    releasePosture: input.releasePosture ?? 'pending',
    nextStepId,
    recoveryHint,
  };
}

export function resolveShipLoopStepBlockReason(
  stepId: ShipLoopStepId,
  loopView: EnterpriseShipLoopView | null | undefined,
  mutationBlockReason?: string | null
): string | null {
  if (!loopView) {
    return 'Ship loop evidence is not loaded yet.';
  }

  const step = loopView.steps.find((entry) => entry.id === stepId);
  if (!step) {
    return 'Unknown ship loop step.';
  }

  if (!step.runnable) {
    return step.blockers[0] || 'This ship loop step is blocked by upstream evidence.';
  }

  if ((stepId === 'archive' || stepId === 'autopilot-release') && mutationBlockReason) {
    return mutationBlockReason;
  }

  return null;
}
