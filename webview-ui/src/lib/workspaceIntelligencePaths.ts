/** Report paths aligned with rapidkit-npm workspace intelligence artifacts. */
export const AGENT_CUSTOMIZATION_PACK_REPORT_PATH =
  '.rapidkit/reports/agent-customization-pack.json';
export const RAPIDKIT_MCP_DESIGN_REPORT_PATH = '.rapidkit/reports/rapidkit-mcp-design.json';
export const AGENT_REPORTS_INDEX_PATH = '.rapidkit/reports/INDEX.json';
export const AGENT_GROUNDING_DOC_PATH = '.rapidkit/AGENT-GROUNDING.md';
export const AGENTS_MD_PATH = 'AGENTS.md';
export const WORKSPACE_MODEL_REPORT_PATH = '.rapidkit/reports/workspace-model.json';
export const WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH =
  '.rapidkit/reports/workspace-model-snapshot.json';
export const WORKSPACE_MODEL_DIFF_REPORT_PATH =
  '.rapidkit/reports/workspace-model-diff-last-run.json';
export const WORKSPACE_IMPACT_REPORT_PATH = '.rapidkit/reports/workspace-impact-last-run.json';
export const WORKSPACE_VERIFY_REPORT_PATH = '.rapidkit/reports/workspace-verify-last-run.json';
export const WORKSPACE_CONTEXT_AGENT_REPORT_PATH = '.rapidkit/reports/workspace-context-agent.json';
export const WORKSPACE_HISTORY_PATH = '.rapidkit/reports/workspace-intelligence-history.json';
export const WORKSPACE_SKILLS_INDEX_PATH = '.rapidkit/reports/workspace-skills-index.json';
export const WORKSPACE_EXPLAIN_REPORT_PATH = '.rapidkit/reports/workspace-explain-last-run.json';
export const WORKSPACE_WHY_REPORT_PATH = '.rapidkit/reports/workspace-why-last-run.json';
export const WORKSPACE_TRACE_REPORT_PATH = '.rapidkit/reports/workspace-trace-last-run.json';
export const WORKSPACE_CONTRACT_VERIFY_REPORT_PATH =
  '.rapidkit/reports/workspace-contract-verify-last-run.json';

/** Terminal Bridge / Studio CLI snippet — mirrors extension intelligence chain dispatch. */
export function buildIntelligenceChainCliSnippet(): string {
  return [
    'npx rapidkit workspace model --json --write',
    'npx rapidkit workspace snapshot --json',
    `npx rapidkit workspace diff --from ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH} --json`,
    `npx rapidkit workspace impact --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json`,
    `npx rapidkit workspace verify --from-impact ${WORKSPACE_IMPACT_REPORT_PATH} --json`,
    'npx rapidkit workspace context --for-agent --json --write',
    'npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json',
    `npx rapidkit workspace explain release-blocked --json --write`,
    `npx rapidkit workspace why release-blocked --json --write`,
    `npx rapidkit workspace trace --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json --write`,
  ].join(' && ');
}

export function buildAgentGroundingSyncCliSnippet(): string {
  return 'npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json';
}

export function buildWorkspaceExplainCliSnippet(): string {
  return 'npx rapidkit workspace explain release-blocked --json --write';
}

export function buildWorkspaceWhyCliSnippet(): string {
  return 'npx rapidkit workspace why release-blocked --json --write';
}

export function buildWorkspaceTraceCliSnippet(): string {
  return `npx rapidkit workspace trace --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json --write`;
}

export function buildWorkspaceGraphExplainCliSnippet(project = '<project>'): string {
  return `npx rapidkit workspace graph explain ${project} --json`;
}
