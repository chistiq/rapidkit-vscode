import fs from 'fs-extra';
import path from 'path';

export type DoctorEvidenceSnapshot = {
  contract?: {
    version?: string;
    scoringPolicyVersion?: string;
    generatedBy?: string;
    deterministicScoreBreakdown?: boolean;
    scopeModel?: string;
  };
  workspaceName?: string;
  generatedAt?: string;
  driftDelta?: {
    baselineAvailable?: boolean;
    previousGeneratedAt?: string;
    newIssueCount?: number;
    resolvedIssueCount?: number;
    netIssueDelta?: number;
    scoreDeltaPercent?: number | null;
    systemStatusChanges?: Array<{
      id?: string;
      from?: string;
      to?: string;
    }>;
    regressedProjects?: string[];
    improvedProjects?: string[];
  };
  health: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    percent: number;
  };
  scopeProvenance?: {
    scopedCount?: number;
    aggregatedCount?: number;
    mixedCount?: number;
    dominantScope?: string;
  };
  scoreBreakdown?: Array<{
    id?: string;
    label?: string;
    status?: string;
    scope?: string;
    policyRuleId?: string;
    reason?: string;
  }>;
  projectCount: number;
  projectsWithIssues: number;
  issueCount: number;
  frameworks: Array<{ name: string; count: number }>;
  projects: Array<{
    name: string;
    path?: string;
    framework?: string;
    kit?: string;
    projectKind?: string;
    issues: number;
    modulesCount?: number;
    modulesHealthy?: boolean;
    hasTests?: boolean;
    hasCodeQuality?: boolean;
    vulnerabilities?: number;
    depsInstalled?: boolean;
    probes?: Array<{
      id?: string;
      label?: string;
      status?: string;
      severity?: string;
      scope?: string;
      reason?: string;
      recommendation?: string;
    }>;
    installedModules?: Array<{
      slug: string;
      version: string;
      display_name: string;
    }>;
  }>;
  fixCommands: string[];
};

type ParsedDoctorProject = {
  name: string;
  path?: string;
  framework?: string;
  kit?: string;
  projectKind?: string;
  issues: number;
  modulesCount?: number;
  modulesHealthy?: boolean;
  hasTests?: boolean;
  hasCodeQuality?: boolean;
  vulnerabilities?: number;
  depsInstalled?: boolean;
  probes?: Array<{
    id?: string;
    label?: string;
    status?: string;
    severity?: string;
    scope?: string;
    reason?: string;
    recommendation?: string;
  }>;
  installedModules: Array<{ slug: string; version: string; display_name: string }>;
  fixCommands: string[];
};

async function readInstalledModules(
  projectPath: string
): Promise<Array<{ slug: string; version: string; display_name: string }>> {
  try {
    const primaryRegistryPath = path.join(projectPath, 'registry.json');
    const legacyRegistryPath = path.join(projectPath, '.rapidkit', 'registry.json');
    const primaryExists = await fs.pathExists(primaryRegistryPath);
    const legacyExists = await fs.pathExists(legacyRegistryPath);
    const registryPath = primaryExists ? primaryRegistryPath : legacyRegistryPath;
    const exists = primaryExists || legacyExists;

    if (exists) {
      const content = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(content);
      return registry.installed_modules || [];
    }
  } catch (error) {
    console.error('[IncidentStudioDoctorEvidence] Error reading registry.json:', error);
  }
  return [];
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    if (!(await fs.pathExists(filePath))) {
      return undefined;
    }
    return (await fs.readJSON(filePath)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function parseDoctorProjectRecord(
  project: Record<string, unknown>
): Promise<ParsedDoctorProject> {
  const issues = Array.isArray(project?.issues) ? project.issues.length : 0;
  const projectPath = typeof project?.path === 'string' ? project.path : undefined;
  const installedModules = projectPath ? await readInstalledModules(projectPath) : [];
  const projectStats =
    project?.stats && typeof project.stats === 'object'
      ? (project.stats as Record<string, unknown>)
      : undefined;
  const modulesCountRaw = Number(projectStats?.modules);
  const modulesCountFromDoctor = Number.isFinite(modulesCountRaw) ? modulesCountRaw : undefined;
  const modulesCount =
    typeof modulesCountFromDoctor === 'number'
      ? modulesCountFromDoctor
      : installedModules.length > 0
        ? installedModules.length
        : undefined;
  const vulnerabilitiesRaw = Number(project?.vulnerabilities);
  const vulnerabilities = Number.isFinite(vulnerabilitiesRaw) ? vulnerabilitiesRaw : undefined;
  const probes = Array.isArray(project?.probes)
    ? project.probes
        .filter((probe: unknown) => probe && typeof probe === 'object')
        .map((probe: Record<string, unknown>) => ({
          id: typeof probe?.id === 'string' ? probe.id : undefined,
          label: typeof probe?.label === 'string' ? probe.label : undefined,
          status: typeof probe?.status === 'string' ? probe.status : undefined,
          severity: typeof probe?.severity === 'string' ? probe.severity : undefined,
          scope: typeof probe?.scope === 'string' ? probe.scope : undefined,
          reason: typeof probe?.reason === 'string' ? probe.reason : undefined,
          recommendation:
            typeof probe?.recommendation === 'string' ? probe.recommendation : undefined,
        }))
    : undefined;

  return {
    name: typeof project?.name === 'string' ? project.name : 'unknown',
    path: projectPath,
    framework: typeof project?.framework === 'string' ? project.framework : undefined,
    kit: typeof project?.kit === 'string' ? project.kit : undefined,
    projectKind: typeof project?.projectKind === 'string' ? project.projectKind : undefined,
    issues,
    modulesCount,
    modulesHealthy:
      typeof project?.modulesHealthy === 'boolean' ? project.modulesHealthy : undefined,
    hasTests: typeof project?.hasTests === 'boolean' ? project.hasTests : undefined,
    hasCodeQuality:
      typeof project?.hasCodeQuality === 'boolean' ? project.hasCodeQuality : undefined,
    vulnerabilities,
    depsInstalled: typeof project?.depsInstalled === 'boolean' ? project.depsInstalled : undefined,
    probes,
    installedModules,
    fixCommands: Array.isArray(project?.fixCommands)
      ? project.fixCommands.filter((cmd: unknown) => typeof cmd === 'string')
      : [],
  };
}

async function loadScopedProjectDoctorRaw(
  workspacePath: string,
  projectPath: string
): Promise<Record<string, unknown> | undefined> {
  const candidates = [
    path.join(projectPath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
    path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
  ];

  for (const candidate of candidates) {
    const raw = await readJsonIfExists(candidate);
    if (!raw) {
      continue;
    }
    const nestedProject =
      raw.project && typeof raw.project === 'object'
        ? (raw.project as Record<string, unknown>)
        : undefined;
    const reportProjectPath =
      typeof raw.projectPath === 'string'
        ? raw.projectPath
        : typeof nestedProject?.path === 'string'
          ? nestedProject.path
          : undefined;
    if (reportProjectPath && path.resolve(reportProjectPath) !== path.resolve(projectPath)) {
      continue;
    }
    return raw;
  }

  return undefined;
}

export async function readDoctorEvidenceSnapshot(
  workspacePath?: string,
  options?: { projectPath?: string }
): Promise<DoctorEvidenceSnapshot | undefined> {
  if (!workspacePath) {
    return undefined;
  }

  const evidencePath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
  const workspaceRaw = await readJsonIfExists(evidencePath);
  const scopedProjectPath = options?.projectPath?.trim();
  const scopedProjectRaw = scopedProjectPath
    ? await loadScopedProjectDoctorRaw(workspacePath, scopedProjectPath)
    : undefined;

  const raw = workspaceRaw ?? scopedProjectRaw;
  if (!raw) {
    return undefined;
  }

  try {
    const healthScoreSource =
      scopedProjectRaw?.healthScore && typeof scopedProjectRaw.healthScore === 'object'
        ? (scopedProjectRaw.healthScore as Record<string, unknown>)
        : raw.healthScore && typeof raw.healthScore === 'object'
          ? (raw.healthScore as Record<string, unknown>)
          : undefined;
    const total = Number(healthScoreSource?.total ?? 0);
    const passed = Number(healthScoreSource?.passed ?? 0);
    const warnings = Number(healthScoreSource?.warnings ?? 0);
    const errors = Number(healthScoreSource?.errors ?? 0);
    const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

    const projectsRaw = Array.isArray(raw?.projects) ? raw.projects : [];
    const projects: ParsedDoctorProject[] = (
      await Promise.all(
        projectsRaw.map(async (project: Record<string, unknown>) =>
          parseDoctorProjectRecord(project)
        )
      )
    ).filter((project: ParsedDoctorProject) => project.name.length > 0);

    if (scopedProjectRaw?.project && typeof scopedProjectRaw.project === 'object') {
      const scopedProject = await parseDoctorProjectRecord(
        scopedProjectRaw.project as Record<string, unknown>
      );
      const index = projects.findIndex(
        (project) =>
          (scopedProject.path && project.path === scopedProject.path) ||
          project.name === scopedProject.name
      );
      if (index >= 0) {
        projects[index] = scopedProject;
      } else {
        projects.push(scopedProject);
      }
    }

    const frameworkMap = new Map<string, number>();
    for (const project of projects) {
      const key = project.framework?.trim() || 'unknown';
      frameworkMap.set(key, (frameworkMap.get(key) ?? 0) + 1);
    }

    const frameworks = [...frameworkMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const fixCommands = projects
      .flatMap((project: ParsedDoctorProject) => project.fixCommands)
      .slice(0, 8);

    const issueCount = projects.reduce(
      (acc: number, project: ParsedDoctorProject) => acc + project.issues,
      0
    );
    const projectsWithIssues = projects.filter(
      (project: ParsedDoctorProject) => project.issues > 0
    ).length;

    const contractRaw =
      scopedProjectRaw?.contract && typeof scopedProjectRaw.contract === 'object'
        ? (scopedProjectRaw.contract as Record<string, unknown>)
        : raw?.contract && typeof raw.contract === 'object'
          ? (raw.contract as Record<string, unknown>)
          : undefined;
    const driftDeltaRaw =
      scopedProjectRaw?.driftDelta && typeof scopedProjectRaw.driftDelta === 'object'
        ? (scopedProjectRaw.driftDelta as Record<string, unknown>)
        : raw?.driftDelta && typeof raw.driftDelta === 'object'
          ? (raw.driftDelta as Record<string, unknown>)
          : undefined;
    const summaryRaw =
      scopedProjectRaw?.summary && typeof scopedProjectRaw.summary === 'object'
        ? (scopedProjectRaw.summary as Record<string, unknown>)
        : raw?.summary && typeof raw.summary === 'object'
          ? (raw.summary as Record<string, unknown>)
          : undefined;
    const scoreBreakdownRaw = Array.isArray(scopedProjectRaw?.scoreBreakdown)
      ? scopedProjectRaw.scoreBreakdown
      : Array.isArray(raw?.scoreBreakdown)
        ? raw.scoreBreakdown
        : undefined;

    return {
      contract: contractRaw
        ? {
            version: typeof contractRaw.version === 'string' ? contractRaw.version : undefined,
            scoringPolicyVersion:
              typeof contractRaw.scoringPolicyVersion === 'string'
                ? contractRaw.scoringPolicyVersion
                : undefined,
            generatedBy:
              typeof contractRaw.generatedBy === 'string' ? contractRaw.generatedBy : undefined,
            deterministicScoreBreakdown:
              typeof contractRaw.deterministicScoreBreakdown === 'boolean'
                ? contractRaw.deterministicScoreBreakdown
                : undefined,
            scopeModel:
              typeof contractRaw.scopeModel === 'string' ? contractRaw.scopeModel : undefined,
          }
        : undefined,
      workspaceName: typeof raw?.workspaceName === 'string' ? raw.workspaceName : undefined,
      generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : undefined,
      driftDelta: driftDeltaRaw
        ? {
            baselineAvailable:
              typeof driftDeltaRaw.baselineAvailable === 'boolean'
                ? driftDeltaRaw.baselineAvailable
                : undefined,
            previousGeneratedAt:
              typeof driftDeltaRaw.previousGeneratedAt === 'string'
                ? driftDeltaRaw.previousGeneratedAt
                : undefined,
            newIssueCount: Number.isFinite(Number(driftDeltaRaw.newIssueCount))
              ? Number(driftDeltaRaw.newIssueCount)
              : undefined,
            resolvedIssueCount: Number.isFinite(Number(driftDeltaRaw.resolvedIssueCount))
              ? Number(driftDeltaRaw.resolvedIssueCount)
              : undefined,
            netIssueDelta: Number.isFinite(Number(driftDeltaRaw.netIssueDelta))
              ? Number(driftDeltaRaw.netIssueDelta)
              : undefined,
            scoreDeltaPercent:
              driftDeltaRaw.scoreDeltaPercent === null ||
              Number.isFinite(Number(driftDeltaRaw.scoreDeltaPercent))
                ? driftDeltaRaw.scoreDeltaPercent === null
                  ? null
                  : Number(driftDeltaRaw.scoreDeltaPercent)
                : undefined,
            systemStatusChanges: Array.isArray(driftDeltaRaw.systemStatusChanges)
              ? driftDeltaRaw.systemStatusChanges
                  .filter((entry: unknown) => entry && typeof entry === 'object')
                  .map((entry: Record<string, unknown>) => ({
                    id: typeof entry?.id === 'string' ? entry.id : undefined,
                    from: typeof entry?.from === 'string' ? entry.from : undefined,
                    to: typeof entry?.to === 'string' ? entry.to : undefined,
                  }))
              : undefined,
            regressedProjects: Array.isArray(driftDeltaRaw.regressedProjects)
              ? driftDeltaRaw.regressedProjects.filter(
                  (entry: unknown) => typeof entry === 'string'
                )
              : undefined,
            improvedProjects: Array.isArray(driftDeltaRaw.improvedProjects)
              ? driftDeltaRaw.improvedProjects.filter((entry: unknown) => typeof entry === 'string')
              : undefined,
          }
        : undefined,
      health: {
        total,
        passed,
        warnings,
        errors,
        percent,
      },
      scopeProvenance:
        summaryRaw?.scopeProvenance && typeof summaryRaw.scopeProvenance === 'object'
          ? {
              scopedCount: Number.isFinite(
                Number((summaryRaw.scopeProvenance as Record<string, unknown>).scopedCount)
              )
                ? Number((summaryRaw.scopeProvenance as Record<string, unknown>).scopedCount)
                : undefined,
              aggregatedCount: Number.isFinite(
                Number((summaryRaw.scopeProvenance as Record<string, unknown>).aggregatedCount)
              )
                ? Number((summaryRaw.scopeProvenance as Record<string, unknown>).aggregatedCount)
                : undefined,
              mixedCount: Number.isFinite(
                Number((summaryRaw.scopeProvenance as Record<string, unknown>).mixedCount)
              )
                ? Number((summaryRaw.scopeProvenance as Record<string, unknown>).mixedCount)
                : undefined,
              dominantScope:
                typeof (summaryRaw.scopeProvenance as Record<string, unknown>).dominantScope ===
                'string'
                  ? ((summaryRaw.scopeProvenance as Record<string, unknown>)
                      .dominantScope as string)
                  : undefined,
            }
          : undefined,
      scoreBreakdown: Array.isArray(scoreBreakdownRaw)
        ? scoreBreakdownRaw
            .filter((entry: unknown) => entry && typeof entry === 'object')
            .map((entry: Record<string, unknown>) => ({
              id: typeof entry?.id === 'string' ? entry.id : undefined,
              label: typeof entry?.label === 'string' ? entry.label : undefined,
              status: typeof entry?.status === 'string' ? entry.status : undefined,
              scope: typeof entry?.scope === 'string' ? entry.scope : undefined,
              policyRuleId:
                typeof entry?.policyRuleId === 'string' ? entry.policyRuleId : undefined,
              reason: typeof entry?.reason === 'string' ? entry.reason : undefined,
            }))
        : undefined,
      projectCount: projects.length,
      projectsWithIssues,
      issueCount,
      frameworks,
      projects: projects.map(
        ({
          name,
          path: projectPath,
          framework,
          kit,
          projectKind,
          issues,
          modulesCount,
          modulesHealthy,
          hasTests,
          hasCodeQuality,
          vulnerabilities,
          depsInstalled,
          probes,
          installedModules,
        }: ParsedDoctorProject) => ({
          name,
          path: projectPath,
          framework,
          kit,
          projectKind,
          issues,
          modulesCount,
          modulesHealthy,
          hasTests,
          hasCodeQuality,
          vulnerabilities,
          depsInstalled,
          probes,
          installedModules,
        })
      ),
      fixCommands,
    };
  } catch {
    return undefined;
  }
}
