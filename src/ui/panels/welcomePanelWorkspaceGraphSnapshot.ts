import path from 'node:path';
import fs from 'fs-extra';

import { getGitDiffStat } from '../../core/aiProjectContextUtils';
import {
  assessIncidentStudioCompleteness,
  mapCompletenessLevelToGraphFlag,
} from '../../core/incidentStudioCompleteness';
import { WORKSPACE_MODEL_DIFF_REPORT_PATH } from '../../core/workspaceIntelligencePaths';
import { readWorkspaceAgentContextReport } from '../../core/workspaceAgentContextReader';
import { readWorkspaceImpactReport } from '../../core/workspaceImpactReader';
import {
  readWorkspaceModelReport,
  resolveWorkspaceModelProjectAbsolutePath,
} from '../../core/workspaceModelReader';
import { readWorkspaceVerifyReport } from '../../core/workspaceVerifyReader';
import { WorkspaceMemoryService } from '../../core/workspaceMemoryService';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import type { DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import { loadAnalyzeReport } from './incidentStudioAnalyze';
import type { IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared.js';

export type WorkspaceGraphSnapshotOptions =
  | string
  | {
      workspacePath?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      scopeIntent?: 'workspace' | 'project';
    };

export type WorkspaceGraphSnapshotHost = {
  resolveFallbackWorkspacePath?: () => string | undefined;
  readDoctorEvidenceSnapshot: (
    workspacePath?: string,
    options?: { projectPath?: string }
  ) => Promise<DoctorEvidenceSnapshot | undefined>;
  resolveScopedProjectForWorkspace: (options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    doctorSnapshot?: DoctorEvidenceSnapshot;
  }) => Promise<{ name: string; path: string; type?: string } | null>;
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>;
  readInstalledModules: (
    projectPath: string
  ) => Promise<{ slug: string; version: string; display_name: string }[]>;
};

export async function buildWorkspaceGraphSnapshot(
  host: WorkspaceGraphSnapshotHost,
  options?: WorkspaceGraphSnapshotOptions
): Promise<IncidentWorkspaceGraphSnapshot> {
  const resolvedWorkspacePath =
    (typeof options === 'string' ? options : options?.workspacePath) ||
    host.resolveFallbackWorkspacePath?.();
  const tracker = WorkspaceUsageTracker.getInstance();
  const memoryService = WorkspaceMemoryService.getInstance();

  const explicitProjectPath =
    typeof options === 'string' ? undefined : options?.projectPath?.trim();
  const explicitProjectName = typeof options === 'string' ? undefined : options?.projectName;
  const explicitProjectType = typeof options === 'string' ? undefined : options?.projectType;
  const scopeIntent = typeof options === 'string' ? 'workspace' : options?.scopeIntent;
  const isProjectScope = Boolean(explicitProjectPath) || scopeIntent === 'project';

  const doctorSnapshot = await host.readDoctorEvidenceSnapshot(resolvedWorkspacePath, {
    projectPath: explicitProjectPath,
  });

  const selectedProject = isProjectScope
    ? await host.resolveScopedProjectForWorkspace({
        workspacePath: resolvedWorkspacePath,
        projectPath: explicitProjectPath,
        projectName: explicitProjectName,
        projectType: explicitProjectType,
        doctorSnapshot,
      })
    : null;
  const workspaceModelReport = resolvedWorkspacePath
    ? await readWorkspaceModelReport(resolvedWorkspacePath)
    : null;
  let modelFrameworkOverride: string | undefined;
  let modelKitOverride: string | undefined;
  if (selectedProject?.path && workspaceModelReport?.projects?.length) {
    const selectedAbs = path.resolve(selectedProject.path);
    const modelProject = workspaceModelReport.projects.find((entry) => {
      const abs = resolveWorkspaceModelProjectAbsolutePath(resolvedWorkspacePath as string, entry);
      return path.resolve(abs) === selectedAbs || entry.name === selectedProject.name;
    });
    if (modelProject) {
      modelFrameworkOverride = modelProject.framework?.trim() || undefined;
      modelKitOverride = modelProject.kit || modelProject.generator?.kit || undefined;
      if (modelKitOverride) {
        selectedProject.type = modelKitOverride;
      }
    }
  }
  const graphScanPath = selectedProject?.path || resolvedWorkspacePath;
  const workspaceFrameworkLabel = (() => {
    const frameworks = (doctorSnapshot?.frameworks || [])
      .map((item) =>
        String(item?.name || '')
          .trim()
          .toLowerCase()
      )
      .filter((name) => name.length > 0);
    const unique = Array.from(new Set(frameworks));
    if (unique.length === 0) {
      return 'unknown';
    }
    if (unique.length === 1) {
      return unique[0];
    }
    return 'mixed';
  })();
  const workspaceInstalledModules = (doctorSnapshot?.projects || [])
    .flatMap((project) => project.installedModules || [])
    .slice(0, 60);

  const [
    commandSummary,
    onboardingSummary,
    framework,
    workspaceMemory,
    gitDiffStat,
    installedModules,
  ] = await Promise.all([
    tracker.getCommandTelemetrySummary(resolvedWorkspacePath, 'last7d'),
    tracker.getOnboardingExperimentStats(resolvedWorkspacePath, 'last7d'),
    modelFrameworkOverride ||
      (selectedProject?.path
        ? host.inferFrameworkFromWorkspace(selectedProject.path)
        : Promise.resolve(workspaceFrameworkLabel)),
    resolvedWorkspacePath
      ? memoryService.readNearest(resolvedWorkspacePath)
      : Promise.resolve(undefined),
    graphScanPath ? getGitDiffStat(graphScanPath, 1500) : Promise.resolve(null),
    selectedProject
      ? host.readInstalledModules(selectedProject.path)
      : Promise.resolve(workspaceInstalledModules),
  ] as const);

  const hasWorkspaceMemory = Boolean(
    workspaceMemory?.context ||
    workspaceMemory?.conventions?.length ||
    workspaceMemory?.decisions?.length
  );
  const memoryPolicy = memoryService.resolvePolicy(workspaceMemory);
  const hasDoctorEvidence = Boolean(doctorSnapshot);
  const hasGitDiff = Boolean(gitDiffStat && !gitDiffStat.includes('unavailable'));
  const hasProjectScope = Boolean(selectedProject);
  const doctorGeneratedAt =
    doctorSnapshot && typeof doctorSnapshot.generatedAt === 'string'
      ? doctorSnapshot.generatedAt
      : undefined;

  const [
    analyzeArtifact,
    impactArtifact,
    verifyArtifact,
    agentContextArtifact,
    hasWorkspaceDiffArtifact,
  ] = await Promise.all([
    Promise.resolve(
      resolvedWorkspacePath
        ? loadAnalyzeReport({
            workspacePath: resolvedWorkspacePath,
            workspaceName: path.basename(resolvedWorkspacePath),
          }).report
        : null
    ),
    readWorkspaceImpactReport(resolvedWorkspacePath),
    readWorkspaceVerifyReport(resolvedWorkspacePath),
    readWorkspaceAgentContextReport(resolvedWorkspacePath),
    resolvedWorkspacePath
      ? fs.pathExists(path.join(resolvedWorkspacePath, WORKSPACE_MODEL_DIFF_REPORT_PATH))
      : Promise.resolve(false),
  ]);

  const evidenceCompletenessAssessment = assessIncidentStudioCompleteness({
    hasDoctorEvidence,
    hasGitDiff,
    hasAnalyze: Boolean(analyzeArtifact),
    hasWorkspaceModel: Boolean(workspaceModelReport),
    hasWorkspaceDiff: hasWorkspaceDiffArtifact,
    hasWorkspaceImpact: Boolean(impactArtifact),
    hasWorkspaceVerify: Boolean(verifyArtifact),
    hasAgentContext: Boolean(agentContextArtifact),
    doctorGeneratedAt: doctorGeneratedAt,
    analyzeGeneratedAt: analyzeArtifact?.generatedAt,
    modelGeneratedAt: workspaceModelReport?.generatedAt,
    impactGeneratedAt: impactArtifact?.generatedAt,
    verifyGeneratedAt: verifyArtifact?.generatedAt,
  });
  const completeness = mapCompletenessLevelToGraphFlag(evidenceCompletenessAssessment.level);

  const doctorHealth = (() => {
    if (!doctorSnapshot) {
      return undefined;
    }

    const doctorRecord = doctorSnapshot as Record<string, unknown>;
    const healthRecord =
      doctorRecord.health && typeof doctorRecord.health === 'object'
        ? (doctorRecord.health as Record<string, unknown>)
        : undefined;

    const passed = Number(healthRecord?.passed ?? doctorRecord.passed ?? 0);
    const warnings = Number(healthRecord?.warnings ?? doctorRecord.warnings ?? 0);
    const errors = Number(healthRecord?.errors ?? doctorRecord.errors ?? 0);
    const total = passed + warnings + errors;
    const percent = Number(
      healthRecord?.percent ?? (total > 0 ? Math.round((passed / total) * 100) : 0)
    );

    return {
      passed,
      warnings,
      errors,
      total,
      percent,
    };
  })();

  return {
    snapshotVersion: 'v1',
    workspace: {
      path: resolvedWorkspacePath,
      name: resolvedWorkspacePath ? path.basename(resolvedWorkspacePath) : undefined,
    },
    project: {
      framework,
      kit: selectedProject?.type || 'unknown',
      selectedProject,
    },
    topology: {
      modulesCount: installedModules.length,
      topModules: installedModules.map((module) => module.slug).slice(0, 5),
    },
    doctor: {
      hasEvidence: hasDoctorEvidence,
      generatedAt: doctorGeneratedAt,
      health: doctorHealth,
    },
    git: {
      diffStat:
        gitDiffStat || 'Git context unavailable (not a repository or git is not installed).',
      hasDiffContext: hasGitDiff,
    },
    memory: {
      context: workspaceMemory?.context,
      conventionsCount: workspaceMemory?.conventions?.length || 0,
      decisionsCount: workspaceMemory?.decisions?.length || 0,
      hasMemory: hasWorkspaceMemory,
      policyProfile: memoryPolicy.profile,
      sensitivity: memoryPolicy.sensitivity,
      localProcessingMode: memoryPolicy.localProcessingMode,
    },
    telemetry: {
      totalEvents: commandSummary?.totalEvents || 0,
      lastCommand: commandSummary?.lastCommand || null,
      onboardingFollowupClickThroughRate: onboardingSummary?.overallFollowupClickThroughRate || 0,
    },
    evidence: {
      hasDoctorEvidence,
      hasGitDiff,
      hasWorkspaceMemory,
      localProcessingMode: memoryPolicy.localProcessingMode,
      projectScoped: hasProjectScope,
      hasAnalyzeEvidence: Boolean(analyzeArtifact),
      hasWorkspaceModel: Boolean(workspaceModelReport),
      hasWorkspaceDiff: hasWorkspaceDiffArtifact,
      hasWorkspaceImpact: Boolean(impactArtifact),
      hasWorkspaceVerify: Boolean(verifyArtifact),
      hasAgentContext: Boolean(agentContextArtifact),
    },
    evidenceCompleteness: {
      level: evidenceCompletenessAssessment.level,
      score: evidenceCompletenessAssessment.score,
      missing: evidenceCompletenessAssessment.missing,
      stale: evidenceCompletenessAssessment.stale,
      recommendedNextCommand: evidenceCompletenessAssessment.recommendedNextCommand,
      summary: evidenceCompletenessAssessment.summary,
    },
    completeness,
    lastUpdatedAt: Date.now(),
  };
}
