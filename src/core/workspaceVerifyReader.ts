import * as fs from 'fs-extra';
import * as path from 'path';

import { WORKSPACE_VERIFY_REPORT_PATH } from './workspaceIntelligencePaths';

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
};

export async function readWorkspaceVerifyReport(
  workspacePath?: string
): Promise<WorkspaceVerifyReport | null> {
  if (!workspacePath) {
    return null;
  }

  const reportPath = path.join(workspacePath, WORKSPACE_VERIFY_REPORT_PATH);
  try {
    if (!(await fs.pathExists(reportPath))) {
      return null;
    }
    const raw = await fs.readJson(reportPath);
    return raw && typeof raw === 'object' ? (raw as WorkspaceVerifyReport) : null;
  } catch {
    return null;
  }
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
