import * as path from 'path';

import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';
import {
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
} from './workspaceIntelligencePaths.js';

export const WORKSPACE_EXPLAIN_SCHEMA_VERSION = 'workspace-explain.v1' as const;

export type WorkspaceExplainTarget =
  | { kind: 'project'; project: string }
  | { kind: 'release-blocked' }
  | { kind: 'blocker'; blockerId: string }
  | { kind: 'trace'; diffRef: string };

export type WorkspaceExplainReport = {
  schemaVersion: typeof WORKSPACE_EXPLAIN_SCHEMA_VERSION;
  generatedAt: string;
  workspacePath: string;
  target: WorkspaceExplainTarget;
  summary: string;
  sections: Array<{ id: string; title: string; body: string }>;
  releaseVerdict?: 'ready' | 'needs-attention' | 'blocked';
  evidenceFreshness?: 'fresh' | 'stale' | 'unknown';
  blocking?: boolean;
  blockingReasons?: string[];
  releaseRisk?: string;
};

export type WorkspaceExplainReportReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; report: WorkspaceExplainReport }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export function isWorkspaceExplainReport(value: unknown): value is WorkspaceExplainReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_EXPLAIN_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string' &&
    typeof record.workspacePath === 'string' &&
    typeof record.summary === 'string' &&
    Array.isArray(record.sections) &&
    record.target !== null &&
    typeof record.target === 'object'
  );
}

async function readWorkspaceExplainReportAtPath(
  workspacePath: string,
  relativePath: string,
  _scope: string
): Promise<WorkspaceExplainReport | null> {
  const result = await readWorkspaceExplainReportArtifactAtPath(workspacePath, relativePath);
  return result.kind === 'valid' ? result.report : null;
}

async function readWorkspaceExplainReportArtifactAtPath(
  workspacePath: string,
  relativePath: string
): Promise<WorkspaceExplainReportReadResult> {
  const absolutePath = path.join(workspacePath, relativePath);
  const result: JsonArtifactReadResult = await readJsonArtifact(absolutePath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isWorkspaceExplainReport(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: WORKSPACE_EXPLAIN_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason:
        'Workspace explain artifact must include generatedAt, workspacePath, target, summary, and sections[].',
    });
  }
  return { kind: 'valid', artifactPath: result.artifactPath, report: result.raw };
}

export async function readWorkspaceExplainReportArtifact(
  workspacePath: string
): Promise<WorkspaceExplainReportReadResult> {
  return readWorkspaceExplainReportArtifactAtPath(workspacePath, WORKSPACE_EXPLAIN_REPORT_PATH);
}

export async function readWorkspaceWhyReportArtifact(
  workspacePath: string
): Promise<WorkspaceExplainReportReadResult> {
  return readWorkspaceExplainReportArtifactAtPath(workspacePath, WORKSPACE_WHY_REPORT_PATH);
}

export async function readWorkspaceTraceReportArtifact(
  workspacePath: string
): Promise<WorkspaceExplainReportReadResult> {
  return readWorkspaceExplainReportArtifactAtPath(workspacePath, WORKSPACE_TRACE_REPORT_PATH);
}

export async function readWorkspaceExplainReport(
  workspacePath: string
): Promise<WorkspaceExplainReport | null> {
  return readWorkspaceExplainReportAtPath(
    workspacePath,
    WORKSPACE_EXPLAIN_REPORT_PATH,
    'readWorkspaceExplainReport'
  );
}

export async function readWorkspaceWhyReport(
  workspacePath: string
): Promise<WorkspaceExplainReport | null> {
  return readWorkspaceExplainReportAtPath(
    workspacePath,
    WORKSPACE_WHY_REPORT_PATH,
    'readWorkspaceWhyReport'
  );
}

export async function readWorkspaceTraceReport(
  workspacePath: string
): Promise<WorkspaceExplainReport | null> {
  return readWorkspaceExplainReportAtPath(
    workspacePath,
    WORKSPACE_TRACE_REPORT_PATH,
    'readWorkspaceTraceReport'
  );
}

export function summarizeWorkspaceExplain(
  report: WorkspaceExplainReport | null,
  options?: { workspaceProjectCount?: number | null }
): string {
  if (!report) {
    return 'No explain report yet. Run workspace explain release-blocked --write.';
  }
  const projectCount = options?.workspaceProjectCount;
  const summary =
    projectCount === 0 && report.summary.toLowerCase().includes('release blocked')
      ? report.summary
          .replace(/^Release blocked:/i, 'Workspace scaffold:')
          .replace(/blocking reason/gi, 'pre-project signal')
      : report.summary;
  const risk = report.releaseRisk ? ` · risk ${report.releaseRisk}` : '';
  const blockers =
    report.blockingReasons && report.blockingReasons.length > 0
      ? ` · ${report.blockingReasons.length} blocker(s)`
      : '';
  return `${summary}${risk}${blockers}`;
}
