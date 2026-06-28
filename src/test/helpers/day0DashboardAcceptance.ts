import { expect } from 'vitest';

import type { DashboardEvidenceBundle } from '../../core/dashboardEvidenceBridge';
import type { DashboardEvidencePayload } from '../../../webview-ui/src/lib/dashboardEvidence';
import { buildDashboardEvidenceBrief } from '../../../webview-ui/src/lib/dashboardEvidenceBrief';
import { resolveEvidenceCardCommandAction } from '../../../webview-ui/src/lib/dashboardEvidenceActions';
import { buildEvidenceGuidedSteps } from '../../../webview-ui/src/lib/dashboardEvidenceViewMode';
import {
  cardCountsAsReleaseBlocker,
  countReleaseBlockingCards,
  resolveWorkspaceProjectCountFromEvidence,
} from '../../../webview-ui/src/lib/dashboardScaffoldEvidence';
import { findWorkspaceGraphSection } from '../../../webview-ui/src/lib/workspaceModelGraphVisual';

export const DAY0_DASHBOARD_E2E_STEP_IDS = [
  'workspaceSync',
  'foundationEnsure',
  'doctorWorkspace',
  'workspaceBootstrap',
  'workspaceModel',
] as const;

export function bundleToEvidencePayload(bundle: DashboardEvidenceBundle): DashboardEvidencePayload {
  return {
    workspacePath: bundle.workspacePath,
    projectPath: bundle.projectPath,
    projectName: bundle.projectName,
    cards: bundle.cards,
    activity: [],
    onboarding: {
      isFreshInstall: false,
      recentWorkspaceCount: 1,
      hasActiveWorkspace: true,
    },
    trend: bundle.trend ?? null,
  };
}

export function assertDay0DashboardAcceptance(bundle: DashboardEvidenceBundle): void {
  const evidence = bundleToEvidencePayload(bundle);
  const workspaceProjectCount = resolveWorkspaceProjectCountFromEvidence(evidence);
  const brief = buildDashboardEvidenceBrief({
    evidence,
    hasWorkspace: true,
    hasProject: false,
  });

  expect(brief.posture, 'empty day-0 workspace should not show release-blocked posture').not.toBe(
    'blocked'
  );
  expect(brief.label, 'empty day-0 workspace brief label').toBe('Scaffold ready');
  expect(
    countReleaseBlockingCards(evidence.cards, workspaceProjectCount),
    'release-blocking card count'
  ).toBe(0);

  const releaseBlockers = evidence.cards.filter((card) =>
    cardCountsAsReleaseBlocker(card, workspaceProjectCount)
  );
  expect(releaseBlockers, 'release blockers on empty scaffold').toEqual([]);

  const guidedSteps = buildEvidenceGuidedSteps({ evidence, hasProject: false });
  const healthStep = guidedSteps.find((step) => step.id === 'health');
  expect(healthStep?.state, 'health step should be unlocked after day-0 commands').not.toBe(
    'locked'
  );
  const projectStep = guidedSteps.find((step) => step.id === 'project');
  expect(projectStep?.title).toBe('Add your first project');
  expect(projectStep?.state).toBe('attention');
  expect(projectStep?.command).toBe('importProject');

  const modelCard = evidence.cards.find((card) => card.id === 'workspaceModel');
  expect(modelCard, 'workspace model card').toBeTruthy();
  expect(modelCard?.detailSections?.some((section) => section.id === 'workspace-graph')).toBe(true);
  expect(findWorkspaceGraphSection(modelCard?.detailSections)).toEqual(
    expect.objectContaining({
      nodes: expect.any(Array),
      edges: expect.any(Array),
    })
  );

  const archiveCard = evidence.cards.find((card) => card.id === 'archive');
  const mirrorCard = evidence.cards.find((card) => card.id === 'mirror');
  expect(archiveCard, 'archive card').toBeTruthy();
  expect(mirrorCard, 'mirror card').toBeTruthy();
  expect(resolveEvidenceCardCommandAction(archiveCard!)?.command).toBe(
    archiveCard?.status === 'missing' ? 'exportWorkspace' : 'workspaceArchive'
  );
  expect(resolveEvidenceCardCommandAction(mirrorCard!)?.command).toBe('mirrorOps');
}
