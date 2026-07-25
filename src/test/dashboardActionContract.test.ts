import { describe, expect, it } from 'vitest';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards';
import type { DashboardEvidenceCard } from '@/lib/dashboardEvidence';

describe('dashboard action contract', () => {
  it('describes command, artifact, Studio, and Copilot handoff for actionable cards', () => {
    const card: DashboardEvidenceCard = {
      id: 'doctor',
      label: 'Workspace Doctor',
      status: 'warn',
      summary: '1 warning',
      scope: 'workspace',
      artifactPath: '/tmp/ws/.rapidkit/reports/doctor-last-run.json',
    };

    const contract = buildDashboardEvidenceActionContract(card, {
      workspace: { path: '/tmp/ws', name: 'ws' },
    });

    expect(contract.cardId).toBe('doctor');
    expect(contract.cardScope).toBe('workspace');
    expect(contract.commandState).toBe('ready');
    expect(contract.commandAction?.command).toBe('checkWorkspaceHealth');
    expect(contract.commandLabel).toBe('Workspace Doctor');
    expect(contract.artifactState).toBe('ready');
    expect(contract.artifactLabel).toBe('doctor-last-run.json');
    expect(contract.studioLabel).toBe('Studio: doctor');
    expect(contract.copilotLabel).toBe('Copilot: workspace evidence pack');
    expect(contract.studioPayload).toMatchObject({
      workspacePath: '/tmp/ws',
      workspaceName: 'ws',
      card: {
        id: 'doctor',
        label: 'Workspace Doctor',
        scope: 'workspace',
        artifactPath: '/tmp/ws/.rapidkit/reports/doctor-last-run.json',
      },
      actionContext: {
        source: 'dashboard-evidence',
        cardId: 'doctor',
        cardScope: 'workspace',
        command: 'checkWorkspaceHealth',
        commandLabel: 'Workspace Doctor',
        commandScope: 'workspace',
        artifactPath: '/tmp/ws/.rapidkit/reports/doctor-last-run.json',
        artifactState: 'ready',
        studioTarget: {
          target: 'doctor',
          cardId: 'doctor',
          scope: 'workspace',
        },
      },
    });
    expect(contract.studioPayload).toEqual(contract.copilotPayload);
    expect(contract.copilotPayload).not.toHaveProperty('projectPath');
  });

  it('keeps project-scoped handoffs explicit without leaking project scope into workspace cards', () => {
    const projectCard: DashboardEvidenceCard = {
      id: 'projectDoctor',
      label: 'Project Doctor',
      status: 'fail',
      summary: 'Project doctor failed',
      scope: 'project',
      artifactPath: '/tmp/ws/app/.rapidkit/reports/doctor-last-run.json',
    };
    const workspaceCard: DashboardEvidenceCard = {
      id: 'workspaceImpact',
      label: 'Workspace Impact',
      status: 'warn',
      summary: 'Risk high',
      scope: 'workspace',
    };

    const projectContract = buildDashboardEvidenceActionContract(projectCard, {
      workspace: { path: '/tmp/ws', name: 'ws' },
      project: { path: '/tmp/ws/app', name: 'app' },
    });
    const workspaceContract = buildDashboardEvidenceActionContract(workspaceCard, {
      workspace: { path: '/tmp/ws', name: 'ws' },
      project: { path: '/tmp/ws/app', name: 'app' },
    });

    expect(projectContract.copilotPayload).toMatchObject({
      workspacePath: '/tmp/ws',
      projectPath: '/tmp/ws/app',
      projectName: 'app',
      actionContext: {
        cardScope: 'project',
        command: 'projectDoctor',
        commandScope: 'project',
      },
    });
    expect(workspaceContract.copilotPayload).toMatchObject({
      workspacePath: '/tmp/ws',
      actionContext: {
        cardScope: 'workspace',
        command: 'workspaceImpact',
        commandScope: 'workspace',
      },
    });
    expect(workspaceContract.copilotPayload).not.toHaveProperty('projectPath');
    expect(workspaceContract.copilotPayload).not.toHaveProperty('projectName');
  });

  it('explains pending command and artifact state for unmapped cards', () => {
    const card: DashboardEvidenceCard = {
      id: 'unknown-card' as DashboardEvidenceCard['id'],
      label: 'Custom Check',
      status: 'missing',
      summary: 'No command mapped',
      scope: 'project',
    };

    const contract = buildDashboardEvidenceActionContract(card);

    expect(contract.commandState).toBe('pending');
    expect(contract.commandLabel).toBe('No deterministic command');
    expect(contract.disabledReason).toContain('No deterministic command');
    expect(contract.artifactState).toBe('pending');
    expect(contract.artifactLabel).toBe('Artifact pending');
    expect(contract.copilotLabel).toBe('Copilot: project evidence pack');
    expect(contract.copilotPayload.actionContext.artifactState).toBe('pending');
  });

  it('turns corrupt artifact cards into same-card repair actions', () => {
    const card: DashboardEvidenceCard = {
      id: 'workspaceVerify',
      label: 'Workspace Verify',
      status: 'fail',
      summary: 'Artifact is unreadable or corrupt.',
      scope: 'workspace',
      artifactPath: '/tmp/ws/.rapidkit/reports/workspace-verify-last-run.json',
      metrics: { corruptArtifact: 1 },
      blockers: ['Corrupt artifact: workspace-verify-last-run.json'],
    };

    const contract = buildDashboardEvidenceActionContract(card, {
      workspace: { path: '/tmp/ws', name: 'ws' },
    });

    expect(contract.commandState).toBe('ready');
    expect(contract.commandLabel).toBe('Repair evidence');
    expect(contract.commandAction).toMatchObject({
      command: 'workspaceVerify',
      label: 'Repair evidence',
      commandData: {
        source: 'evidence',
        evidenceDirectRun: true,
        repairReason: 'corrupt-artifact',
        repairArtifactPath: '/tmp/ws/.rapidkit/reports/workspace-verify-last-run.json',
        path: '/tmp/ws',
      },
    });
    expect(contract.artifactState).toBe('corrupt');
    expect(contract.artifactLabel).toBe('Corrupt artifact: workspace-verify-last-run.json');
    expect(contract.primaryAction).toEqual({ type: 'run', label: 'Re-run command' });
    expect(contract.copilotPayload.actionContext.artifactState).toBe('corrupt');
  });

  it('selects one primary CTA per card phase and keeps secondary work out of the contract primary', () => {
    const missingCard: DashboardEvidenceCard = {
      id: 'doctor',
      label: 'Workspace Doctor',
      status: 'missing',
      summary: 'No doctor evidence yet',
      scope: 'workspace',
    };
    const failedCard: DashboardEvidenceCard = {
      id: 'readiness',
      label: 'Release Readiness',
      status: 'fail',
      summary: 'Release blocked',
      scope: 'workspace',
      blockers: ['analyze blocked'],
    };
    const warningCard: DashboardEvidenceCard = {
      id: 'workspaceImpact',
      label: 'Workspace Impact',
      status: 'warn',
      summary: 'Risk high',
      scope: 'workspace',
    };
    const passingCard: DashboardEvidenceCard = {
      id: 'workspaceVerify',
      label: 'Workspace Verify',
      status: 'pass',
      summary: 'Ready',
      scope: 'workspace',
    };

    expect(buildDashboardEvidenceActionContract(missingCard).primaryAction).toMatchObject({
      type: 'run',
    });
    expect(buildDashboardEvidenceActionContract(failedCard).primaryAction).toEqual({
      type: 'studio',
      label: 'Fix by Workspai',
    });
    expect(buildDashboardEvidenceActionContract(warningCard).primaryAction).toEqual({
      type: 'studio',
      label: 'Open in Studio',
    });
    expect(buildDashboardEvidenceActionContract(passingCard).primaryAction).toEqual({
      type: 'done',
      label: 'Done',
    });
  });

  it('maps Studio execution-mode incident summaries to the Repair primary CTA', () => {
    const baseCard = {
      id: 'readiness',
      label: 'Release Readiness',
      status: 'fail',
      summary: 'Release blocked',
      scope: 'workspace',
      blockers: ['release gate blocked'],
    } satisfies DashboardEvidenceCard;

    expect(
      buildDashboardEvidenceActionContract({
        ...baseCard,
        status: 'missing',
        incidentSummary: {
          title: 'Missing evidence',
          phase: 'detect',
          primaryAction: 'Run source command once',
          verifyRequired: true,
          auditStatus: 'not-started',
        },
      }).primaryAction
    ).toEqual({ type: 'run', label: 'Generate artifact' });

    expect(
      buildDashboardEvidenceActionContract({
        ...baseCard,
        incidentSummary: {
          title: 'Blocked release',
          phase: 'fix',
          primaryAction: 'Fix source issue',
          verifyRequired: true,
          auditStatus: 'not-started',
        },
      }).primaryAction
    ).toEqual({ type: 'studio', label: 'Fix by Workspai' });

    expect(
      buildDashboardEvidenceActionContract({
        ...baseCard,
        id: 'workspaceVerify',
        label: 'Workspace Verify',
        incidentSummary: {
          title: 'Verify gate',
          phase: 'verify',
          primaryAction: 'Run verify',
          verifyRequired: true,
          auditStatus: 'not-started',
        },
      }).primaryAction
    ).toEqual({ type: 'run', label: 'Run verify' });

    expect(
      buildDashboardEvidenceActionContract({
        ...baseCard,
        status: 'warn',
        incidentSummary: {
          title: 'Needs diagnosis',
          phase: 'diagnose',
          primaryAction: 'Explain blockers',
          verifyRequired: false,
          auditStatus: 'not-started',
        },
      }).primaryAction
    ).toEqual({ type: 'studio', label: 'Explain blocker' });
  });

  it('labels derived artifacts so Workspace Why does not pretend to own Explain evidence', () => {
    const card: DashboardEvidenceCard = {
      id: 'workspaceWhy',
      label: 'Workspace Why',
      status: 'warn',
      summary: 'Derived from Workspace Explain',
      scope: 'workspace',
      artifactPath: '/tmp/ws/.rapidkit/reports/workspace-explain-last-run.json',
      metrics: { derivedArtifact: 1, derivedFrom: 'Workspace Explain' },
    };

    const contract = buildDashboardEvidenceActionContract(card, {
      workspace: { path: '/tmp/ws', name: 'ws' },
    });

    expect(contract.artifactState).toBe('ready');
    expect(contract.artifactLabel).toBe('Derived: workspace-explain-last-run.json');
    expect(contract.copilotPayload.card.metrics).toMatchObject({
      derivedArtifact: 1,
      derivedFrom: 'Workspace Explain',
    });
  });

  it('keeps every official evidence card wired to command, Studio, Copilot, and artifact state', () => {
    for (const cardId of DASHBOARD_EVIDENCE_CARD_IDS) {
      const card: DashboardEvidenceCard = {
        id: cardId,
        label: `Card ${cardId}`,
        status: 'warn',
        summary: `Synthetic summary for ${cardId}`,
        scope: cardId === 'projectDoctor' || cardId === 'importReadiness' ? 'project' : 'workspace',
        artifactPath: `/tmp/ws/.rapidkit/reports/${cardId}.json`,
      };

      const contract = buildDashboardEvidenceActionContract(card, {
        workspace: { path: '/tmp/ws', name: 'ws' },
        project: { path: '/tmp/ws/app', name: 'app' },
      });

      expect(contract.commandState, cardId).toBe('ready');
      expect(contract.commandAction?.command, cardId).toBeTruthy();
      expect(contract.commandAction?.label, cardId).toBeTruthy();
      expect(contract.executionChannel, cardId).toMatch(/^(terminal|background)$/);
      expect(contract.artifactState, cardId).toBe('ready');
      expect(contract.artifactLabel, cardId).toBe(`${cardId}.json`);
      expect(contract.studioTarget?.target, cardId).toBeTruthy();
      expect(contract.studioPayload.actionContext.studioTarget?.cardId, cardId).toBe(cardId);
      expect(contract.copilotPayload.actionContext.command, cardId).toBe(
        contract.commandAction?.command
      );
    }
  });
});
