import fs from 'fs-extra';
import path from 'path';

/** Canonical Workspai report paths. Legacy RapidKit paths remain read-only fallbacks. */
export const WORKSPAI_METADATA_DIR = '.workspai';
export const LEGACY_RAPIDKIT_METADATA_DIR = '.rapidkit';
export const WORKSPAI_REPORTS_DIR = '.workspai/reports';
export const LEGACY_RAPIDKIT_REPORTS_DIR = '.rapidkit/reports';

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
export const WORKSPACE_KNOWLEDGE_GRAPH_REPORT_PATH =
  '.workspai/reports/workspace-knowledge-graph.json';
export const WORKSPACE_EVALUATION_LIVE_REPORT_PATH =
  '.workspai/reports/workspace-intelligence-evaluation-live.json';
export const WORKSPACE_EVALUATION_LAST_RUN_REPORT_PATH =
  '.workspai/reports/workspace-intelligence-evaluation-last-run.json';
export const WORKSPACE_CONTRACT_VERIFY_REPORT_PATH =
  '.workspai/reports/workspace-contract-verify-last-run.json';
export const WORKSPACE_COMPATIBILITY_MATRIX_PATH = '.workspai/compatibility-matrix.json';

export function legacyWorkspaceArtifactPath(relativePath: string): string {
  if (relativePath === WORKSPAI_METADATA_DIR) {
    return LEGACY_RAPIDKIT_METADATA_DIR;
  }
  if (relativePath.startsWith(`${WORKSPAI_METADATA_DIR}/`)) {
    return `${LEGACY_RAPIDKIT_METADATA_DIR}/${relativePath.slice(WORKSPAI_METADATA_DIR.length + 1)}`;
  }
  return relativePath;
}

export function workspaceArtifactCandidates(relativePath: string): string[] {
  const legacyPath = legacyWorkspaceArtifactPath(relativePath);
  return legacyPath === relativePath ? [relativePath] : [relativePath, legacyPath];
}

/**
 * Resolve one report authority for a workspace. Never mix canonical and legacy
 * report directories in the same evidence bundle.
 */
export async function resolveWorkspaceReportsDir(workspacePath: string): Promise<string> {
  const canonical = path.join(workspacePath, WORKSPAI_REPORTS_DIR);
  if (await fs.pathExists(canonical)) {
    return canonical;
  }
  return path.join(workspacePath, LEGACY_RAPIDKIT_REPORTS_DIR);
}

export async function resolveWorkspaceMetadataDir(workspacePath: string): Promise<string> {
  const canonical = path.join(workspacePath, WORKSPAI_METADATA_DIR);
  if (await fs.pathExists(canonical)) {
    return canonical;
  }
  return path.join(workspacePath, LEGACY_RAPIDKIT_METADATA_DIR);
}

export async function resolveWorkspaceMarkerPath(workspacePath: string): Promise<string> {
  const canonical = path.join(workspacePath, '.workspai-workspace');
  if (await fs.pathExists(canonical)) {
    return canonical;
  }
  return path.join(workspacePath, '.rapidkit-workspace');
}

/** Resolve a canonical Workspai artifact with a read-only RapidKit fallback. */
export async function resolveWorkspaceArtifactPath(
  workspacePath: string,
  relativePath: string
): Promise<string> {
  for (const candidate of workspaceArtifactCandidates(relativePath)) {
    const absolutePath = path.join(workspacePath, candidate);
    if (await fs.pathExists(absolutePath)) {
      return absolutePath;
    }
  }
  return path.join(workspacePath, relativePath);
}

/** Synchronous variant for UI readers that run inside an already synchronous render bridge. */
export function resolveWorkspaceArtifactPathSync(
  workspacePath: string,
  relativePath: string
): string {
  for (const candidate of workspaceArtifactCandidates(relativePath)) {
    const absolutePath = path.join(workspacePath, candidate);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return path.join(workspacePath, relativePath);
}

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
  WORKSPACE_KNOWLEDGE_GRAPH_REPORT_PATH,
  WORKSPACE_EVALUATION_LIVE_REPORT_PATH,
  WORKSPACE_EVALUATION_LAST_RUN_REPORT_PATH,
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
