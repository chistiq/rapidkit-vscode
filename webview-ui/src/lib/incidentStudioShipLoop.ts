import type {
  PolicyGateState,
  ReleaseGatePosture,
} from '@/components/StudioRedesign/state/studioState';

import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';
import { isVerifyActionBlockedByPolicyGates } from './incidentStudioPolicyGateMapper';
import { classifyTelemetryBlockers, isArtifactReleaseReady } from './incidentStudioTruthModel';

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
  shipEvidence?: { cards?: ShipLoopEvidenceCard[] } | null;
  verifyArtifactPassed?: boolean;
}): { state: ShipLoopStepState; blockers: string[] } {
  const allReasons = input.verifyGateBlockedReasons ?? [];
  const { releaseBlocking, studioLearning } = classifyTelemetryBlockers(allReasons);
  const artifactReleaseReady = isArtifactReleaseReady({
    shipEvidence: input.shipEvidence,
    studioEvidence: input.studioEvidence,
    verifyArtifactPassed: input.verifyArtifactPassed,
  });

  if (input.verifyArtifactPassed === false) {
    return {
      state: 'fail',
      blockers:
        releaseBlocking.length > 0 ? releaseBlocking : ['Workspace verify artifact did not pass.'],
    };
  }

  if (artifactReleaseReady || input.verifyArtifactPassed === true) {
    if (studioLearning.length > 0) {
      return {
        state: 'warn',
        blockers: [`Studio operator path (optional): ${studioLearning.slice(0, 2).join('; ')}`],
      };
    }
    return { state: 'pass', blockers: [] };
  }

  if (releaseBlocking.length > 0) {
    return { state: 'blocked', blockers: releaseBlocking };
  }

  if (studioLearning.length > 0) {
    return {
      state: 'warn',
      blockers: [`Improve Studio operator metrics: ${studioLearning[0]}`],
    };
  }

  const hardPass = input.telemetry?.studioHardGateStatus?.gates?.overallPass;
  if (hardPass === true) {
    return { state: 'pass', blockers: [] };
  }
  if (hardPass === false) {
    return {
      state: 'warn',
      blockers: ['Studio operator-path hard gates are still learning.'],
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
  verifyArtifactPassed?: boolean;
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

  const verifyResolved = resolveVerifyStepState({
    telemetry: input.telemetry,
    studioEvidence: input.studioEvidence,
    verifyGateBlockedReasons: input.verifyGateBlockedReasons,
    shipEvidence: input.shipEvidence,
    verifyArtifactPassed: input.verifyArtifactPassed,
  });
  const readinessStatus = readinessCard?.status ?? 'missing';
  const archiveStatus = archiveCard?.status ?? 'missing';
  const autopilotStatus = autopilotCard?.status ?? 'missing';
  const artifactReleaseReady = isArtifactReleaseReady({
    shipEvidence: input.shipEvidence,
    studioEvidence: input.studioEvidence,
    verifyArtifactPassed: input.verifyArtifactPassed,
  });

  const verifyGreenEnough = verifyResolved.state === 'pass' || verifyResolved.state === 'warn';
  const releaseReady =
    isStageGreenEnough(analyzeStatus) &&
    isStageGreenEnough(readinessStatus) &&
    verifyGreenEnough &&
    verifyResolved.state !== 'fail';

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
              artifactReleaseReady,
            })
          : verifyResolved.state !== 'blocked' && verifyResolved.state !== 'fail',
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
      state:
        autopilotStatus === 'pass'
          ? 'pass'
          : releaseReady
            ? autopilotStatus === 'missing'
              ? 'warn'
              : autopilotStatus
            : 'blocked',
      blockers:
        autopilotStatus === 'pass'
          ? []
          : releaseReady
            ? (autopilotCard?.blockers ?? [])
            : ['Complete analyze, verify, and readiness first.'],
      runnable: releaseReady || autopilotStatus === 'pass',
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
