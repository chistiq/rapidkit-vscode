import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeCommand = vi.fn();
const showWarningMessage = vi.fn();

vi.mock('vscode', () => ({
  window: { showWarningMessage },
  commands: { executeCommand },
}));

vi.mock('../core/sendToCopilot.js', () => ({
  sendEvidenceToCopilot: vi.fn(),
  sendWorkspaceIntelligenceToCopilot: vi.fn(),
}));

vi.mock('../core/workspaceEvidenceFreshnessGate.js', () => ({
  ensureFreshEvidenceForAIAction: vi.fn(async () => 'proceed'),
}));

vi.mock('../core/evidenceCardAgentPrompt.js', () => ({
  buildEvidenceCardStudioPromptEnriched: vi.fn(async () => 'studio prompt'),
}));

vi.mock('../core/studioBlockerHandoffBuilder.js', () => ({
  buildStudioBlockerHandoff: vi.fn(async () => ({
    schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
    cardId: 'doctor',
    cardStatus: 'fail',
    blockers: ['doctor blocked'],
    artifactPath: '.rapidkit/reports/doctor-last-run.json',
    sourceCommand: 'npx rapidkit doctor --json',
    scope: 'workspace',
    blockerSignature: 'abc123456789abcd',
    studioMode: 'FIX',
    incidentSummary: {
      title: 'Doctor',
      phase: 'fix',
      primaryAction: 'Fix source issue',
      verifyRequired: true,
      auditStatus: 'not-started',
    },
  })),
}));

describe('welcomePanelCopilotHandoff', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    showWarningMessage.mockReset();
  });

  it('warns when send-to-copilot lacks a workspace', async () => {
    const { handleWelcomePanelSendWorkspaceToCopilot } =
      await import('../ui/panels/welcomePanelCopilotHandoff.js');

    await handleWelcomePanelSendWorkspaceToCopilot(
      {},
      {
        resolveWorkspacePath: () => undefined,
        resolveWorkspaceName: () => undefined,
      }
    );

    expect(showWarningMessage).toHaveBeenCalled();
  });

  it('opens Studio with enriched prompt for evidence cards', async () => {
    const { buildEvidenceCardStudioPromptEnriched } =
      await import('../core/evidenceCardAgentPrompt.js');
    const { buildStudioBlockerHandoff } = await import('../core/studioBlockerHandoffBuilder.js');
    const { handleWelcomePanelAskStudioAboutEvidence } =
      await import('../ui/panels/welcomePanelCopilotHandoff.js');

    await handleWelcomePanelAskStudioAboutEvidence(
      {
        workspacePath: '/tmp/ws',
        card: { id: 'doctor', label: 'Doctor', status: 'fail', summary: 'x', scope: 'workspace' },
      },
      {
        resolveWorkspacePath: () => '/tmp/ws',
        resolveWorkspaceName: () => 'demo',
      }
    );

    expect(buildEvidenceCardStudioPromptEnriched).toHaveBeenCalledWith(
      expect.objectContaining({
        blockerHandoff: expect.objectContaining({
          cardId: 'doctor',
          incidentSummary: expect.objectContaining({ primaryAction: 'Fix source issue' }),
        }),
      })
    );
    expect(buildStudioBlockerHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ handoffSource: 'dashboard' })
    );
    expect(executeCommand).toHaveBeenCalledWith(
      'workspai.openIncidentStudio',
      expect.objectContaining({
        initialQuery: 'studio prompt',
        trigger: 'dashboard-evidence-studio-handoff',
        blockerHandoff: expect.objectContaining({ cardId: 'doctor', studioMode: 'FIX' }),
      })
    );
  });

  it('maps repair and artifacts sources into typed handoffSource', async () => {
    const { buildStudioBlockerHandoff } = await import('../core/studioBlockerHandoffBuilder.js');
    const { handleWelcomePanelAskStudioAboutEvidence } =
      await import('../ui/panels/welcomePanelCopilotHandoff.js');

    await handleWelcomePanelAskStudioAboutEvidence(
      {
        workspacePath: '/tmp/ws',
        source: 'repair',
        card: { id: 'doctor', label: 'Doctor', status: 'fail', summary: 'x', scope: 'workspace' },
      },
      {
        resolveWorkspacePath: () => '/tmp/ws',
        resolveWorkspaceName: () => 'demo',
      }
    );

    expect(buildStudioBlockerHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ handoffSource: 'repair' })
    );
  });
});
