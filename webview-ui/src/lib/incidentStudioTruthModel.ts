import type {
  PolicyGateState,
  ReleaseGatePosture,
  StudioActionStatus,
  StudioEvidenceSummary,
} from '@/components/StudioRedesign/state/studioState';

import type { EnterpriseShipLoopView } from './incidentStudioShipLoop';
import type { ShipLoopEvidenceCard } from './incidentStudioShipLoop';

export type StudioTruthLaneStatus = 'ready' | 'review' | 'blocked';

export type StudioTruthHeadline = {
  label: 'Ready' | 'Needs Review' | 'Blocked';
  tone: 'ok' | 'warning' | 'error';
  summary: string;
};

export type StudioPrimaryFix = {
  title: string;
  detail: string;
  command?: string;
  actionCommand?: string;
};

export type StudioTruthSnapshot = {
  headline: StudioTruthHeadline;
  workspaceLane: { status: StudioTruthLaneStatus; summary: string };
  studioFlowLane: { status: StudioTruthLaneStatus; summary: string };
  primaryFix: StudioPrimaryFix | null;
  artifactReleaseReady: boolean;
  releaseBlockingReasons: string[];
  studioLearningReasons: string[];
  suppressStaleVerifyFailure: boolean;
};

const STUDIO_LEARNING_PATTERNS = [
  /bridge route completion/i,
  /verify-path completion/i,
  /verify phase reach/i,
  /route precision/i,
  /false-confidence/i,
  /rollback recovery/i,
  /rollback success rate/i,
  /unrecovered verification/i,
  /command_failed/i,
  /verify evidence completion/i,
  /enterprise stabilization/i,
  /expansion frozen/i,
  /stabilization gate/i,
  /operator path/i,
];

export function isStudioLearningBlocker(reason: string): boolean {
  const trimmed = reason.trim();
  if (!trimmed) {
    return false;
  }
  return STUDIO_LEARNING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function classifyTelemetryBlockers(reasons: string[]): {
  releaseBlocking: string[];
  studioLearning: string[];
} {
  const releaseBlocking: string[] = [];
  const studioLearning: string[] = [];

  for (const reason of reasons) {
    if (isStudioLearningBlocker(reason)) {
      studioLearning.push(reason);
    } else {
      releaseBlocking.push(reason);
    }
  }

  return { releaseBlocking, studioLearning };
}

export function resolveReleaseBlockingReasons(reasons: string[]): string[] {
  return classifyTelemetryBlockers(reasons).releaseBlocking;
}

export function resolveStudioLearningReasons(reasons: string[]): string[] {
  return classifyTelemetryBlockers(reasons).studioLearning;
}

function cardStatus(
  cards: ShipLoopEvidenceCard[] | undefined,
  id: ShipLoopEvidenceCard['id']
): ShipLoopEvidenceCard['status'] | undefined {
  return cards?.find((entry) => entry.id === id)?.status;
}

export function isArtifactReleaseReady(input: {
  shipEvidence?: { cards?: ShipLoopEvidenceCard[] } | null;
  studioEvidence?: Pick<StudioEvidenceSummary, 'verdict'> | null;
  verifyArtifactPassed?: boolean;
}): boolean {
  const cards = input.shipEvidence?.cards ?? [];
  const analyzeStatus = cardStatus(cards, 'analyze');
  const readinessStatus = cardStatus(cards, 'readiness');
  const autopilotStatus = cardStatus(cards, 'autopilot');

  const analyzeOk =
    analyzeStatus === 'pass' ||
    analyzeStatus === 'warn' ||
    input.studioEvidence?.verdict === 'ready';
  const readinessOk = readinessStatus === 'pass' || readinessStatus === 'warn';
  const autopilotOk = autopilotStatus === 'pass';
  const verifyOk = input.verifyArtifactPassed !== false;

  return analyzeOk && readinessOk && autopilotOk && verifyOk;
}

export function deriveStudioTruth(input: {
  releasePosture: ReleaseGatePosture;
  policyGates: PolicyGateState;
  studioEvidence?: StudioEvidenceSummary | null;
  shipLoop?: EnterpriseShipLoopView | null;
  shipEvidence?: { cards?: ShipLoopEvidenceCard[] } | null;
  verifyGateBlockedReasons?: string[];
  studioActionStatus?: StudioActionStatus | null;
  verifyArtifactPassed?: boolean;
}): StudioTruthSnapshot {
  const allReasons = input.verifyGateBlockedReasons ?? [];
  const { releaseBlocking, studioLearning } = classifyTelemetryBlockers(allReasons);
  const artifactReleaseReady = isArtifactReleaseReady({
    shipEvidence: input.shipEvidence,
    studioEvidence: input.studioEvidence,
    verifyArtifactPassed: input.verifyArtifactPassed,
  });

  const analyzeBlocked = input.studioEvidence?.verdict === 'blocked';
  const analyzeNeedsReview = input.studioEvidence?.verdict === 'needs-attention';
  const shipLoopBlocked = Boolean(
    input.shipLoop?.steps.some(
      (step) =>
        (step.state === 'blocked' || step.state === 'fail') &&
        step.id !== 'verify-gates' &&
        step.id !== 'autopilot-release'
    )
  );

  const workspaceBlocked =
    analyzeBlocked ||
    releaseBlocking.length > 0 ||
    (input.releasePosture === 'no-go' && !artifactReleaseReady) ||
    shipLoopBlocked;

  const workspaceReview =
    !workspaceBlocked &&
    (analyzeNeedsReview ||
      input.releasePosture === 'pending' ||
      (input.shipLoop?.nextStepId != null &&
        input.shipLoop.nextStepId !== 'verify-gates' &&
        !artifactReleaseReady));

  const workspaceLaneStatus: StudioTruthLaneStatus = workspaceBlocked
    ? 'blocked'
    : workspaceReview
      ? 'review'
      : 'ready';

  const studioFlowBlocked = studioLearning.length > 0 && !artifactReleaseReady;
  const studioFlowLaneStatus: StudioTruthLaneStatus = studioFlowBlocked
    ? 'blocked'
    : studioLearning.length > 0
      ? 'review'
      : 'ready';

  let headline: StudioTruthHeadline;
  if (workspaceBlocked) {
    headline = {
      label: 'Blocked',
      tone: 'error',
      summary:
        releaseBlocking[0] ||
        'Workspace release evidence has blockers. Fix the highlighted step before shipping.',
    };
  } else if (workspaceReview || (studioLearning.length > 0 && !artifactReleaseReady)) {
    headline = {
      label: 'Needs Review',
      tone: 'warning',
      summary: artifactReleaseReady
        ? 'Workspace release artifacts are approved. Studio operator metrics still need improvement.'
        : 'Complete the next ship-loop step before treating this workspace as release-ready.',
    };
  } else if (studioLearning.length > 0) {
    headline = {
      label: 'Ready',
      tone: 'ok',
      summary:
        'Workspace release artifacts are approved. Studio operator-path metrics are still learning — this does not block release.',
    };
  } else {
    headline = {
      label: 'Ready',
      tone: 'ok',
      summary: 'Evidence and gates support the current release posture.',
    };
  }

  let primaryFix: StudioPrimaryFix | null = null;
  if (workspaceBlocked && releaseBlocking[0]) {
    primaryFix = {
      title: 'Fix workspace blocker',
      detail: releaseBlocking[0],
      actionCommand: 'studio-action:verify-gates',
    };
  } else if (input.shipLoop?.nextStepId && !artifactReleaseReady) {
    const nextStep = input.shipLoop.steps.find((step) => step.id === input.shipLoop?.nextStepId);
    primaryFix = {
      title: nextStep?.label || 'Continue ship loop',
      detail:
        nextStep?.blockers[0] || input.shipLoop.recoveryHint || 'Run the next ship-loop step.',
      actionCommand:
        input.shipLoop.nextStepId === 'verify-gates' ? 'studio-action:verify-gates' : undefined,
    };
  } else if (studioLearning.length > 0 && !artifactReleaseReady) {
    primaryFix = {
      title: 'Improve Studio verify path',
      detail: studioLearning[0],
      actionCommand: 'studio-action:verify-gates',
    };
  }

  const suppressStaleVerifyFailure =
    artifactReleaseReady &&
    input.studioActionStatus?.actionId === 'verify-gates' &&
    input.studioActionStatus.status === 'failed';

  return {
    headline,
    workspaceLane: {
      status: workspaceLaneStatus,
      summary: artifactReleaseReady
        ? 'Analyze, verify, and release artifacts are approved on disk.'
        : workspaceBlocked
          ? releaseBlocking[0] || 'Release artifacts are not fully green yet.'
          : 'Run analyze and verify to produce release artifacts.',
    },
    studioFlowLane: {
      status: studioFlowLaneStatus,
      summary:
        studioLearning.length > 0
          ? studioLearning.slice(0, 2).join(' · ')
          : 'Operator-path telemetry and KPI windows are healthy.',
    },
    primaryFix,
    artifactReleaseReady,
    releaseBlockingReasons: releaseBlocking,
    studioLearningReasons: studioLearning,
    suppressStaleVerifyFailure,
  };
}
