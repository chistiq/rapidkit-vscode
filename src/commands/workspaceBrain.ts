/**
 * Workspace Brain Command
 * Routes to the shared Workspai AI modal via the WelcomePanel.
 * The old dedicated Brain panel was duplicating shared AI prep logic and is removed.
 */

import * as vscode from 'vscode';
import { resolvePreferredAIModalContext } from '../core/aiContextResolver';
import { WelcomePanel } from '../ui/panels/welcomePanel';

// ──────────────────────────────────────────────
// Command registration
// ──────────────────────────────────────────────

type WorkspaceBrainInvocation = {
  prefillQuestion?: string;
  source?: string;
  trigger?: string;
};

function parseWorkspaceBrainInvocation(seed?: unknown): WorkspaceBrainInvocation {
  if (!seed || typeof seed !== 'object') {
    return {};
  }
  const candidate = seed as Record<string, unknown>;
  return {
    prefillQuestion:
      typeof candidate.prefillQuestion === 'string' && candidate.prefillQuestion.trim().length > 0
        ? candidate.prefillQuestion.trim()
        : undefined,
    source:
      typeof candidate.source === 'string' && candidate.source.trim().length > 0
        ? candidate.source.trim()
        : undefined,
    trigger:
      typeof candidate.trigger === 'string' && candidate.trigger.trim().length > 0
        ? candidate.trigger.trim()
        : undefined,
  };
}

export function registerWorkspaceBrainCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('workspai.workspaceBrain', async (seed?: unknown) => {
    const aiContext = await resolvePreferredAIModalContext();
    const invocation = parseWorkspaceBrainInvocation(seed);
    if (aiContext.path) {
      WelcomePanel.showAIModal(context, {
        ...aiContext,
        prefillMode: 'ask',
        prefillQuestion: invocation.prefillQuestion,
      });
      return;
    }

    WelcomePanel.createOrShow(context);
  });
}
