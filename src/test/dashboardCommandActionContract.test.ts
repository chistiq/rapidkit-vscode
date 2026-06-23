import { describe, expect, it } from 'vitest';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';

describe('dashboard command action contract', () => {
  it('resolves workspace command scope and expected artifact from affected evidence', () => {
    const evidence: DashboardEvidencePayload = {
      cards: [
        {
          id: 'workspaceModel',
          label: 'Workspace Model',
          status: 'warn',
          summary: '2 projects · validation warning',
          scope: 'workspace',
          artifactPath: '/tmp/.rapidkit/reports/workspace-model.json',
        },
      ],
      activity: [],
    };

    const contract = buildDashboardCommandActionContract('workspaceModel', { evidence });

    expect(contract.command).toBe('workspaceModel');
    expect(contract.commandLabel).toBe('Workspace Model');
    expect(contract.executionScope).toBe('Workspace scope');
    expect(contract.artifactLabel).toBe('workspace-model.json');
    expect(contract.artifactState).toBe('ready');
    expect(contract.studioLabel).toBe('Studio: workspace scope');
    expect(contract.copilotLabel).toBe('Copilot: workspace scope evidence pack');
  });

  it('keeps disabled commands explicit when no artifact exists yet', () => {
    const contract = buildDashboardCommandActionContract('projectBrowser', {
      disabledReason: 'Start dev first',
    });

    expect(contract.commandLabel).toBe('Project Browser');
    expect(contract.executionScope).toBe('Project scope');
    expect(contract.artifactLabel).toBe('Artifact pending');
    expect(contract.artifactState).toBe('pending');
    expect(contract.disabledReason).toBe('Start dev first');
  });
});
