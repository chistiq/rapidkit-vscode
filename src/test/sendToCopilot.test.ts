import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeCommand = vi.fn();
const clipboardWriteText = vi.fn();

vi.mock('vscode', () => ({
  env: {
    clipboard: {
      writeText: clipboardWriteText,
    },
  },
  commands: {
    executeCommand,
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
  },
  Uri: {
    file: (value: string) => ({ fsPath: value }),
  },
  workspace: {
    fs: {
      stat: vi.fn().mockRejectedValue(new Error('missing')),
    },
  },
}));

vi.mock('./evidenceAgentContextBundle.js', () => ({
  buildEvidenceAgentContextBundle: vi.fn(async () => ({
    attachments: [],
    missingRequired: [],
    summaryLines: [],
    copilotQuestion: 'Fix it',
  })),
  buildSendToCopilotPrompt: vi.fn(
    () => '@workspace\n#file:.rapidkit/reports/workspace-context-agent.json'
  ),
}));

vi.mock('./evidenceCommandRunner.js', () => ({
  getWorkspaiEvidenceOutputChannel: () => ({
    appendLine: vi.fn(),
  }),
}));

describe('sendToCopilot', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    clipboardWriteText.mockReset();
  });

  it('prefills Copilot Chat using the VS Code partial-query API', async () => {
    executeCommand.mockResolvedValue(undefined);
    const { openCopilotChatWithPrompt } = await import('../core/sendToCopilot.js');

    const result = await openCopilotChatWithPrompt('Fix pipeline blockers');

    expect(result).toEqual({ opened: true, prefilled: true });
    expect(executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      query: 'Fix pipeline blockers',
      isPartialQuery: true,
    });
  });

  it('does not copy to clipboard when chat prefill succeeds', async () => {
    executeCommand.mockResolvedValue(undefined);
    const { sendEvidenceToCopilot } = await import('../core/sendToCopilot.js');

    const result = await sendEvidenceToCopilot({
      workspacePath: '/tmp/workspace',
      card: {
        id: 'pipeline',
        label: 'Governance Pipeline',
        status: 'fail',
        summary: 'blocked',
        scope: 'workspace',
      },
    });

    expect(result.prefilledChat).toBe(true);
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it('copies the complete agent handoff built by the same Copilot prompt contract', async () => {
    const { copyEvidenceAgentHandoff } = await import('../core/sendToCopilot.js');

    const prompt = await copyEvidenceAgentHandoff({
      workspacePath: '/tmp/workspace',
      card: {
        id: 'pipeline',
        label: 'Governance Pipeline',
        status: 'fail',
        summary: 'blocked',
        scope: 'workspace',
      },
    });

    expect(prompt).toContain('## Workspai workspace root (READ THIS FIRST)');
    expect(prompt).toContain('@workspace');
    expect(prompt).toContain('## Workspai intelligence handoff');
    expect(prompt).toContain('Evidence: Governance Pipeline (fail) — blocked');
    expect(prompt).toContain('## Standard answer contract');
    expect(prompt).toContain('Fix the blocked Workspai evidence issue for "Governance Pipeline"');
    expect(clipboardWriteText).toHaveBeenCalledWith(prompt);
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
