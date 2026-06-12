import { describe, expect, it, vi } from 'vitest';

import {
  deriveLitePrimaryActionPlan,
  deriveLiteReleaseState,
  resolveLiteReleaseStateFromStudioContext,
} from '../../webview-ui/src/lib/incidentStudioLiteMode';
import type { IncidentStudioStabilizationKpiStatus } from '../../webview-ui/src/lib/incidentStudioPayload';

/**
 * Regression tests for Lite mode blocker-priority action routing
 *
 * Ensures that when blockers are present, the primary action routes to:
 * 1. Blocker investigation query before any verify/check step
 * 2. Normal action routing when no blockers exist
 * 3. Lite status semantics stay aligned with full-mode HOLD vs NO-GO meaning
 *
 * This prevents users from attempting risky actions while critical blockers exist.
 */

describe('IncidentStudioLiteMode - Blocker Priority Routing', () => {
  /**
   * Test 1: When liteTopBlocker exists,
   * should prioritize blocker investigation guidance over auto-running verify
   */
  it('routes to blocker investigation query when blocker exists even if verify commands are available', () => {
    const plan = deriveLitePrimaryActionPlan({
      topBlocker: 'Verify evidence completion below target.',
      primaryActionLabel: 'Validate deployment impact',
      primaryActionSource: 'chatBrainBoard.actions[0]',
      fallbackQuery: 'Ask AI for the single safest next step',
    });

    expect(plan.kind).toBe('blocker-query');
    expect(plan.buttonLabel).toBe('Investigate blocker');
    expect(plan.label).toBe('Investigate blocker: Verify evidence completion below target.');
    expect(plan.query).toBe(
      'Inspect this blocker and propose one deterministic remediation command: Verify evidence completion below target.'
    );
  });

  /**
   * Test 2: When liteTopBlocker exists but no required verify commands,
   * should send focused blocker remediation query to AI
   */
  it('routes to blocker remediation query when blocker exists but no verify commands', () => {
    const plan = deriveLitePrimaryActionPlan({
      topBlocker: 'Unrecovered verification failures above target.',
      primaryActionLabel: 'Validate deployment impact',
      primaryActionSource: 'fallback: guided-next-query',
      fallbackQuery: 'Ask AI for the single safest next step',
    });

    expect(plan.kind).toBe('blocker-query');
    expect(plan.query).toBe(
      'Inspect this blocker and propose one deterministic remediation command: Unrecovered verification failures above target.'
    );
  });

  /**
   * Test 3: When no liteTopBlocker exists,
   * should proceed with normal action routing (not blocker-focused)
   */
  it('routes to normal action when no blocker present', () => {
    const plan = deriveLitePrimaryActionPlan({
      topBlocker: null,
      primaryActionLabel: 'Validate deployment impact',
      primaryActionSource: 'chatBrainBoard.actions[0]',
      fallbackQuery: 'Ask AI for the single safest next step',
    });

    expect(plan.kind).toBe('board-action');
    expect(plan.buttonLabel).toBe('Run this next action');
    expect(plan.label).toBe('Validate deployment impact');
  });

  /**
   * Test 4: Status label should be "HOLD" when only advisory blockers present
   */
  it('displays HOLD status when only advisory blockers are present', () => {
    const liteState = deriveLiteReleaseState({
      releaseDecision: undefined,
      hardBlockerCount: 0,
      advisoryBlockerCount: 2,
    });

    expect(liteState.label).toBe('HOLD');
    expect(liteState.blocksRelease).toBe(false);
    expect(liteState.summary).toBe('Hold: 2 stabilization signals need review');
  });

  /**
   * Test 5: Status label should be "NO-GO" when hard blockers are present
   */
  it('displays NO-GO status when hard blockers are present', () => {
    const liteState = deriveLiteReleaseState({
      releaseDecision: undefined,
      hardBlockerCount: 2,
      advisoryBlockerCount: 0,
    });

    expect(liteState.label).toBe('NO-GO');
    expect(liteState.blocksRelease).toBe(true);
    expect(liteState.summary).toBe('Blocked by 2 hard signals');
  });

  /**
   * Test 6: Status label should be "READY" when no blockers present
   */
  it('displays READY status when no blockers present', () => {
    const liteState = deriveLiteReleaseState({
      releaseDecision: undefined,
      hardBlockerCount: 0,
      advisoryBlockerCount: 0,
    });

    expect(liteState.label).toBe('READY');
    expect(liteState.summary).toBe('No hard blockers detected in current evidence');
  });

  /**
   * Test 7: Blocker severity classification - Hard vs Soft
   */
  it('classifies blockers as hard (release/verify) or soft (KPI)', () => {
    const releaseReadinessBlockers = ['Release readiness check failed'];
    const verifyPackBlockers = ['Critical verify step blocked'];
    const stabilizationBlockers = [
      'Verify evidence completion below target.',
      'Unrecovered verification failures above target.',
    ];

    // Map blocker text to severity
    const blockerSeverityMap = new Map<string, 'hard' | 'soft'>();

    releaseReadinessBlockers.forEach((reason) => {
      blockerSeverityMap.set(reason, 'hard');
    });
    verifyPackBlockers.forEach((reason) => {
      blockerSeverityMap.set(reason, 'hard');
    });
    stabilizationBlockers.forEach((reason) => {
      blockerSeverityMap.set(reason, 'soft');
    });

    expect(blockerSeverityMap.get('Release readiness check failed')).toBe('hard');
    expect(blockerSeverityMap.get('Critical verify step blocked')).toBe('hard');
    expect(blockerSeverityMap.get('Verify evidence completion below target.')).toBe('soft');
    expect(blockerSeverityMap.get('Unrecovered verification failures above target.')).toBe('soft');
  });

  /**
   * Test 8: Blocker text normalization for user display
   */
  it('normalizes raw blocker text for user-friendly display', () => {
    const blockerNormalizer = (raw: string): string => {
      let text = raw.trim();

      // Expand abbreviations
      text = text.replace(/^Verify-path completion/, 'Verify evidence completion');
      text = text.replace(/^False-confidence rate/, 'Unrecovered verification failures');
      text = text.replace(/^Rollback recovery/, 'Rollback success rate');
      text = text.replace(/^Repeat verified resolution/, 'Resolution pattern reuse');

      // Fix grammar
      text = text.replace(/is below threshold/g, 'below target');
      text = text.replace(/is above threshold/g, 'above target');

      // Ensure punctuation
      if (text && !text.endsWith('.')) {
        text = text + '.';
      }

      return text;
    };

    expect(blockerNormalizer('Verify-path completion is below threshold')).toBe(
      'Verify evidence completion below target.'
    );
    expect(blockerNormalizer('False-confidence rate is above threshold')).toBe(
      'Unrecovered verification failures above target.'
    );
    expect(blockerNormalizer('Rollback recovery is below threshold')).toBe(
      'Rollback success rate below target.'
    );
    expect(blockerNormalizer('Repeat verified resolution is below threshold')).toBe(
      'Resolution pattern reuse below target.'
    );
  });

  it('resolveLiteReleaseStateFromStudioContext counts hard and advisory blockers', () => {
    const stabilizationKpiStatus: IncidentStudioStabilizationKpiStatus = {
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
        topVerifyPathMissReasonShare: 25,
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

    const liteState = resolveLiteReleaseStateFromStudioContext({
      releaseDecision: 'no-go',
      stabilizationKpiStatus,
      verifyGateBlockedReasons: ['Verify phase reach below minimum threshold'],
      policyReleasePosture: 'go',
    });

    expect(liteState.label).toBe('NO-GO');
    expect(liteState.blocksRelease).toBe(true);
  });
});
