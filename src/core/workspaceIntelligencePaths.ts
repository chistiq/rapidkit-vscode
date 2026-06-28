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

export const WORKSPACE_INTELLIGENCE_REPORT_PATHS = [
  AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
  AGENT_REPORTS_INDEX_PATH,
  WORKSPACE_MODEL_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_VERIFY_REPORT_PATH,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
] as const;

export type WorkspaceIntelligenceReportPath = (typeof WORKSPACE_INTELLIGENCE_REPORT_PATHS)[number];

export const WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES = [
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  WORKSPACE_MODEL_REPORT_PATH,
] as const;

export const WORKSPACE_INTELLIGENCE_IMPACT_FROM_CANDIDATES = [
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  WORKSPACE_MODEL_REPORT_PATH,
] as const;
