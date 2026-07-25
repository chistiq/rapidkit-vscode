/** Report paths aligned with canonical Workspai workspace intelligence artifacts. */
export const AGENT_CUSTOMIZATION_PACK_REPORT_PATH =
  '.workspai/reports/agent-customization-pack.json';
export const RAPIDKIT_MCP_DESIGN_REPORT_PATH = '.workspai/reports/workspai-mcp-design.json';
export const AGENT_REPORTS_INDEX_PATH = '.workspai/reports/INDEX.json';
export const AGENT_GROUNDING_DOC_PATH = '.workspai/AGENT-GROUNDING.md';
export const AGENTS_MD_PATH = 'AGENTS.md';
export const WORKSPACE_MODEL_REPORT_PATH = '.workspai/reports/workspace-model.json';
export const WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH =
  '.workspai/reports/workspace-model-snapshot.json';
export const WORKSPACE_MODEL_DIFF_REPORT_PATH =
  '.workspai/reports/workspace-model-diff-last-run.json';
export const WORKSPACE_IMPACT_REPORT_PATH = '.workspai/reports/workspace-impact-last-run.json';
export const WORKSPACE_VERIFY_REPORT_PATH = '.workspai/reports/workspace-verify-last-run.json';
export const WORKSPACE_CONTEXT_AGENT_REPORT_PATH = '.workspai/reports/workspace-context-agent.json';
export const WORKSPACE_HISTORY_PATH = '.workspai/reports/workspace-intelligence-history.json';
export const WORKSPACE_SKILLS_INDEX_PATH = '.workspai/reports/workspace-skills-index.json';
export const WORKSPACE_EXPLAIN_REPORT_PATH = '.workspai/reports/workspace-explain-last-run.json';
export const WORKSPACE_WHY_REPORT_PATH = '.workspai/reports/workspace-why-last-run.json';
export const WORKSPACE_TRACE_REPORT_PATH = '.workspai/reports/workspace-trace-last-run.json';
export const WORKSPACE_CONTRACT_VERIFY_REPORT_PATH =
  '.workspai/reports/workspace-contract-verify-last-run.json';

/** Terminal Bridge / Studio CLI snippet — mirrors extension intelligence chain dispatch. */
export function buildIntelligenceChainCliSnippet(): string {
  return [
    'npx workspai workspace model --json --write',
    'npx workspai workspace snapshot --json',
    `npx workspai workspace diff --from ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH} --json`,
    `npx workspai workspace impact --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json`,
    `npx workspai workspace verify --from-impact ${WORKSPACE_IMPACT_REPORT_PATH} --json`,
    'npx workspai workspace context --for-agent --json --write',
    'npx workspai workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json',
    `npx workspai workspace explain release-blocked --json --write`,
    `npx workspai workspace why release-blocked --json --write`,
    `npx workspai workspace trace --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json --write`,
  ].join(' && ');
}

export function buildAgentGroundingSyncCliSnippet(): string {
  return 'npx workspai workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json';
}

export function buildWorkspaceExplainCliSnippet(): string {
  return 'npx workspai workspace explain release-blocked --json --write';
}

export function buildWorkspaceWhyCliSnippet(): string {
  return 'npx workspai workspace why release-blocked --json --write';
}

export function buildWorkspaceTraceCliSnippet(): string {
  return `npx workspai workspace trace --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json --write`;
}

export function buildWorkspaceGraphExplainCliSnippet(project = '<project>'): string {
  return `npx workspai workspace graph explain ${project} --json`;
}
