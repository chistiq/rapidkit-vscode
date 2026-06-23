import {
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
} from './workspaceIntelligencePaths';

/** npm `workspace context --for-agent` without a slug → generic agent pack (Copilot-safe). */
export function buildWorkspaceAgentContextCliArgs(scope?: string): string[] {
  const args = ['workspace', 'context', '--for-agent', '--json', '--write'];
  if (scope?.trim()) {
    args.push('--scope', scope.trim());
  }
  return args;
}

export function buildWorkspaceAgentSyncCliArgs(options?: {
  scope?: string;
  strict?: boolean;
  preset?: 'minimal' | 'enterprise';
  target?: string;
  experimentalHooks?: boolean;
}): string[] {
  const args = ['workspace', 'agent-sync', '--write', '--refresh-context', '--json'];
  args.push('--preset', options?.preset ?? 'enterprise');
  args.push('--target', options?.target?.trim() || 'vscode');
  if (options?.scope?.trim()) {
    args.push('--scope', options.scope.trim());
  }
  if (options?.strict) {
    args.push('--strict');
  }
  if (options?.experimentalHooks) {
    args.push('--experimental-hooks');
  }
  return args;
}

export function buildCopilotChatContextPrompt(userQuestion?: string): string {
  const question =
    userQuestion?.trim() || 'Summarize this workspace and list the safest next RapidKit commands.';
  return [
    '@workspace',
    `#file:${WORKSPACE_CONTEXT_AGENT_REPORT_PATH}`,
    `#file:${AGENT_CUSTOMIZATION_PACK_REPORT_PATH}`,
    '',
    `With this workspace context and agent customization pack, ${question}`,
  ].join('\n');
}

export function buildCopilotChatModelPrompt(): string {
  return [
    '#file:.rapidkit/reports/workspace-model.json',
    '',
    'Use this workspace model graph as the source of truth for project layout and commands.',
  ].join('\n');
}

export async function copyCopilotContextPromptToClipboard(userQuestion?: string): Promise<void> {
  const vscode = await import('vscode');
  await vscode.env.clipboard.writeText(buildCopilotChatContextPrompt(userQuestion));
  vscode.window.showInformationMessage(
    'Copilot Chat prompt copied. Paste into @github or Copilot Chat with #file attachment.'
  );
}
