import * as vscode from 'vscode';

import {
  buildEvidenceAgentContextBundle,
  buildSendToCopilotPrompt,
  type EvidenceAgentContextBundle,
} from './evidenceAgentContextBundle.js';
import type { EvidenceCardAgentContextInput } from './evidenceCardAgentPrompt.js';
import { getWorkspaiEvidenceOutputChannel } from './evidenceCommandRunner.js';

const COPILOT_FOCUS_COMMANDS = [
  'github.copilot.openChat',
  'workbench.panel.chat.view.copilot.focus',
] as const;

export type SendToCopilotResult = {
  bundle: EvidenceAgentContextBundle;
  prompt: string;
  openedChat: boolean;
  prefilledChat: boolean;
  ensuredAgentContext: boolean;
  ensuredAgentIndex: boolean;
};

export type CopilotChatOpenResult = {
  opened: boolean;
  prefilled: boolean;
};

/** VS Code standard: prefill Copilot/Chat input without auto-submit. */
export async function openCopilotChatWithPrompt(prompt: string): Promise<CopilotChatOpenResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { opened: false, prefilled: false };
  }

  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: trimmed,
      isPartialQuery: true,
    });
    return { opened: true, prefilled: true };
  } catch {
    // Fall back to legacy open + clipboard.
  }

  for (const command of COPILOT_FOCUS_COMMANDS) {
    try {
      await vscode.commands.executeCommand(command);
      return { opened: true, prefilled: false };
    } catch {
      // Try the next known chat entry point.
    }
  }

  return { opened: false, prefilled: false };
}

async function ensureWorkspaceAgentContextReport(workspacePath: string): Promise<boolean> {
  const reportPath = vscode.Uri.file(
    `${workspacePath}/.rapidkit/reports/workspace-context-agent.json`
  );
  try {
    await vscode.workspace.fs.stat(reportPath);
    return true;
  } catch {
    // Missing — attempt to generate via registered command.
  }

  try {
    await vscode.commands.executeCommand('workspai.workspaceContextAgent', {
      path: workspacePath,
      preferNonInteractive: true,
    });
    await vscode.workspace.fs.stat(reportPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureWorkspaceAgentReportsIndex(workspacePath: string): Promise<boolean> {
  const indexPath = vscode.Uri.file(`${workspacePath}/.rapidkit/reports/INDEX.json`);
  try {
    await vscode.workspace.fs.stat(indexPath);
    return true;
  } catch {
    // Missing — attempt agent grounding sync.
  }

  try {
    await vscode.commands.executeCommand('workspai.workspaceAgentSync', {
      path: workspacePath,
      preferNonInteractive: true,
    });
    await vscode.workspace.fs.stat(indexPath);
    return true;
  } catch {
    return false;
  }
}

export async function sendEvidenceToCopilot(
  input: EvidenceCardAgentContextInput
): Promise<SendToCopilotResult> {
  const ensuredAgentContext = await ensureWorkspaceAgentContextReport(input.workspacePath);
  const ensuredAgentIndex = await ensureWorkspaceAgentReportsIndex(input.workspacePath);
  const bundle = await buildEvidenceAgentContextBundle(input);
  const prompt = buildSendToCopilotPrompt(bundle);

  const { opened: openedChat, prefilled: prefilledChat } = await openCopilotChatWithPrompt(prompt);
  if (!prefilledChat) {
    await vscode.env.clipboard.writeText(prompt);
  }

  const channel = getWorkspaiEvidenceOutputChannel();
  const label = input.card?.label ?? 'Workspace intelligence';
  channel.appendLine(`[${new Date().toISOString()}] Send to Copilot · ${label}`);
  channel.appendLine(prompt);
  channel.appendLine('');

  if (prefilledChat) {
    void vscode.window.showInformationMessage(
      'Workspai loaded this evidence pack into Copilot Chat — review and press Enter to send.'
    );
  } else if (openedChat) {
    void vscode.window.showInformationMessage(
      'Workspai Copilot prompt copied to clipboard — paste into Copilot Chat to continue.'
    );
  } else {
    void vscode.window.showInformationMessage(
      'Workspai Copilot prompt copied. Open Copilot Chat and paste to continue.'
    );
  }

  if (!ensuredAgentContext) {
    void vscode.window.showWarningMessage(
      'Workspace agent context report is missing. Run Workspace Context (agent) for richer Copilot grounding.'
    );
  }

  if (!ensuredAgentIndex) {
    void vscode.window.showWarningMessage(
      'Agent reports INDEX is missing. Run Agent Grounding Sync for cross-tool hooks (AGENTS.md, Copilot, Cursor).'
    );
  }

  return {
    bundle,
    prompt,
    openedChat,
    prefilledChat,
    ensuredAgentContext,
    ensuredAgentIndex,
  };
}

export async function sendWorkspaceIntelligenceToCopilot(input: {
  workspacePath: string;
  workspaceName?: string;
  userQuestion?: string;
}): Promise<SendToCopilotResult> {
  return sendEvidenceToCopilot({
    workspacePath: input.workspacePath,
    workspaceName: input.workspaceName,
    userQuestion: input.userQuestion,
  });
}
