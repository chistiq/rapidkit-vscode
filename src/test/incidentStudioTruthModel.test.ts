import { describe, expect, it } from 'vitest';

import {
  classifyTelemetryBlockers,
  deriveStudioTruth,
  isArtifactReleaseReady,
} from '../../webview-ui/src/lib/incidentStudioTruthModel';
import { deriveEnterpriseShipLoopView } from '../../webview-ui/src/lib/incidentStudioShipLoop';

describe('incidentStudioTruthModel', () => {
  it('classifies studio learning blockers separately from release blockers', () => {
    const classified = classifyTelemetryBlockers([
      'Bridge route completion < minimum threshold',
      'Verify-path completion < minimum threshold',
      'Release posture is pending.',
    ]);

    expect(classified.studioLearning).toHaveLength(2);
    expect(classified.releaseBlocking).toEqual(['Release posture is pending.']);
  });

  it('treats approved artifacts as release-ready even when studio KPIs fail', () => {
    const shipEvidence = {
      cards: [
        { id: 'analyze' as const, status: 'pass' as const },
        { id: 'readiness' as const, status: 'pass' as const },
        { id: 'autopilot' as const, status: 'pass' as const },
      ],
    };

    expect(
      isArtifactReleaseReady({
        shipEvidence,
        studioEvidence: {
          verdict: 'ready',
          generatedAt: '2026-06-10T12:00:00.000Z',
          findings: { fail: 0, warn: 0, info: 0 },
        },
        verifyArtifactPassed: true,
      })
    ).toBe(true);

    const shipLoop = deriveEnterpriseShipLoopView({
      shipEvidence,
      studioEvidence: { verdict: 'ready', generatedAt: '2026-06-10T12:00:00.000Z' },
      verifyGateBlockedReasons: [
        'Bridge route completion < minimum threshold',
        'Verify-path completion < minimum threshold',
      ],
      verifyArtifactPassed: true,
    });

    expect(shipLoop.steps.find((step) => step.id === 'verify-gates')?.state).toBe('warn');
    expect(shipLoop.steps.find((step) => step.id === 'autopilot-release')?.state).toBe('pass');
    expect(shipLoop.releaseReady).toBe(true);

    const truth = deriveStudioTruth({
      releasePosture: 'go',
      policyGates: {
        flowState: 'warning',
        telemetryState: 'partial',
        releasePosture: 'go',
      },
      studioEvidence: {
        verdict: 'ready',
        generatedAt: '2026-06-10T12:00:00.000Z',
        findings: { fail: 0, warn: 0, info: 0 },
      },
      shipLoop,
      shipEvidence,
      verifyGateBlockedReasons: [
        'Bridge route completion < minimum threshold',
        'Verify-path completion < minimum threshold',
      ],
      studioActionStatus: {
        actionId: 'verify-gates',
        actionTitle: 'Verify Gates',
        status: 'failed',
        updatedAt: '2026-06-10T12:00:00.000Z',
      },
      verifyArtifactPassed: true,
    });

    expect(truth.headline.label).toBe('Ready');
    expect(truth.suppressStaleVerifyFailure).toBe(true);
    expect(truth.studioLearningReasons.length).toBeGreaterThan(0);
  });
});
