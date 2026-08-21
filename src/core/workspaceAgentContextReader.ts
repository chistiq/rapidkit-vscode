import * as path from 'path';

import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';
import { WORKSPACE_CONTEXT_AGENT_REPORT_PATH } from './workspaceIntelligencePaths';

export const WORKSPACE_CONTEXT_SCHEMA_VERSION = 'workspace-context.v1';

export function isWorkspaceAgentContextReport(
  value: unknown
): value is WorkspaceAgentContextReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_CONTEXT_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string'
  );
}

export type WorkspaceAgentContextReport = {
  schemaVersion?: string;
  generatedAt?: string;
  agent?: string;
  workspaceSummary?: string;
  humanSummary?: string;
  modelRef?: string;
  workspace?: {
    name?: string;
    root?: string;
    type?: string;
    profile?: string;
  };
  knowledgeGraph?: {
    artifact?: string;
    schemaVersion?: string;
    available?: boolean;
    entityCount?: number;
    relationCount?: number;
    proofCount?: number;
    queryCommands?: string[];
  };
  intelligenceChain?: {
    schemaVersion?: string;
    contractPath?: string;
    currentStep?: string;
    canonicalReadOrder?: string[];
  };
  factFreshness?: {
    status?: string;
    totalFacts?: number;
    staleFacts?: number;
    unknownFacts?: number;
    liveFacts?: number;
    verifyBeforeUseFacts?: number;
  };
  safeCommands?: Array<{
    id?: string;
    scope?: string;
    display?: string;
    execute?: string;
    description?: string;
    project?: string;
  }>;
  projects?: Array<{
    name?: string;
    path?: string;
    kind?: string;
    runtime?: string;
    framework?: string;
    safeCommands?: string[];
    importantFiles?: string[];
  }>;
  agentInstructions?: string[];
  unsafeAssumptions?: string[];
  validation?: {
    status?: string;
    errors?: number;
    warnings?: number;
  };
  impactSummary?: Record<string, unknown>;
  doctorSummary?: Record<string, unknown>;
  analyzeSummary?: Record<string, unknown>;
  readinessSummary?: Record<string, unknown>;
  verifySummary?: Record<string, unknown>;
  explainSummary?: Record<string, unknown>;
  diffSummary?: Record<string, unknown>;
};

export type WorkspaceAgentContextReportReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; report: WorkspaceAgentContextReport }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export async function readWorkspaceAgentContextReport(
  workspacePath?: string
): Promise<WorkspaceAgentContextReport | null> {
  if (!workspacePath) {
    return null;
  }

  const result = await readWorkspaceAgentContextReportArtifact(workspacePath);
  return result.kind === 'valid' ? result.report : null;
}

export async function readWorkspaceAgentContextReportArtifact(
  workspacePath: string
): Promise<WorkspaceAgentContextReportReadResult> {
  const reportPath = path.join(workspacePath, WORKSPACE_CONTEXT_AGENT_REPORT_PATH);
  const result: JsonArtifactReadResult = await readJsonArtifact(reportPath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isWorkspaceAgentContextReport(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: WORKSPACE_CONTEXT_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: 'Workspace agent context artifact must include generatedAt.',
    });
  }
  return { kind: 'valid', artifactPath: result.artifactPath, report: result.raw };
}

export function buildWorkspaceAgentContextPromptSection(
  report: WorkspaceAgentContextReport | null
): string {
  if (!report) {
    return '';
  }

  const lines = ['WORKSPACE INTELLIGENCE (canonical npm agent context):'];

  if (report.workspaceSummary) {
    lines.push(`- Summary: ${report.workspaceSummary}`);
  } else if (report.humanSummary) {
    lines.push(`- Summary: ${report.humanSummary}`);
  }

  if (report.validation?.status) {
    lines.push(
      `- Validation: ${report.validation.status} (${report.validation.errors ?? 0} error, ${report.validation.warnings ?? 0} warning)`
    );
  }

  if (report.workspace?.root) {
    lines.push(`- Workspace identity: ${report.workspace.root}`);
  }

  const readOrder = Array.isArray(report.intelligenceChain?.canonicalReadOrder)
    ? report.intelligenceChain.canonicalReadOrder
    : [];
  if (readOrder.length > 0) {
    lines.push('- Canonical read order (do not preload omitted Model/Graph exports):');
    for (const artifact of readOrder.slice(0, 12)) {
      lines.push(`  • ${artifact}`);
    }
  }

  const graphCommands = Array.isArray(report.knowledgeGraph?.queryCommands)
    ? report.knowledgeGraph.queryCommands
    : [];
  if (graphCommands.length > 0) {
    lines.push('- Bounded proof-backed graph retrieval:');
    for (const command of graphCommands.slice(0, 6)) {
      lines.push(`  • ${command}`);
    }
  }

  if (report.factFreshness?.status) {
    lines.push(
      `- Fact freshness: ${report.factFreshness.status}; stale=${report.factFreshness.staleFacts ?? 0}, unknown=${report.factFreshness.unknownFacts ?? 0}, verify-before-use=${report.factFreshness.verifyBeforeUseFacts ?? 0}`
    );
  }

  const safeCommands = Array.isArray(report.safeCommands) ? report.safeCommands : [];
  if (safeCommands.length > 0) {
    lines.push('- Safe commands (use only these unless user explicitly requests otherwise):');
    for (const command of safeCommands.slice(0, 24)) {
      const label = command.display || command.id || command.execute || 'command';
      const execute = command.execute ? ` → ${command.execute}` : '';
      const scope = command.scope ? ` [${command.scope}]` : '';
      lines.push(`  • ${label}${scope}${execute}`);
    }
    if (safeCommands.length > 24) {
      lines.push(`  • … ${safeCommands.length - 24} more safe command(s)`);
    }
  }

  const projects = Array.isArray(report.projects) ? report.projects : [];
  if (projects.length > 0) {
    lines.push('- Projects in scope:');
    for (const project of projects.slice(0, 12)) {
      const fleet = Array.isArray(project.safeCommands)
        ? project.safeCommands.slice(0, 6).join(', ')
        : 'n/a';
      lines.push(
        `  • ${project.name ?? 'project'} (${project.framework ?? project.runtime ?? 'unknown'}) — safe: ${fleet}`
      );
    }
  }

  const instructions = Array.isArray(report.agentInstructions) ? report.agentInstructions : [];
  if (instructions.length > 0) {
    lines.push('- Agent instructions from workspace model:');
    for (const instruction of instructions.slice(0, 8)) {
      lines.push(`  • ${instruction}`);
    }
  }

  const unsafe = Array.isArray(report.unsafeAssumptions) ? report.unsafeAssumptions : [];
  if (unsafe.length > 0) {
    lines.push('- Unsafe assumptions (do not rely on these):');
    for (const assumption of unsafe.slice(0, 6)) {
      lines.push(`  • ${assumption}`);
    }
  }

  lines.push(
    '- Prefer the canonical context, relevant operational Skill, and bounded graph search over loading full Model or Graph exports. Load a complete export only when the task explicitly requires it.'
  );

  return lines.join('\n');
}
