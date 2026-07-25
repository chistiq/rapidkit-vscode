import { describe, expect, it, vi } from 'vitest';

import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION } from '../contracts/studio-blocker-handoff-contract.js';
import {
  STUDIO_CARD_FIX_ROUTING,
  normalizeStudioHandoffSource,
  resolveStudioFixActionForHandoff,
  shouldUseEvidencePatchRepair,
} from '../core/studioBlockerFixRouting.js';
import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import { pickStudioFixActionId } from '../core/studioBlockerHandoffBuilder.js';
import { resolveBlockerResolutionClass } from '../core/studioBlockerResolution.js';

function baseHandoff(overrides: Partial<StudioBlockerHandoff> = {}): StudioBlockerHandoff {
  return {
    schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
    cardId: 'doctor',
    cardStatus: 'fail',
    blockers: ['doctor: missing evidence'],
    artifactPath: '.rapidkit/reports/doctor-last-run.json',
    sourceCommand: 'npx rapidkit doctor --json',
    scope: 'workspace',
    blockerSignature: 'abc123456789abcd',
    ...overrides,
  };
}

describe('studioBlockerFixRouting', () => {
  it('pins card-specific default fix actions', () => {
    expect(Object.keys(STUDIO_CARD_FIX_ROUTING).sort()).toEqual(
      [...DASHBOARD_EVIDENCE_CARD_IDS].sort()
    );
    expect(STUDIO_CARD_FIX_ROUTING.doctor).toBe('doctor-fix');
    expect(STUDIO_CARD_FIX_ROUTING.bootstrap).toBe('verify-gates');
    expect(STUDIO_CARD_FIX_ROUTING.workspaceVerify).toBe('verify-gates');
    expect(STUDIO_CARD_FIX_ROUTING.workspaceImpact).toBe('fix-lens');
    expect(STUDIO_CARD_FIX_ROUTING.workspaceRun).toBe('verify-gates');
    expect(STUDIO_CARD_FIX_ROUTING.snapshot).toBe('verify-gates');
    expect(STUDIO_CARD_FIX_ROUTING.mirror).toBe('verify-gates');
    expect(STUDIO_CARD_FIX_ROUTING.contract).toBe('verify-gates');
    expect(STUDIO_CARD_FIX_ROUTING.analyze).toBe('run-analyze');
  });

  it('routes workspaceImpact semantic blockers to fix-lens, never doctor-fix', () => {
    const handoff = baseHandoff({
      cardId: 'workspaceImpact',
      blockers: ['Workspace-level items: 1169.', 'Git untracked grounding files'],
      resolutionClass: 'semantic-attention',
      sourceCommand:
        'npx rapidkit workspace impact --from .rapidkit/reports/workspace-model-diff-last-run.json --json',
    });

    expect(resolveStudioFixActionForHandoff(handoff)).toBe('fix-lens');
    expect(pickStudioFixActionId(handoff)).toBe('fix-lens');
  });

  it('routes doctor cards to doctor-fix', () => {
    const handoff = baseHandoff({
      resolutionClass: 'command-failed-repeat',
      commandRunCount: 2,
    });
    expect(resolveStudioFixActionForHandoff(handoff)).toBe('doctor-fix');
  });

  it('routes contract cards to verify-gates for contract gate reruns', () => {
    const handoff = baseHandoff({
      cardId: 'contract',
      blockers: ['policy.contract.missing_field'],
      sourceCommand: 'npx rapidkit workspace contract verify --strict --json',
    });
    expect(resolveStudioFixActionForHandoff(handoff)).toBe('verify-gates');
  });

  it('does not mistake verification-only routing for a source fix', () => {
    const handoff = baseHandoff({
      cardId: 'agentGrounding',
      blockers: ['Blocked by readiness'],
      artifactPath: '.workspai/reports/agent-customization-pack.json',
      sourceCommand: 'npx workspai workspace agent-sync --write --json',
      studioMode: 'FIX',
    });

    const fixAction = resolveStudioFixActionForHandoff(handoff);
    expect(fixAction).toBe('verify-gates');
    expect(shouldUseEvidencePatchRepair(handoff, fixAction)).toBe(true);
  });

  it('hands repeated deterministic failures to the evidence-backed model', () => {
    for (const fixAction of ['doctor-fix', 'fix-lens'] as const) {
      expect(shouldUseEvidencePatchRepair(baseHandoff({ commandRunCount: 1 }), fixAction)).toBe(
        true
      );
    }
  });

  it('prefers CLI resolution hint studioActionId over card table', () => {
    const handoff = baseHandoff({
      cardId: 'doctor',
      resolutionHints: [
        {
          schemaVersion: 'rapidkit-blocker-resolution-v1',
          blockerId: 'blocker-1',
          resolutionClass: 'artifact-missing',
          blockerSignature: 'sig-1',
          fixHints: [{ actionKind: 'run-once', studioActionId: 'run-analyze' }],
        },
      ],
    });
    expect(resolveStudioFixActionForHandoff(handoff)).toBe('run-analyze');
  });

  it('normalizes dashboard section sources into handoffSource enum', () => {
    expect(normalizeStudioHandoffSource('repair')).toBe('repair');
    expect(normalizeStudioHandoffSource('artifacts')).toBe('artifacts');
    expect(normalizeStudioHandoffSource('evidence')).toBe('artifacts');
    expect(normalizeStudioHandoffSource('advisor')).toBe('advisor');
    expect(normalizeStudioHandoffSource('unknown')).toBe('dashboard');
  });
});

describe('studio sidebar fix loop E2E (simulated)', () => {
  it('blocked doctor card → FIX mode → doctor-fix → verify refresh → pass', async () => {
    const handoff = baseHandoff({
      resolutionClass: 'command-failed-repeat',
      commandRunCount: 1,
      studioMode: resolveBlockerResolutionClass({
        handoff: baseHandoff({
          resolutionClass: 'command-failed-repeat',
          commandRunCount: 1,
        }),
      }),
    });

    expect(handoff.studioMode).toBe('FIX');
    expect(pickStudioFixActionId(handoff)).toBe('doctor-fix');

    const { refreshDashboardAfterStudioVerify } =
      await import('../core/studioSidebarDashboardRefresh.js');
    const refreshDashboardCards = vi.fn(async () => undefined);
    const refresh = await refreshDashboardAfterStudioVerify({
      workspacePath: '/tmp/ws',
      handoff,
      verifyExitCode: 0,
      refreshDashboardCards,
    });

    expect(refreshDashboardCards).toHaveBeenCalledWith({
      workspacePath: '/tmp/ws',
      cardIds: ['doctor'],
    });
    expect(refresh.cardIds).toEqual(['doctor']);
  });

  it('artifact-missing stays RUN_ONCE and prefers run-analyze hint when present', () => {
    const handoff = baseHandoff({
      cardId: 'analyze',
      resolutionClass: 'artifact-missing',
      commandRunCount: 0,
      resolutionHints: [
        {
          schemaVersion: 'rapidkit-blocker-resolution-v1',
          blockerId: 'blocker-1',
          resolutionClass: 'artifact-missing',
          blockerSignature: 'sig-1',
          fixHints: [{ actionKind: 'run-once', studioActionId: 'run-analyze' }],
        },
      ],
      studioMode: resolveBlockerResolutionClass({
        handoff: baseHandoff({
          cardId: 'analyze',
          resolutionClass: 'artifact-missing',
          commandRunCount: 0,
        }),
      }),
    });

    expect(handoff.studioMode).toBe('RUN_ONCE');
    expect(pickStudioFixActionId(handoff)).toBe('run-analyze');
  });
});
