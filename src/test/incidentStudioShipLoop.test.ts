import { describe, expect, it } from 'vitest';

import { resolveStudioMutationBlockReason } from '../../webview-ui/src/lib/incidentStudioMutationGate';
import {
  deriveEnterpriseShipLoopView,
  resolveShipLoopStepBlockReason,
} from '../../webview-ui/src/lib/incidentStudioShipLoop';
import {
  canDispatchShipLoopStep,
  resolveShipLoopDispatchBlockReason,
} from '../../webview-ui/src/lib/incidentStudioShipLoopGate';

describe('incidentStudioShipLoop', () => {
  it('derives missing analyze as the first ship loop step', () => {
    const view = deriveEnterpriseShipLoopView({});

    expect(view.nextStepId).toBe('analyze');
    expect(view.releaseReady).toBe(false);
    expect(view.steps.find((step) => step.id === 'archive')?.runnable).toBe(false);
  });

  it('marks release ready when analyze, verify, and readiness evidence are green enough', () => {
    const view = deriveEnterpriseShipLoopView({
      studioEvidence: { verdict: 'ready', generatedAt: '2026-06-10T12:00:00.000Z' },
      telemetry: {
        studioHardGateStatus: { gates: { overallPass: true } },
      },
      shipEvidence: {
        cards: [
          { id: 'analyze', status: 'pass', summary: 'Analyze ready' },
          { id: 'readiness', status: 'pass', summary: 'Readiness ready' },
        ],
      },
    });

    expect(view.releaseReady).toBe(true);
    expect(view.steps.find((step) => step.id === 'archive')?.runnable).toBe(true);
    expect(view.steps.find((step) => step.id === 'autopilot-release')?.runnable).toBe(true);
  });

  it('blocks verify step when policy verify reasons are present', () => {
    const view = deriveEnterpriseShipLoopView({
      studioEvidence: { verdict: 'ready', generatedAt: '2026-06-10T12:00:00.000Z' },
      shipEvidence: {
        cards: [{ id: 'analyze', status: 'pass', summary: 'Analyze ready' }],
      },
      verifyGateBlockedReasons: ['Release posture is pending.'],
    });

    const verifyStep = view.steps.find((step) => step.id === 'verify-gates');
    expect(verifyStep?.state).toBe('blocked');
    expect(verifyStep?.runnable).toBe(false);
    expect(view.nextStepId).toBe('verify-gates');
  });

  it('blocks mutating ship loop steps when stabilization is frozen', () => {
    const telemetry = {
      enterpriseStabilizationGateStatus: {
        expansionFrozen: true,
        freezeReason: 'Both stabilization windows must pass.',
      },
    };

    const loopView = deriveEnterpriseShipLoopView({
      studioEvidence: { verdict: 'ready', generatedAt: '2026-06-10T12:00:00.000Z' },
      telemetry,
      shipEvidence: {
        cards: [
          { id: 'analyze', status: 'pass' },
          { id: 'readiness', status: 'pass' },
        ],
      },
    });

    const mutationReason = resolveStudioMutationBlockReason(telemetry);
    expect(mutationReason).toContain('Both stabilization windows');

    expect(resolveShipLoopStepBlockReason('archive', loopView, mutationReason)).toContain(
      'Both stabilization windows'
    );

    expect(
      canDispatchShipLoopStep({
        stepId: 'archive',
        shipEvidence: {
          cards: [
            { id: 'analyze', status: 'pass' },
            { id: 'readiness', status: 'pass' },
          ],
        },
        studioEvidence: { verdict: 'ready', generatedAt: '2026-06-10T12:00:00.000Z' },
        telemetry,
      })
    ).toBe(false);

    expect(
      resolveShipLoopDispatchBlockReason({
        stepId: 'readiness',
        shipEvidence: { cards: [] },
      })
    ).toBeNull();
  });
});
