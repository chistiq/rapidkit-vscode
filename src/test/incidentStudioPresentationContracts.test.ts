import { describe, expect, it } from 'vitest';

import {
  deriveLitePrimaryActionPlan,
  deriveLiteReleaseState,
  getLiteProofButtonLabel,
} from '../../webview-ui/src/lib/incidentStudioLiteMode';
import { deriveStabilizationEnterpriseClaim } from '../../webview-ui/src/lib/incidentStudioStabilizationClaim';
import type { IncidentStudioStabilizationKpiStatus } from '../../webview-ui/src/lib/incidentStudioPayload';
import {
  formatDecisionClarityEvidenceLine,
  getActionResultPresentation,
  getDecisionClarityNextActionGuidance,
  getGuardedActionResultPresentation,
  getReleaseSignalLabel,
  resolveVerificationClaimGuard,
} from '../../webview-ui/src/lib/incidentStudioVerifyPolicy';
import {
  buildGuidedIntentChips,
  resolveGuidedIntentChipsFromStudioContext,
} from '../../webview-ui/src/lib/incidentStudioGuidedActions';
import { enforceVerifyCompletionGates } from '../ui/panels/incidentStudioPolicyGates';
import {
  buildReplayQueryFromIncidentReproPack,
  formatReproPackSensitivityLabel,
} from '../../webview-ui/src/lib/incidentStudioReproPack';
import { resolveMultiFilePatchApplyArgs } from '../../webview-ui/src/lib/incidentStudioPayload';

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

describe('Incident Studio presentation contracts (lib parity)', () => {
  it('lite mode: HOLD parity and blocker investigation CTA for advisory stabilization blockers', () => {
    const claim = deriveStabilizationEnterpriseClaim({ status: stabilizationFixture });
    const liteState = deriveLiteReleaseState({
      releaseDecision: undefined,
      hardBlockerCount: 0,
      advisoryBlockerCount: claim.normalizedBlockers.length,
    });
    const topBlocker = claim.normalizedBlockers[0] ?? null;
    const plan = deriveLitePrimaryActionPlan({
      topBlocker,
      primaryActionLabel: 'Validate deployment impact',
      primaryActionSource: 'chatBrainBoard.actions[0]',
      fallbackQuery: 'Ask AI for the single safest next step',
    });

    expect(liteState.label).toBe('HOLD');
    expect(liteState.summary).toBe('Hold: 2 stabilization signals need review');
    expect(plan.buttonLabel).toBe('Investigate blocker');
    expect(getLiteProofButtonLabel(Boolean(topBlocker))).toBe('Run blocker check');
  });

  it('stabilization KPI: HOLD claim when advisory blockers fail even if overallPass remains true', () => {
    const claim = deriveStabilizationEnterpriseClaim({ status: stabilizationFixture });

    expect(claim.summaryState).toBe('HOLD');
    expect(claim.enterpriseClaimLabel).toBe('hold');
    expect(claim.verifyWarningsLine).toBe('verify warnings: 3 (15%)');
  });

  it('decision clarity: de-duplicates next action wording from verify command', () => {
    const guidance = getDecisionClarityNextActionGuidance({
      nextStep: 'npm run test:integration',
      primaryVerifyStep: 'npm run test:integration',
    });
    const evidenceLine = formatDecisionClarityEvidenceLine(['doctor-evidence', 'system-graph']);

    expect(guidance).toBe(
      'Run the primary verify step and inspect the result before claiming completion.'
    );
    expect(guidance).not.toBe('npm run test:integration');
    expect(evidenceLine).toBe('Evidence: doctor-evidence | system-graph');
  });

  it('guided mode: deterministic next + verify chips only (max two)', () => {
    const chips = buildGuidedIntentChips({
      primaryBoardAction: {
        label: 'Patch failing contract test',
        command: 'rapidkit add module auth',
      },
      verifyCommandPackRequired: 'rapidkit doctor workspace',
      isProjectAnalysisScope: false,
    });

    expect(chips.some((chip) => chip.label === 'Proof this worked')).toBe(true);
    expect(chips.length).toBeLessThanOrEqual(2);
    expect(chips.filter((chip) => chip.isPrimary).length).toBe(1);
  });

  it('resolveGuidedIntentChipsFromStudioContext merges board action and verify pack', () => {
    const chips = resolveGuidedIntentChipsFromStudioContext({
      scopeType: 'project',
      primaryBoardAction: {
        label: 'Patch failing contract test',
        command: 'rapidkit add module auth',
      },
      actionResult: {
        success: true,
        decisionClarity: {
          situation: 'Contract drift',
          reason: 'Schema mismatch',
          impactScope: ['src/auth.ts'],
          risk: { confidenceBand: 'high', confidence: 80, mutating: true },
          nextStep: 'npm run test:integration',
          verifyPlan: ['npm run test:integration'],
          rollbackPlan: 'git checkout src/auth.ts',
          evidenceLinks: [],
          requiredMissingFields: [],
          mutationReady: true,
        },
        verifyCommandPack: {
          qualityScore: 90,
          readiness: 'ready',
          rationale: 'Deterministic verify pack',
          blockedReasons: [],
          commands: [{ command: 'rapidkit doctor project', required: true }],
        },
      },
    });

    expect(chips[0]?.label).toBe('Patch failing contract test');
    expect(chips.some((chip) => chip.label === 'Proof this worked')).toBe(true);
  });

  it('suppresses Verification passed claim when latest release evidence is NO-GO', () => {
    const base = getActionResultPresentation({
      success: true,
      outputSummary: 'All checks passed locally.',
    });
    const guard = resolveVerificationClaimGuard({
      releaseDecision: 'no-go',
      verifyGateBlockedReasons: [],
      verifyPackBlockedReasons: [],
    });
    const presentation = getGuardedActionResultPresentation({ base, guard });

    expect(presentation.title).toBe('Release blocked (NO-GO evidence)');
    expect(presentation.title).not.toBe('Verification passed');
  });

  it('keeps GO evidence in HOLD state when verify completion gates are blocking', () => {
    const gateEnforcement = enforceVerifyCompletionGates({
      verifyPhaseReachPass: false,
      bridgeRouteCompletionPass: false,
      overallPass: false,
    });
    const guard = resolveVerificationClaimGuard({
      releaseDecision: 'go',
      verifyGateBlockedReasons: gateEnforcement.blockedReasons,
      verifyPackBlockedReasons: [],
    });
    const base = getActionResultPresentation({
      success: true,
      outputSummary: 'Latest execution returned successfully.',
    });
    const presentation = getGuardedActionResultPresentation({ base, guard });
    const releaseLabel = getReleaseSignalLabel({
      releaseDecision: 'go',
      verificationClaimBlocked: guard.blocked,
    });

    expect(releaseLabel).toBe('GO evidence, HOLD by verify gates');
    expect(presentation.title).toBe('Verification pending gate compliance');
    expect(presentation.title).not.toBe('Verification passed');
  });

  it('repro pack: builds replay query and sensitivity label', () => {
    const reproPack = {
      packId: 'repro-pack-42',
      status: 'captured' as const,
      capturedAt: '2026-05-11T04:00:00Z',
      schemaVersion: 'v1' as const,
      workspacePath: '/workspace/acme',
      conversationId: 'conv-1',
      actionId: 'action-1',
      redaction: { policy: 'strict', applied: true, redactedFields: ['token'] },
      summary: {
        historyTurns: 4,
        hasDoctorEvidence: true,
        hasRollbackEvidence: false,
        hasSandboxEvidence: false,
        hasPredictiveWarning: true,
        verifySuccess: false,
        affectedFilesCount: 2,
        blockedReasonCount: 1,
      },
      replayPayload: {
        workspacePath: '/workspace/acme',
        conversationId: 'conv-1',
        actionType: 'doctor-fix',
        riskLevel: 'high' as const,
        likelyFailureMode: 'authorization regression',
        verifyChecklist: ['npm run test:integration'],
        blockedReasons: ['scope unknown'],
        relatedFiles: ['src/orders/service.ts'],
      },
      exportHint: 'Bundle is redacted and safe to share.',
      sensitivityLabel: 'restricted' as const,
    };

    const replayQuery = buildReplayQueryFromIncidentReproPack(reproPack);

    expect(replayQuery).toContain('Pack ID: repro-pack-42');
    expect(replayQuery).toContain('Verification checklist:');
    expect(formatReproPackSensitivityLabel(reproPack.sensitivityLabel)).toBe('RESTRICTED');
  });

  it('multi-file patch: applies only accepted paths with branch-safe flag', () => {
    const allPaths = ['src/orders/service.ts', 'src/orders/controller.ts'];
    const selected = new Set(['src/orders/controller.ts']);

    expect(
      resolveMultiFilePatchApplyArgs({
        patchId: 'patch-123',
        allPaths,
        selectedPaths: selected,
        branchSafeApply: false,
      })
    ).toEqual({
      patchId: 'patch-123',
      acceptedPaths: ['src/orders/controller.ts'],
      branchSafeApply: false,
    });
  });
});
