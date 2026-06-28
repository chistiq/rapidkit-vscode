import * as path from 'path';

import { WORKSPACE_IMPACT_REPORT_PATH } from './workspaceIntelligencePaths';
import { readJsonArtifact, type JsonArtifactReadResult } from './jsonArtifactReader.js';

export const WORKSPACE_IMPACT_SCHEMA_VERSION = 'workspace-impact.v1';

export function isWorkspaceImpactReport(value: unknown): value is WorkspaceImpactReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_IMPACT_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string'
  );
}

export type WorkspaceImpactReport = {
  schemaVersion?: string;
  generatedAt?: string;
  fromRef?: string;
  diffRef?: string;
  summary?: {
    changed?: boolean;
    risk?: string;
    affectedProjects?: number;
    workspaceItems?: number;
    recommendedCommands?: number;
  };
  affectedProjects?: Array<{
    title?: string;
    summary?: string;
    risk?: string;
    project?: {
      name?: string;
      path?: string;
      framework?: string;
      kind?: string;
    };
    verification?: Array<{
      display?: string;
      required?: boolean;
    }>;
  }>;
  workspaceImpact?: Array<{
    title?: string;
    summary?: string;
    risk?: string;
    target?: string;
    scope?: string;
    reasons?: string[];
  }>;
  verificationPlan?: Array<{
    id?: string;
    label?: string;
    display?: string;
    required?: boolean;
  }>;
  agentBrief?: {
    headline?: string;
    bullets?: string[];
    unsafeAssumptions?: string[];
  };
};

export type WorkspaceImpactReportReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; report: WorkspaceImpactReport }
  | { kind: 'corrupt'; artifactPath: string; error: string };

export async function readWorkspaceImpactReport(
  workspacePath?: string
): Promise<WorkspaceImpactReport | null> {
  const result = await readWorkspaceImpactReportArtifact(workspacePath);
  return result.kind === 'valid' ? result.report : null;
}

export async function readWorkspaceImpactReportArtifact(
  workspacePath?: string
): Promise<WorkspaceImpactReportReadResult> {
  const reportPath = path.join(workspacePath ?? '', WORKSPACE_IMPACT_REPORT_PATH);
  if (!workspacePath) {
    return { kind: 'missing', artifactPath: reportPath };
  }

  const result: JsonArtifactReadResult = await readJsonArtifact(reportPath);
  if (result.kind !== 'valid') {
    return result;
  }
  if (!isWorkspaceImpactReport(result.raw)) {
    return {
      kind: 'corrupt',
      artifactPath: result.artifactPath,
      error: 'Workspace impact artifact does not match workspace-impact.v1.',
    };
  }
  return { kind: 'valid', artifactPath: result.artifactPath, report: result.raw };
}

export function buildWorkspaceImpactPromptSection(report: WorkspaceImpactReport | null): string {
  if (!report) {
    return '';
  }

  const lines = ['WORKSPACE IMPACT (canonical npm blast-radius report):'];
  const summary = report.summary ?? {};
  lines.push(
    `- Risk: ${summary.risk ?? 'unknown'} · affected projects: ${summary.affectedProjects ?? 0} · workspace items: ${summary.workspaceItems ?? 0} · changed: ${summary.changed === true ? 'yes' : 'no'}`
  );

  if (report.fromRef) {
    lines.push(`- Baseline ref: ${report.fromRef}`);
  }
  if (report.diffRef) {
    lines.push(`- Diff ref: ${report.diffRef}`);
  }

  if (report.agentBrief?.headline) {
    lines.push(`- Brief: ${report.agentBrief.headline}`);
  }

  const bullets = Array.isArray(report.agentBrief?.bullets) ? report.agentBrief.bullets : [];
  for (const bullet of bullets.slice(0, 6)) {
    lines.push(`  • ${bullet}`);
  }

  const affected = Array.isArray(report.affectedProjects) ? report.affectedProjects : [];
  if (affected.length > 0) {
    lines.push('- Affected projects:');
    for (const item of affected.slice(0, 8)) {
      const name = item.project?.name ?? item.title ?? 'project';
      lines.push(`  • ${name}: ${item.summary ?? item.risk ?? 'impact detected'}`);
    }
  }

  const workspaceItems = Array.isArray(report.workspaceImpact) ? report.workspaceImpact : [];
  if (workspaceItems.length > 0) {
    lines.push('- Workspace-level impact samples (not project code failures):');
    for (const item of workspaceItems.slice(0, 10)) {
      const label = item.target ?? item.title ?? 'workspace item';
      lines.push(
        `  • ${label}: ${item.summary ?? item.risk ?? 'workspace-level change'}${item.reasons?.[0] ? ` (${item.reasons[0]})` : ''}`
      );
    }
    if (workspaceItems.length > 10) {
      lines.push(`  • … and ${workspaceItems.length - 10} more workspace-level item(s)`);
    }
  }

  const verification = Array.isArray(report.verificationPlan) ? report.verificationPlan : [];
  const required = verification.filter((step) => step.required !== false);
  if (required.length > 0) {
    lines.push('- Required verification commands:');
    for (const step of required.slice(0, 8)) {
      lines.push(`  • ${step.display ?? step.label ?? step.id ?? 'verify step'}`);
    }
  }

  const unsafe = Array.isArray(report.agentBrief?.unsafeAssumptions)
    ? report.agentBrief.unsafeAssumptions
    : [];
  for (const assumption of unsafe.slice(0, 4)) {
    lines.push(`  • Unsafe assumption: ${assumption}`);
  }

  lines.push(
    '- Guidance: high workspace item counts often mean git-untracked governance/agent files after agent-sync — not stale doctor output. Do not delete this report or run doctor to fix it.'
  );

  return lines.join('\n');
}
