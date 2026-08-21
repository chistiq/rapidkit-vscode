import {
  AGENT_REPORTS_INDEX_PATH,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
  WORKSPACE_VERIFY_REPORT_PATH,
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
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
    userQuestion?.trim() || 'Summarize this workspace and list the safest next Workspai commands.';
  return [
    '@workspace',
    `#file:${AGENT_REPORTS_INDEX_PATH}`,
    '#file:.workspai/goals/index.json',
    '#file:.workspai/reports/goal-pack-last-run.json',
    `#file:${WORKSPACE_CONTEXT_AGENT_REPORT_PATH}`,
    `#file:${WORKSPACE_SKILLS_INDEX_PATH}`,
    `#file:${WORKSPACE_VERIFY_REPORT_PATH}`,
    `#file:${WORKSPACE_IMPACT_REPORT_PATH}`,
    `#file:${WORKSPACE_EXPLAIN_REPORT_PATH}`,
    '',
    `Follow the canonical read order above. Use bounded graph search from the context pack when more proof is needed; do not preload full Model or Graph exports. ${question}`,
  ].join('\n');
}

export function buildCopilotChatModelPrompt(): string {
  return [
    `#file:${AGENT_REPORTS_INDEX_PATH}`,
    `#file:${WORKSPACE_CONTEXT_AGENT_REPORT_PATH}`,
    '',
    'Use the bounded context as the source of truth. Query the proof-backed graph for the task before requesting a complete Model export.',
  ].join('\n');
}

export async function copyCopilotContextPromptToClipboard(userQuestion?: string): Promise<void> {
  const vscode = await import('vscode');
  await vscode.env.clipboard.writeText(buildCopilotChatContextPrompt(userQuestion));
  vscode.window.showInformationMessage(
    'Copilot Chat prompt copied. Paste into @github or Copilot Chat with #file attachment.'
  );
}
