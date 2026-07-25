import * as vscode from 'vscode';

import {
  buildEvidenceAgentContextBundle,
  buildSendToCopilotPrompt,
  type EvidenceAgentContextBundle,
} from './evidenceAgentContextBundle.js';
import type { EvidenceCardAgentContextInput } from './evidenceCardAgentPrompt.js';
import { getWorkspaiEvidenceOutputChannel } from './evidenceCommandRunner.js';
import { AGENT_CUSTOMIZATION_PACK_REPORT_PATH } from './workspaceIntelligencePaths.js';
import { resolveAgentSyncCliOptions } from './agentSyncSettings.js';

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
  ensuredAgentPack: boolean;
};

export type CopilotChatOpenResult = {
  opened: boolean;
  prefilled: boolean;
};

export async function buildEvidenceAgentHandoffPrompt(
  input: EvidenceCardAgentContextInput
): Promise<{ bundle: EvidenceAgentContextBundle; prompt: string }> {
  const bundle = await buildEvidenceAgentContextBundle(input);
  return { bundle, prompt: buildSendToCopilotPrompt(bundle) };
}

export async function copyEvidenceAgentHandoff(
  input: EvidenceCardAgentContextInput
): Promise<string> {
  const { prompt } = await buildEvidenceAgentHandoffPrompt(input);
  await vscode.env.clipboard.writeText(prompt);

  const channel = getWorkspaiEvidenceOutputChannel();
  const label = input.card?.label ?? 'Workspace intelligence';
  channel.appendLine(`[${new Date().toISOString()}] Copy agent handoff · ${label}`);
  channel.appendLine(prompt);
  channel.appendLine('');
  void vscode.window.showInformationMessage('Complete Workspai agent handoff copied.');
  return prompt;
}

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
    `${workspacePath}/.workspai/reports/workspace-context-agent.json`
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

async function ensureAgentCustomizationPack(workspacePath: string): Promise<boolean> {
  const packPath = vscode.Uri.file(`${workspacePath}/${AGENT_CUSTOMIZATION_PACK_REPORT_PATH}`);
  try {
    await vscode.workspace.fs.stat(packPath);
    return true;
  } catch {
    // Missing — attempt enterprise agent-sync via registered command.
  }

  try {
    const syncOptions = resolveAgentSyncCliOptions();
    await vscode.commands.executeCommand('workspai.workspaceAgentSync', {
      path: workspacePath,
      preferNonInteractive: true,
      preset: syncOptions.preset,
      experimentalHooks: syncOptions.experimentalHooks,
    });
    await vscode.workspace.fs.stat(packPath);
    return true;
  } catch {
    return false;
  }
}

export async function sendEvidenceToCopilot(
  input: EvidenceCardAgentContextInput
): Promise<SendToCopilotResult> {
  const ensuredAgentContext = await ensureWorkspaceAgentContextReport(input.workspacePath);
  const ensuredAgentPack = await ensureAgentCustomizationPack(input.workspacePath);
  const { bundle, prompt } = await buildEvidenceAgentHandoffPrompt(input);

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

  if (!ensuredAgentPack) {
    void vscode.window.showWarningMessage(
      'Agent customization pack is missing. Run Agent Grounding Sync for pack drift metadata and cross-tool hooks.'
    );
  }

  return {
    bundle,
    prompt,
    openedChat,
    prefilledChat,
    ensuredAgentContext,
    ensuredAgentPack,
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
