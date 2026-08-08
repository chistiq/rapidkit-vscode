import { describe, expect, it } from 'vitest';

import type { DashboardEvidenceCard } from '../../webview-ui/src/lib/dashboardEvidence';
import {
  evidenceCardStatusLabel,
  evidenceStatusLabel,
} from '../../webview-ui/src/lib/dashboardEvidence';
import {
  cardCountsAsReleaseBlocker,
  evidenceCardStatusLabelForWorkspace,
  evidenceCardVisualTone,
  filterEmptyWorkspaceScaffoldBlockers,
} from '../../webview-ui/src/lib/dashboardScaffoldEvidence';

const warnCard: DashboardEvidenceCard = {
  id: 'workspaceVerify',
  label: 'Workspace Verify',
  status: 'warn',
  summary: 'scaffold needs attention',
  scope: 'workspace',
  blockers: ['workspace.doctor: Doctor evidence is stale'],
};

describe('dashboardScaffoldEvidence', () => {
  it('uses enterprise status language for raw evidence statuses', () => {
    expect(evidenceStatusLabel('pass')).toBe('Passed');
    expect(evidenceStatusLabel('warn')).toBe('Attention');
    expect(evidenceStatusLabel('fail')).toBe('Blocked');
    expect(evidenceStatusLabel('missing')).toBe('Missing');
    expect(
      evidenceCardStatusLabel({
        id: 'workspaceVerify',
        label: 'Workspace Verify',
        status: 'fail',
        summary: 'corrupt',
        scope: 'workspace',
        metrics: { corruptArtifact: 1 },
      })
    ).toBe('Corrupt');
  });

  it('filters scaffold blockers for empty workspaces', () => {
    expect(filterEmptyWorkspaceScaffoldBlockers(warnCard.blockers ?? [])).toEqual([]);
    expect(cardCountsAsReleaseBlocker(warnCard, 0)).toBe(false);
    expect(evidenceCardVisualTone(warnCard, 0)).toBe('warn');
    expect(evidenceCardStatusLabelForWorkspace(warnCard, 0)).toBe('Expected before first project');
    expect(evidenceCardStatusLabelForWorkspace(warnCard, 2)).toBe('Needs attention');
  });

  it('keeps stale-only evidence separate from release blockers for populated workspaces', () => {
    expect(cardCountsAsReleaseBlocker(warnCard, 2)).toBe(false);
    expect(evidenceCardVisualTone(warnCard, 2)).toBe('warn');
  });

  it('recognizes canonical Workspai stale reports as freshness-only evidence', () => {
    const canonicalStaleCard: DashboardEvidenceCard = {
      id: 'workspaceVerify',
      label: 'Workspace Verify',
      status: 'fail',
      summary: 'Refresh the model snapshot.',
      scope: 'workspace',
      blockers: ['Stale report: .workspai/reports/workspace-model-snapshot.json'],
    };

    expect(cardCountsAsReleaseBlocker(canonicalStaleCard, 2)).toBe(false);
  });

  it('keeps failed gates as real blockers for populated workspaces', () => {
    const dependencyCard: DashboardEvidenceCard = {
      id: 'readiness',
      label: 'Release Readiness',
      status: 'fail',
      summary: 'Release blocked',
      scope: 'workspace',
      blockers: ['dependency: 2 dependency vulnerability(ies) reported'],
    };

    expect(cardCountsAsReleaseBlocker(dependencyCard, 2)).toBe(true);
    expect(evidenceCardVisualTone(dependencyCard, 2)).toBe('danger');
  });

  it('uses explicit blocking posture for guarded warning gates', () => {
    const guardedCard: DashboardEvidenceCard = {
      id: 'readiness',
      label: 'Release Readiness',
      status: 'warn',
      summary: 'Approval is required before release.',
      scope: 'workspace',
      blockers: ['Production approval is required'],
      blocking: true,
    };

    expect(cardCountsAsReleaseBlocker(guardedCard, 2)).toBe(true);
    expect(evidenceCardVisualTone(guardedCard, 2)).toBe('danger');
    expect(evidenceCardStatusLabelForWorkspace(guardedCard, 2)).toBe('Blocked');
  });

  it('does not promote advisory blocker text into release-blocking posture', () => {
    const advisoryCard: DashboardEvidenceCard = {
      id: 'workspaceImpact',
      label: 'Workspace Impact',
      status: 'warn',
      summary: 'Review the verification plan.',
      scope: 'workspace',
      blockers: ['Use the verification plan before release actions.'],
      blocking: false,
    };

    expect(cardCountsAsReleaseBlocker(advisoryCard, 2)).toBe(false);
    expect(evidenceCardVisualTone(advisoryCard, 2)).toBe('warn');
    expect(evidenceCardStatusLabelForWorkspace(advisoryCard, 2)).toBe('Needs attention');
  });

  it('does not treat scaffold-only fail cards as release blockers for empty workspaces', () => {
    const failCard: DashboardEvidenceCard = {
      id: 'analyze',
      label: 'Analyze',
      status: 'fail',
      summary: 'Analyze needs attention before release.',
      scope: 'workspace',
      blockers: ['analyze-last-run: not yet run'],
    };
    expect(cardCountsAsReleaseBlocker(failCard, 0)).toBe(false);
    expect(cardCountsAsReleaseBlocker(failCard, 2)).toBe(true);
  });

  it('filters pre-project model and infra warnings for empty workspaces', () => {
    const modelCard: DashboardEvidenceCard = {
      id: 'workspaceModel',
      label: 'Workspace Model',
      status: 'warn',
      summary: '0 project(s) · validation warning',
      scope: 'workspace',
      blockers: ['2 workspace model validation warning(s)'],
    };
    const infraCard: DashboardEvidenceCard = {
      id: 'infra',
      label: 'Infra',
      status: 'warn',
      summary: 'Infra plan has no services',
      scope: 'workspace',
      blockers: [
        'No infrastructure services detected. Install modules with infra dependencies or add .rapidkit/infra/overrides.json',
      ],
    };
    expect(cardCountsAsReleaseBlocker(modelCard, 0)).toBe(false);
    expect(cardCountsAsReleaseBlocker(infraCard, 0)).toBe(false);
  });

  it('filters contract verify prompts for empty workspaces', () => {
    const contractCard: DashboardEvidenceCard = {
      id: 'contract',
      label: 'Contract',
      status: 'warn',
      summary: '0 project(s) in manifest; run workspace contract verify for gate evidence.',
      scope: 'workspace',
      blockers: ['Run workspace contract verify to publish verify evidence.'],
    };
    expect(cardCountsAsReleaseBlocker(contractCard, 0)).toBe(false);
    expect(cardCountsAsReleaseBlocker(contractCard, 2)).toBe(false);
  });
});
