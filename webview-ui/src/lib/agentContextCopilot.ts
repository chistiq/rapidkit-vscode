import { WORKSPACE_CONTEXT_AGENT_REPORT_PATH } from './workspaceIntelligencePaths';

/** Copilot Chat paste prompt — attach the agent context report via #file. */
export function buildCopilotChatContextPrompt(userQuestion?: string): string {
  const question =
    userQuestion?.trim() || 'Summarize this workspace and list the safest next RapidKit commands.';
  return [
    '@workspace',
    `#file:${WORKSPACE_CONTEXT_AGENT_REPORT_PATH}`,
    '',
    `With this workspace context, ${question}`,
  ].join('\n');
}

export function buildCopilotChatModelPrompt(): string {
  return [
    '#file:.rapidkit/reports/workspace-model.json',
    '',
    'Use this workspace model graph as the source of truth for project layout and commands.',
  ].join('\n');
}
