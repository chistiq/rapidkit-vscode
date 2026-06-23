import * as vscode from 'vscode';

import {
  sendEvidenceToCopilot,
  sendWorkspaceIntelligenceToCopilot,
} from '../../core/sendToCopilot';
import { ensureFreshEvidenceForAIAction } from '../../core/workspaceEvidenceFreshnessGate';
import {
  buildEvidenceCardStudioPromptEnriched,
  type EvidenceCardAgentContextInput,
} from '../../core/evidenceCardAgentPrompt';

export type WelcomePanelCopilotHandoffContext = {
  resolveWorkspacePath: () => string | undefined;
  resolveWorkspaceName: () => string | undefined;
};

function readOptionalString(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export async function handleWelcomePanelSendWorkspaceToCopilot(
  data: unknown,
  context: WelcomePanelCopilotHandoffContext
): Promise<void> {
  const workspacePath = readOptionalString(data, 'workspacePath') ?? context.resolveWorkspacePath();
  if (!workspacePath) {
    void vscode.window.showWarningMessage(
      'Select a workspace before sending intelligence to Copilot.'
    );
    return;
  }

  const copilotFreshness = await ensureFreshEvidenceForAIAction({
    workspacePath,
    actionLabel: 'Send to Copilot',
    refresh: async () => {
      await vscode.commands.executeCommand('workspai.workspaceIntelligenceChain', {
        path: workspacePath,
      });
    },
  });
  if (copilotFreshness === 'cancelled') {
    return;
  }

  await sendWorkspaceIntelligenceToCopilot({
    workspacePath,
    workspaceName: readOptionalString(data, 'workspaceName') ?? context.resolveWorkspaceName(),
    userQuestion: readOptionalString(data, 'question'),
  });
}

export async function handleWelcomePanelSendEvidenceToCopilot(
  data: unknown,
  context: WelcomePanelCopilotHandoffContext
): Promise<void> {
  const workspacePath = readOptionalString(data, 'workspacePath') ?? context.resolveWorkspacePath();
  const card =
    data && typeof data === 'object' && 'card' in data
      ? (data as Record<string, unknown>).card
      : undefined;

  if (!workspacePath || !card || typeof card !== 'object') {
    void vscode.window.showWarningMessage(
      'Select a workspace and evidence card before sending to Copilot.'
    );
    return;
  }

  await sendEvidenceToCopilot({
    workspacePath,
    workspaceName: readOptionalString(data, 'workspaceName'),
    projectPath: readOptionalString(data, 'projectPath'),
    projectName: readOptionalString(data, 'projectName'),
    card: card as EvidenceCardAgentContextInput['card'],
  });
}

export async function handleWelcomePanelAskStudioAboutEvidence(
  data: unknown,
  context: WelcomePanelCopilotHandoffContext
): Promise<void> {
  const workspacePath = readOptionalString(data, 'workspacePath') ?? context.resolveWorkspacePath();
  const card =
    data && typeof data === 'object' && 'card' in data
      ? (data as Record<string, unknown>).card
      : undefined;

  if (!workspacePath || !card || typeof card !== 'object') {
    void vscode.window.showWarningMessage(
      'Select a workspace and evidence card before opening Studio.'
    );
    return;
  }

  const typedCard = card as EvidenceCardAgentContextInput['card'];
  const studioPrompt = await buildEvidenceCardStudioPromptEnriched({
    card: typedCard,
    workspacePath,
    workspaceName: readOptionalString(data, 'workspaceName'),
    projectPath: readOptionalString(data, 'projectPath'),
    projectName: readOptionalString(data, 'projectName'),
  });

  await vscode.commands.executeCommand('workspai.openIncidentStudio', {
    workspacePath,
    workspaceName: readOptionalString(data, 'workspaceName'),
    projectPath: readOptionalString(data, 'projectPath'),
    projectName: readOptionalString(data, 'projectName'),
    composerHandoff: 'prefill',
    initialQuery: studioPrompt,
    studioMode: 'investigate',
    source: readOptionalString(data, 'source') ?? 'dashboard',
    trigger: readOptionalString(data, 'trigger') ?? 'dashboard-evidence-studio-handoff',
    evidenceCard: typedCard,
  });
}
