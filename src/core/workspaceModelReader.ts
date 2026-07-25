import * as path from 'path';

import type { AnalyzeEvidenceSlice, AnalyzeProjectEvidenceSlice } from './aiArchitectureGrounding';
import type { ProjectArchitectureFingerprint } from './aiWorkspaceArchitectureAtlas';
import { resolveKitId } from './aiKitArchitectureCatalog';
import {
  WORKSPACE_MODEL_REPORT_PATH,
  workspaceArtifactCandidates,
} from './workspaceIntelligencePaths';
import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';

export const WORKSPACE_MODEL_SCHEMA_VERSION = 'workspace-model.v1';

export function isWorkspaceModelReport(value: unknown): value is WorkspaceModelReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_MODEL_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string' &&
    Array.isArray(record.projects)
  );
}

export type WorkspaceModelProjectReport = {
  name: string;
  path: string;
  absolutePath?: string;
  kind?: string;
  runtime?: string;
  framework?: string;
  frameworkDisplayName?: string;
  kit?: string;
  moduleSupport?: boolean;
  supportTier?: string;
  generator?: {
    kit?: string;
    displayName?: string;
  };
  commands?: {
    fleetStages?: string[];
    supported?: string[];
  };
  importantFiles?: string[];
};

export type WorkspaceModelReport = {
  schemaVersion?: string;
  generatedAt?: string;
  workspace?: {
    name?: string;
    root?: string;
    type?: string;
    profile?: string;
  };
  identity?: {
    runtimeFamilies?: string[];
    workspaceType?: string;
  };
  summary?: {
    projectCount?: number;
    frameworks?: string[];
    runtimes?: string[];
  };
  projects?: WorkspaceModelProjectReport[];
  validation?: {
    status?: string;
    errors?: number;
    warnings?: number;
  };
};

export type WorkspaceModelReportReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; report: WorkspaceModelReport }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export function resolveWorkspaceModelProjectAbsolutePath(
  workspacePath: string,
  project: WorkspaceModelProjectReport
): string {
  if (project.absolutePath?.trim()) {
    return path.resolve(project.absolutePath.trim());
  }
  return path.resolve(workspacePath, project.path);
}

export async function readWorkspaceModelReport(
  workspacePath?: string
): Promise<WorkspaceModelReport | null> {
  const result = await readWorkspaceModelReportArtifact(workspacePath);
  return result.kind === 'valid' ? result.report : null;
}

export async function readWorkspaceModelReportArtifact(
  workspacePath?: string
): Promise<WorkspaceModelReportReadResult> {
  const reportPath = path.join(workspacePath ?? '', WORKSPACE_MODEL_REPORT_PATH);
  if (!workspacePath) {
    return { kind: 'missing', artifactPath: reportPath };
  }

  for (const relativePath of workspaceArtifactCandidates(WORKSPACE_MODEL_REPORT_PATH)) {
    const result: JsonArtifactReadResult = await readJsonArtifact(
      path.join(workspacePath, relativePath)
    );
    if (result.kind === 'missing') {
      continue;
    }
    if (isJsonArtifactReadFailure(result)) {
      return result;
    }
    if (!isWorkspaceModelReport(result.raw)) {
      return incompatibleJsonArtifact({
        artifactPath: result.artifactPath,
        expectedSchemaVersion: WORKSPACE_MODEL_SCHEMA_VERSION,
        actualSchemaVersion: result.raw.schemaVersion,
        reason: 'Workspace model artifact must include generatedAt and projects[].',
      });
    }
    return { kind: 'valid', artifactPath: result.artifactPath, report: result.raw };
  }
  return { kind: 'missing', artifactPath: reportPath };
}

export function workspaceModelToAnalyzeEvidenceSlice(
  workspacePath: string,
  model: WorkspaceModelReport
): AnalyzeEvidenceSlice {
  const projects = (model.projects ?? []).map((project): AnalyzeProjectEvidenceSlice => {
    const absolutePath = resolveWorkspaceModelProjectAbsolutePath(workspacePath, project);
    return {
      name: project.name,
      path: absolutePath,
      relativePath: project.path,
      runtime: project.runtime ?? 'unknown',
      framework: project.frameworkDisplayName ?? project.framework ?? project.runtime ?? 'unknown',
      confidence: 'high',
      hasRapidKitMarker: true,
      hasTests: (project.commands?.fleetStages ?? []).includes('test'),
      hasDockerfile: (project.importantFiles ?? []).some((file) =>
        file.toLowerCase().includes('dockerfile')
      ),
      hasHealthEndpoint: false,
      hasCiConfig: false,
      findingCount: 0,
    };
  });

  return {
    generatedAt: model.generatedAt ?? '',
    workspacePath,
    verdict: model.validation?.status === 'failed' ? 'blocked' : 'ready',
    score: model.validation?.status === 'failed' ? 0 : 100,
    projectCount: model.summary?.projectCount ?? projects.length,
    projects,
    workspaceFindings: [],
  };
}

export function workspaceModelProjectToAtlasFingerprint(
  workspacePath: string,
  project: WorkspaceModelProjectReport
): ProjectArchitectureFingerprint {
  const resolvedPath = resolveWorkspaceModelProjectAbsolutePath(workspacePath, project);
  const kit =
    resolveKitId(project.kit ?? project.generator?.kit ?? project.framework ?? 'unknown') ??
    project.kit ??
    project.generator?.kit ??
    'unknown';

  return {
    name: project.name,
    path: resolvedPath,
    relativePath: project.path,
    kit,
    runtime: project.runtime ?? 'unknown',
    framework: project.frameworkDisplayName ?? project.framework ?? project.runtime ?? 'unknown',
    moduleSupport: project.moduleSupport === true,
    installedModuleCount: 0,
    installedModuleSlugs: [],
    entryPoints: (project.importantFiles ?? []).slice(0, 4),
    hasRapidKitMarker: true,
    hasExamplesDir: false,
    hasDomainLayer: kit === 'fastapi.ddd',
    hasDockerfile: (project.importantFiles ?? []).some((file) =>
      file.toLowerCase().includes('dockerfile')
    ),
    hasTests: (project.commands?.fleetStages ?? []).includes('test'),
    source: 'merged',
  };
}

export function buildWorkspaceModelPromptSection(report: WorkspaceModelReport | null): string {
  if (!report) {
    return '';
  }

  const lines = ['WORKSPACE MODEL (canonical npm workspace-model.v1):'];
  lines.push(
    `- Workspace: ${report.workspace?.name ?? 'unknown'} (${report.workspace?.type ?? 'unknown'})`
  );
  lines.push(`- Projects: ${report.summary?.projectCount ?? report.projects?.length ?? 0}`);
  if (report.identity?.workspaceType) {
    lines.push(`- Workspace type: ${report.identity.workspaceType}`);
  }
  if ((report.identity?.runtimeFamilies ?? []).length > 0) {
    lines.push(`- Runtime families: ${report.identity?.runtimeFamilies?.join(', ')}`);
  }
  if ((report.summary?.frameworks ?? []).length > 0) {
    lines.push(`- Frameworks: ${report.summary?.frameworks?.join(', ')}`);
  }
  if (report.validation?.status) {
    lines.push(
      `- Model validation: ${report.validation.status} (${report.validation.errors ?? 0} error, ${report.validation.warnings ?? 0} warning)`
    );
  }

  const projects = report.projects ?? [];
  if (projects.length > 0) {
    lines.push('- Canonical project inventory:');
    for (const project of projects.slice(0, 12)) {
      const kit = project.kit ?? project.generator?.kit ?? 'unknown';
      const stages = (project.commands?.fleetStages ?? []).join(', ') || 'none';
      lines.push(
        `  • ${project.name} | kind=${project.kind ?? 'unknown'} | runtime=${project.runtime ?? 'unknown'} | framework=${project.framework ?? 'unknown'} | kit=${kit} | fleet=${stages}`
      );
      lines.push(`    path=${project.path}`);
    }
  }

  lines.push(
    '- Prefer workspace model facts over heuristic scans when both are present. Refresh with `workspai workspace model --json --write`.'
  );

  return lines.join('\n');
}
