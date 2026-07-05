import { describe, expect, it } from 'vitest';

import { buildDashboardEvidenceActionContract } from '../../webview-ui/src/lib/dashboardActionContract';
import {
  buildDashboardIncidentCopy,
  buildStudioIncidentCopy,
} from '../../webview-ui/src/lib/dashboardIncidentContract';
import type { DashboardEvidenceCard } from '../../webview-ui/src/lib/dashboardEvidence';
import type { StudioBlockerHandoffView } from '../../webview-ui/src/lib/studioBlockerHandoff';

describe('dashboardIncidentContract', () => {
  it('uses explicit incident summary as the shared dashboard copy model', () => {
    const card: DashboardEvidenceCard = {
      id: 'readiness',
      label: 'Release Readiness',
      status: 'fail',
      summary: 'Release blocked',
      scope: 'workspace',
      artifactPath: '/repo/.rapidkit/reports/release-readiness-last-run.json',
      blockers: ['dependency gate failed'],
      incidentSummary: {
        title: 'Release blocked',
        phase: 'verify',
        primaryAction: 'Run verify',
        verifyRequired: true,
        auditStatus: 'pending',
      },
    };
    const contract = buildDashboardEvidenceActionContract(card, {
      workspace: { path: '/repo', name: 'repo' },
    });

    expect(buildDashboardIncidentCopy({ card, contract })).toMatchObject({
      label: 'Incident',
      phaseLabel: 'Verify',
      primaryAction: 'Run verify',
      verifyLabel: 'Required',
      auditLabel: 'pending',
      artifactLabel: 'release-readiness-last-run.json',
      blockedReason: 'dependency gate failed',
    });
  });

  it('falls back to stable incident copy when a card has no incident summary', () => {
    const card: DashboardEvidenceCard = {
      id: 'analyze',
      label: 'Analyze',
      status: 'fail',
      summary: 'Analyze score is blocked',
      scope: 'workspace',
      blockers: ['score below policy'],
    };
    const contract = buildDashboardEvidenceActionContract(card, {
      workspace: { path: '/repo', name: 'repo' },
    });

    expect(buildDashboardIncidentCopy({ card, contract })).toMatchObject({
      phaseLabel: 'Fix',
      primaryAction: 'Fix by Workspai',
      verifyLabel: 'Required',
      auditLabel: 'pending',
      artifactLabel: 'Artifact pending',
      blockedReason: 'score below policy',
    });
  });

  it('uses the same action language for Studio handoffs', () => {
    const handoff: StudioBlockerHandoffView = {
      schemaVersion: 'studio-blocker-handoff.v1',
      cardId: 'pipeline',
      cardLabel: 'Governance Gate',
      cardStatus: 'fail',
      blockers: ['doctor workspace gate failed'],
      artifactPath: '/repo/.rapidkit/reports/pipeline-last-run.json',
      sourceCommand: 'workspacePipeline',
      scope: 'workspace',
      blockerSignature: 'sig',
      studioMode: 'FIX',
      verifyCommand: 'workspaceVerify',
      incidentSummary: {
        title: 'Governance blocked',
        phase: 'fix',
        primaryAction: 'Fix by Workspai',
        verifyRequired: true,
        auditStatus: 'not-started',
      },
    };

    expect(buildStudioIncidentCopy({ handoff })).toMatchObject({
      label: 'Incident',
      phaseLabel: 'Fix',
      primaryAction: 'Fix by Workspai',
      verifyLabel: 'Required',
      auditLabel: 'not started',
      artifactLabel: 'Artifact ready',
      blockedReason: 'doctor workspace gate failed',
    });
  });

  it('normalizes host incident wording into dashboard action labels', () => {
    const card: DashboardEvidenceCard = {
      id: 'readiness',
      label: 'Release Readiness',
      status: 'fail',
      summary: 'Release blocked',
      scope: 'workspace',
      blockers: ['policy gate failed'],
      incidentSummary: {
        title: 'Release blocked',
        phase: 'fix',
        primaryAction: 'Fix source issue',
        verifyRequired: true,
        auditStatus: 'not-started',
      },
    };
    const contract = buildDashboardEvidenceActionContract(card);

    expect(buildDashboardIncidentCopy({ card, contract })).toMatchObject({
      phaseLabel: 'Fix',
      primaryAction: 'Fix by Workspai',
      verifyLabel: 'Required',
    });

    expect(
      buildStudioIncidentCopy({
        handoff: {
          schemaVersion: 'studio-blocker-handoff.v1',
          cardId: 'readiness',
          cardLabel: 'Release Readiness',
          cardStatus: 'warn',
          blockers: ['impact needs diagnosis'],
          artifactPath: '',
          sourceCommand: 'workspaceReadiness',
          scope: 'workspace',
          blockerSignature: 'sig',
          studioMode: 'EXPLAIN',
          incidentSummary: {
            title: 'Impact needs diagnosis',
            phase: 'diagnose',
            primaryAction: 'Explain blockers',
            verifyRequired: false,
            auditStatus: 'not-started',
          },
        },
      })
    ).toMatchObject({
      phaseLabel: 'Diagnose',
      primaryAction: 'Explain blocker',
    });
  });
});
