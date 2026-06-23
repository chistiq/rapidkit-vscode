/**
 * Read-only consumer helpers for workspace-run-last.json (workspace-run-v1 aggregate).
 * Mirrors rapidkit-npm src/utils/workspace-run-evidence.ts — extension reads, CLI writes.
 */

export type WorkspaceRunStage = 'init' | 'test' | 'build' | 'start';

export const WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION = 'workspace-run-v1';

const STAGE_SET: ReadonlySet<WorkspaceRunStage> = new Set(['init', 'test', 'build', 'start']);

function isWorkspaceRunStage(value: string): value is WorkspaceRunStage {
  return STAGE_SET.has(value as WorkspaceRunStage);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isWorkspaceRunStageReport(payload: Record<string, unknown>): boolean {
  const stage = payload.stage;
  return typeof stage === 'string' && isWorkspaceRunStage(stage) && Array.isArray(payload.projects);
}

export interface WorkspaceRunEvidenceAggregate {
  schemaVersion: typeof WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  workspacePath: string;
  latestStage: WorkspaceRunStage;
  stages: Partial<Record<WorkspaceRunStage, Record<string, unknown>>>;
  enterpriseControls?: {
    jsonReady: boolean;
    evidencePath: string;
  };
}

export function normalizeWorkspaceRunEvidence(
  payload: unknown
): WorkspaceRunEvidenceAggregate | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  if (record.schemaVersion === WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION && record.stages != null) {
    return record as unknown as WorkspaceRunEvidenceAggregate;
  }

  if (isWorkspaceRunStageReport(record)) {
    const stage = record.stage as WorkspaceRunStage;
    return {
      schemaVersion: WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION,
      generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : '',
      workspacePath: typeof record.workspacePath === 'string' ? record.workspacePath : '',
      latestStage: stage,
      stages: { [stage]: record },
      enterpriseControls:
        record.enterpriseControls && typeof record.enterpriseControls === 'object'
          ? (record.enterpriseControls as WorkspaceRunEvidenceAggregate['enterpriseControls'])
          : undefined,
    };
  }

  return null;
}

export function resolveWorkspaceRunStageReport(
  payload: unknown,
  stage?: WorkspaceRunStage
): Record<string, unknown> | null {
  const aggregate = normalizeWorkspaceRunEvidence(payload);
  if (!aggregate) {
    return null;
  }
  const targetStage = stage ?? aggregate.latestStage;
  const report = aggregate.stages[targetStage];
  return report ?? null;
}

export const WORKSPACE_RUN_STAGE_ORDER: WorkspaceRunStage[] = ['init', 'test', 'build', 'start'];

function stageSummaryNumbers(report: Record<string, unknown>): {
  passed: number;
  failed: number;
  skipped: number;
  selectedCount: number;
  exitCode: number;
} {
  const summary = asRecord(report.summary);
  return {
    passed: Number(summary?.passed ?? 0),
    failed: Number(summary?.failed ?? 0),
    skipped: Number(summary?.skipped ?? 0),
    selectedCount: Number(summary?.selectedCount ?? 0),
    exitCode: Number(summary?.exitCode ?? 0),
  };
}

export function listPresentWorkspaceRunStages(
  aggregate: WorkspaceRunEvidenceAggregate
): WorkspaceRunStage[] {
  return WORKSPACE_RUN_STAGE_ORDER.filter((stage) => aggregate.stages[stage] != null);
}

export function formatWorkspaceRunStageSummary(
  stage: WorkspaceRunStage,
  report: Record<string, unknown>
): string {
  const { passed, failed, skipped } = stageSummaryNumbers(report);
  return `${stage}: ${passed} passed · ${failed} failed · ${skipped} skipped`;
}

export type WorkspaceRunStageReportEntry = {
  stage: WorkspaceRunStage;
  report: Record<string, unknown>;
};

export function listWorkspaceRunStageReports(payload: unknown): WorkspaceRunStageReportEntry[] {
  const aggregate = normalizeWorkspaceRunEvidence(payload);
  if (!aggregate) {
    return [];
  }
  return listPresentWorkspaceRunStages(aggregate).map((stage) => ({
    stage,
    report: aggregate.stages[stage]!,
  }));
}

export function formatWorkspaceRunEvidenceSummary(payload: unknown): string | null {
  const entries = listWorkspaceRunStageReports(payload);
  if (entries.length === 0) {
    return null;
  }
  return entries
    .map(({ stage, report }) => formatWorkspaceRunStageSummary(stage, report))
    .join(' · ');
}

export function resolveWorkspaceRunCardReport(payload: unknown): Record<string, unknown> | null {
  const aggregate = normalizeWorkspaceRunEvidence(payload);
  if (!aggregate) {
    return null;
  }
  return resolveWorkspaceRunStageReport(aggregate, aggregate.latestStage);
}
