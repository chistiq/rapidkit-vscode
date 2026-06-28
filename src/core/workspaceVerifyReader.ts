import * as path from 'path';

import { WORKSPACE_VERIFY_REPORT_PATH } from './workspaceIntelligencePaths';
import type { BlockerResolution } from '../contracts/blocker-resolution-contract.js';
import { isBlockerResolution } from '../contracts/blocker-resolution-contract.js';
import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';

export const WORKSPACE_VERIFY_SCHEMA_VERSION = 'workspace-verify.v1' as const;

export type WorkspaceVerifyStepReport = {
  id?: string;
  status?: string;
  required?: boolean;
  message?: string;
  project?: string;
};

export type WorkspaceVerifyPolicyViolation = {
  source?: 'model' | 'contract';
  severity?: 'error' | 'warning';
  code?: string;
  message?: string;
  target?: string;
};

export type WorkspaceVerifyFreshness = {
  /** Graph-aware transitive freshness verdict from rapidkit workspace verify. */
  verdict?: 'fresh' | 'stale' | 'unknown';
  baseline?: string | null;
  changed?: string[];
  added?: string[];
  removed?: string[];
};

export type WorkspaceVerifyReport = {
  schemaVersion?: string;
  generatedAt?: string;
  summary?: {
    verdict?: string;
    exitCode?: number;
    stepsPassed?: number;
    stepsWarn?: number;
    stepsFailed?: number;
    stepsMissing?: number;
    stepsSkipped?: number;
  };
  freshness?: WorkspaceVerifyFreshness;
  policyMode?: string;
  policyViolations?: WorkspaceVerifyPolicyViolation[];
  impact?: {
    risk?: string;
    affectedProjects?: number;
    recommendedCommands?: number;
  };
  steps?: WorkspaceVerifyStepReport[];
  blockingReasons?: string[];
  missingEvidence?: string[];
  resolutionHints?: BlockerResolution[];
};

export type WorkspaceVerifyReportReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; report: WorkspaceVerifyReport }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

function normalizeResolutionHints(value: unknown): BlockerResolution[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const hints = value.filter((entry) => isBlockerResolution(entry));
  return hints.length > 0 ? hints : undefined;
}

export function isWorkspaceVerifyReport(value: unknown): value is WorkspaceVerifyReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WORKSPACE_VERIFY_SCHEMA_VERSION) {
    return false;
  }
  return typeof record.generatedAt === 'string';
}

export async function readWorkspaceVerifyReport(
  workspacePath?: string
): Promise<WorkspaceVerifyReport | null> {
  const result = await readWorkspaceVerifyReportArtifact(workspacePath);
  return result.kind === 'valid' ? result.report : null;
}

export async function readWorkspaceVerifyReportArtifact(
  workspacePath?: string
): Promise<WorkspaceVerifyReportReadResult> {
  const reportPath = path.join(workspacePath ?? '', WORKSPACE_VERIFY_REPORT_PATH);
  if (!workspacePath) {
    return { kind: 'missing', artifactPath: reportPath };
  }

  const result: JsonArtifactReadResult = await readJsonArtifact(reportPath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isWorkspaceVerifyReport(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: WORKSPACE_VERIFY_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: 'Workspace verify artifact must include generatedAt.',
    });
  }
  const report = result.raw as WorkspaceVerifyReport;
  const hints = normalizeResolutionHints(report.resolutionHints);
  return {
    kind: 'valid',
    artifactPath: result.artifactPath,
    report: hints ? { ...report, resolutionHints: hints } : report,
  };
}

export function buildWorkspaceVerifyPromptSection(report: WorkspaceVerifyReport | null): string {
  if (!report) {
    return '';
  }

  const lines = ['WORKSPACE VERIFY (canonical npm workspace-verify.v1):'];
  const summary = report.summary ?? {};
  lines.push(
    `- Verdict: ${summary.verdict ?? 'unknown'} · exit ${summary.exitCode ?? 'n/a'} · passed ${summary.stepsPassed ?? 0} · missing ${summary.stepsMissing ?? 0}`
  );
  if (report.impact?.risk) {
    lines.push(
      `- Impact context: risk ${report.impact.risk} · affected projects ${report.impact.affectedProjects ?? 0}`
    );
  }

  const blocking = report.blockingReasons ?? [];
  if (blocking.length > 0) {
    lines.push('- Blocking reasons:');
    for (const reason of blocking.slice(0, 6)) {
      lines.push(`  • ${reason}`);
    }
  }

  const policyViolations = report.policyViolations ?? [];
  if (policyViolations.length > 0) {
    const errors = policyViolations.filter((violation) => violation.severity === 'error');
    const warnings = policyViolations.filter((violation) => violation.severity !== 'error');
    lines.push(
      `- Policy (${report.policyMode ?? 'unknown'} mode): ${errors.length} error(s), ${warnings.length} warning(s).`
    );
    for (const violation of [...errors, ...warnings].slice(0, 8)) {
      const target = violation.target ? ` (${violation.target})` : '';
      lines.push(
        `  • [${violation.severity ?? 'error'}] policy.${violation.code ?? 'policy'}: ${violation.message ?? 'policy violation'}${target}`
      );
    }
  }

  const requiredMissing = (report.steps ?? []).filter(
    (step) => step.required !== false && step.status === 'missing'
  );
  if (requiredMissing.length > 0) {
    lines.push('- Required missing evidence:');
    for (const step of requiredMissing.slice(0, 8)) {
      lines.push(`  • ${step.id ?? 'step'}: ${step.message ?? 'missing evidence'}`);
    }
  }

  const failed = (report.steps ?? []).filter((step) => step.status === 'fail');
  if (failed.length > 0) {
    lines.push('- Failed steps:');
    for (const step of failed.slice(0, 6)) {
      lines.push(`  • ${step.id ?? 'step'}: ${step.message ?? 'failed'}`);
    }
  }

  lines.push(
    '- Do not claim release readiness unless verify verdict is ready, required evidence exists, and there are no error-severity policy violations.'
  );

  return lines.join('\n');
}
