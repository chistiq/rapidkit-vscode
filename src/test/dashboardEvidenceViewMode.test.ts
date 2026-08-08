import { describe, expect, it } from 'vitest';

import type { DashboardEvidencePayload } from '../../webview-ui/src/lib/dashboardEvidence';
import {
  buildEvidenceGuidedSteps,
  filterEvidenceCardsForViewMode,
  groupEvidenceCardsForViewMode,
  healthStepCardNeedsAction,
  isEvidenceCardVisibleForViewMode,
  isEmptyWorkspaceRegistryWarn,
  normalizeEvidenceViewMode,
  pickGuidedStepPrimaryCard,
} from '../../webview-ui/src/lib/dashboardEvidenceViewMode';

function card(
  id: DashboardEvidencePayload['cards'][number]['id'],
  status: DashboardEvidencePayload['cards'][number]['status'] = 'missing',
  metrics?: Record<string, number | string>
) {
  return {
    id,
    label: id,
    status,
    summary: `${id} summary`,
    scope: 'workspace' as const,
    metrics,
  };
}

describe('dashboardEvidenceViewMode', () => {
  it('normalizes unknown view modes to guided default', () => {
    expect(normalizeEvidenceViewMode(undefined)).toBe('guided');
    expect(normalizeEvidenceViewMode('expert')).toBe('guided');
    expect(normalizeEvidenceViewMode('expanded')).toBe('expanded');
  });

  it('filters cards by minimum view tier', () => {
    expect(isEvidenceCardVisibleForViewMode('doctor', 'guided')).toBe(true);
    expect(isEvidenceCardVisibleForViewMode('mirror', 'guided')).toBe(false);
    expect(isEvidenceCardVisibleForViewMode('mirror', 'balanced')).toBe(true);
    expect(isEvidenceCardVisibleForViewMode('mirror', 'expanded')).toBe(true);
  });

  it('groups balanced cards into workflow sections', () => {
    const payload: DashboardEvidencePayload = {
      cards: [card('doctor', 'pass'), card('mirror', 'warn'), card('analyze', 'missing')],
      activity: [],
      onboarding: { isFreshInstall: false, recentWorkspaceCount: 1, hasActiveWorkspace: true },
    };

    const filtered = filterEvidenceCardsForViewMode(payload.cards, 'balanced');
    expect(filtered.map((entry) => entry.id).sort()).toEqual(['analyze', 'doctor', 'mirror']);

    const grouped = groupEvidenceCardsForViewMode(payload.cards, 'balanced');
    expect(grouped.map((entry) => entry.group.id)).toEqual(['health', 'release', 'governance']);
  });

  it('builds guided steps with health first when doctor is missing', () => {
    const steps = buildEvidenceGuidedSteps({
      evidence: {
        cards: [card('doctor', 'missing'), card('workspaceModel', 'missing', { projectCount: 0 })],
        activity: [],
        onboarding: { isFreshInstall: false, recentWorkspaceCount: 1, hasActiveWorkspace: true },
      },
      hasProject: false,
    });

    expect(steps[0]?.id).toBe('health');
    expect(steps[0]?.state).toBe('current');
    expect(steps[1]?.id).toBe('project');
    expect(steps[1]?.state).toBe('locked');
  });

  it('uses workspace model project count for project step', () => {
    const steps = buildEvidenceGuidedSteps({
      evidence: {
        cards: [card('doctor', 'pass'), card('workspaceModel', 'pass', { projectCount: 0 })],
        activity: [],
        onboarding: { isFreshInstall: false, recentWorkspaceCount: 1, hasActiveWorkspace: true },
      },
      hasProject: false,
    });

    const project = steps.find((step) => step.id === 'project');
    expect(project?.state).not.toBe('complete');
  });

  it('keeps health step current when bootstrap compliance is pending after create', () => {
    const steps = buildEvidenceGuidedSteps({
      evidence: {
        cards: [
          card('bootstrap', 'missing', { pendingBootstrap: 1, profile: 'polyglot' }),
          card('setup', 'pass'),
          card('doctor', 'missing'),
          card('workspaceSync', 'warn'),
        ],
        activity: [],
        onboarding: { isFreshInstall: false, recentWorkspaceCount: 1, hasActiveWorkspace: true },
      },
      hasProject: false,
    });

    expect(steps[0]?.id).toBe('health');
    expect(steps[0]?.state).toBe('attention');
    expect(steps[1]?.state).toBe('locked');
  });

  it('unlocks release path after analyze and readiness are green', () => {
    const steps = buildEvidenceGuidedSteps({
      evidence: {
        cards: [
          card('doctor', 'pass'),
          card('bootstrap', 'pass'),
          card('setup', 'pass'),
          card('workspaceModel', 'pass', { projectCount: 1 }),
          card('analyze', 'pass'),
          card('readiness', 'pass'),
          card('workspaceVerify', 'missing'),
          card('autopilot', 'missing'),
        ],
        activity: [],
        onboarding: { isFreshInstall: false, recentWorkspaceCount: 1, hasActiveWorkspace: true },
      },
      hasProject: true,
    });

    const verify = steps.find((step) => step.id === 'verify');
    const release = steps.find((step) => step.id === 'release');
    expect(verify?.state).toBe('current');
    expect(release?.state).toBe('locked');
  });

  it('prioritizes bootstrap pending over empty-workspace sync warn for health step CTA', () => {
    const cards = [
      card('bootstrap', 'missing', { pendingBootstrap: 1, profile: 'polyglot' }),
      card('setup', 'pass'),
      card('doctor', 'missing'),
      {
        ...card('workspaceSync', 'warn', { projectCount: 0, projects: 0 }),
        label: 'Workspace Sync',
        summary: 'No projects registered yet',
      },
    ];

    const primary = pickGuidedStepPrimaryCard('health', cards);
    expect(primary?.id).toBe('bootstrap');
    expect(healthStepCardNeedsAction(cards[3])).toBe(false);
    expect(isEmptyWorkspaceRegistryWarn(cards[3])).toBe(true);
  });

  it('surfaces workspace sync when registry summary is actually missing', () => {
    const cards = [
      card('bootstrap', 'pass'),
      card('setup', 'pass'),
      card('doctor', 'pass'),
      {
        ...card('workspaceSync', 'warn'),
        blockers: ['Missing .rapidkit/reports/workspace-registry-summary.json'],
      },
    ];

    const primary = pickGuidedStepPrimaryCard('health', cards);
    expect(primary?.id).toBe('workspaceSync');
  });

  it('keeps a non-blocking failed Doctor card in the attention state', () => {
    const steps = buildEvidenceGuidedSteps({
      evidence: {
        cards: [
          { ...card('doctor', 'fail'), blocking: false, blockers: ['Diagnostic command failed'] },
          card('bootstrap', 'pass'),
          card('setup', 'pass'),
          card('workspaceModel', 'pass', { projectCount: 1 }),
        ],
        activity: [],
        onboarding: { isFreshInstall: false, recentWorkspaceCount: 1, hasActiveWorkspace: true },
      },
      hasProject: true,
    });

    expect(steps[0]).toMatchObject({ id: 'health', state: 'attention' });
  });
});
