/** Report paths aligned with rapidkit-npm workspace intelligence artifacts. */
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
  ].join(' && ');
}

export function buildAgentGroundingSyncCliSnippet(): string {
  return 'npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json';
}
