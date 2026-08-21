import {
  AGENT_REPORTS_INDEX_PATH,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
  WORKSPACE_VERIFY_REPORT_PATH,
} from './workspaceIntelligencePaths';

/** Copilot Chat paste prompt — attach the agent context report via #file. */
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
    `Follow this canonical read order and use bounded graph search before loading full exports. ${question}`,
  ].join('\n');
}

export function buildCopilotChatModelPrompt(): string {
  return [
    `#file:${AGENT_REPORTS_INDEX_PATH}`,
    `#file:${WORKSPACE_CONTEXT_AGENT_REPORT_PATH}`,
    '',
    'Use the bounded context as the source of truth. Query the proof-backed graph before requesting a complete Model export.',
  ].join('\n');
}
