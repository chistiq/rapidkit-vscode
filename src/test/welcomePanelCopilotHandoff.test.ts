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

    expect(buildEvidenceCardStudioPromptEnriched).toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith(
      'workspai.openIncidentStudio',
      expect.objectContaining({
        initialQuery: 'studio prompt',
        trigger: 'dashboard-evidence-studio-handoff',
      })
    );
  });
});
