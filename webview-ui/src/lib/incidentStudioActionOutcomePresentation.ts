import type { NormalizedIncidentActionResultPayload } from './incidentStudioPayload';
import {
  formatDecisionClarityEvidenceLine,
  getActionResultPresentation,
  getDecisionClarityNextActionGuidance,
  getGuardedActionResultPresentation,
  getReleaseSignalLabel,
  resolveVerificationClaimGuard,
} from './incidentStudioVerifyPolicy';
import {
  formatReproPackSensitivityLabel,
  MEMORY_INFLUENCE_TIMELINE_HEADING,
} from './incidentStudioReproPack';

export type ActionOutcomePresentation = {
  headline: { title: string; description: string; tone: 'success' | 'warning' | 'failure' };
  releaseSignalLabel: string | null;
  decisionClarity: {
    nextAction: string;
    verifyLine: string | null;
    evidenceLine: string | null;
  } | null;
  reproPack: {
    packId: string;
    sensitivityLabel: string;
    verifyChecklistCount: number;
  } | null;
  memoryTimeline: {
    heading: string;
    entries: Array<{ id: string; summary: string }>;
  } | null;
};

export function buildActionOutcomePresentation(
  result: NormalizedIncidentActionResultPayload | null | undefined,
  verifyGateBlockedReasons: string[] = []
): ActionOutcomePresentation | null {
  if (!result) {
    return null;
  }

  const hasDecisionClarity = Boolean(result.decisionClarity);
  const hasReproPack = Boolean(result.incidentReproPack);
  const hasMemoryTimeline = (result.memoryInfluenceAuditTimeline?.length ?? 0) > 0;
  const hasReleaseCommander = Boolean(result.releaseReadinessCommander);
  const hasSummary = Boolean(result.outputSummary?.trim());

  if (
    !hasDecisionClarity &&
    !hasReproPack &&
    !hasMemoryTimeline &&
    !hasReleaseCommander &&
    !hasSummary
  ) {
    return null;
  }

  const guard = resolveVerificationClaimGuard({
    releaseDecision: result.releaseReadinessCommander?.decision,
    verifyGateBlockedReasons,
    verifyPackBlockedReasons: result.verifyCommandPack?.blockedReasons ?? [],
  });
  const base = getActionResultPresentation({
    success: result.success,
    outputSummary: result.outputSummary,
    verificationRequired: result.verificationRequired,
    verifyPolicy: result.verifyPolicy,
  });
  const headline = getGuardedActionResultPresentation({ base, guard });

  const releaseSignalLabel = hasReleaseCommander
    ? getReleaseSignalLabel({
        releaseDecision: result.releaseReadinessCommander?.decision,
        verificationClaimBlocked: guard.blocked,
      })
    : null;

  const decisionClarity = result.decisionClarity
    ? {
        nextAction: getDecisionClarityNextActionGuidance({
          nextStep: result.decisionClarity.nextStep,
          primaryVerifyStep: result.decisionClarity.verifyPlan[0],
        }),
        verifyLine:
          result.decisionClarity.verifyPlan.length > 0
            ? `Verify: ${result.decisionClarity.verifyPlan.slice(0, 3).join(' | ')}`
            : null,
        evidenceLine: formatDecisionClarityEvidenceLine(result.decisionClarity.evidenceLinks),
      }
    : null;

  const reproPack = result.incidentReproPack
    ? {
        packId: result.incidentReproPack.packId,
        sensitivityLabel: formatReproPackSensitivityLabel(
          result.incidentReproPack.sensitivityLabel
        ),
        verifyChecklistCount: result.incidentReproPack.replayPayload.verifyChecklist.length,
      }
    : null;

  const memoryTimeline = hasMemoryTimeline
    ? {
        heading: MEMORY_INFLUENCE_TIMELINE_HEADING,
        entries: (result.memoryInfluenceAuditTimeline ?? []).slice(0, 4).map((entry) => ({
          id: entry.memoryEventId,
          summary: entry.summary,
        })),
      }
    : null;

  return {
    headline,
    releaseSignalLabel,
    decisionClarity,
    reproPack,
    memoryTimeline,
  };
}

export function resolveVerifyGateBlockedReasonsFromTelemetry(
  gateStatus?: {
    gates?: {
      verifyPhaseReachPass?: boolean;
      bridgeRouteCompletionPass?: boolean;
    };
  } | null
): string[] {
  if (!gateStatus?.gates) {
    return [];
  }

  const reasons: string[] = [];
  if (gateStatus.gates.verifyPhaseReachPass === false) {
    reasons.push('Verify phase reach < minimum threshold');
  }
  if (gateStatus.gates.bridgeRouteCompletionPass === false) {
    reasons.push('Deterministic execution path incomplete; cannot finalize decision');
  }
  return reasons;
}
