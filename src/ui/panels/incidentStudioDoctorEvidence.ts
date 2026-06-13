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
    issues: number;
    modulesCount?: number;
    modulesHealthy?: boolean;
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
  issues: number;
  modulesCount?: number;
  modulesHealthy?: boolean;
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

export async function readDoctorEvidenceSnapshot(
  workspacePath?: string
): Promise<DoctorEvidenceSnapshot | undefined> {
  if (!workspacePath) {
    return undefined;
  }

  const evidencePath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
  try {
    if (!(await fs.pathExists(evidencePath))) {
      return undefined;
    }

    const raw = await fs.readJSON(evidencePath);
    const total = Number(raw?.healthScore?.total ?? 0);
    const passed = Number(raw?.healthScore?.passed ?? 0);
    const warnings = Number(raw?.healthScore?.warnings ?? 0);
    const errors = Number(raw?.healthScore?.errors ?? 0);
    const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

    const projectsRaw = Array.isArray(raw?.projects) ? raw.projects : [];
    const projects: ParsedDoctorProject[] = (
      await Promise.all(
        projectsRaw.map(async (project: Record<string, unknown>) => {
          const issues = Array.isArray(project?.issues) ? project.issues.length : 0;
          const projectPath = typeof project?.path === 'string' ? project.path : undefined;
          const installedModules = projectPath ? await readInstalledModules(projectPath) : [];
          const projectStats =
            project?.stats && typeof project.stats === 'object'
              ? (project.stats as Record<string, unknown>)
              : undefined;
          const modulesCountRaw = Number(projectStats?.modules);
          const modulesCountFromDoctor = Number.isFinite(modulesCountRaw)
            ? modulesCountRaw
            : undefined;
          const modulesCount =
            typeof modulesCountFromDoctor === 'number'
              ? modulesCountFromDoctor
              : installedModules.length > 0
                ? installedModules.length
                : undefined;
          const vulnerabilitiesRaw = Number(project?.vulnerabilities);
          const vulnerabilities = Number.isFinite(vulnerabilitiesRaw)
            ? vulnerabilitiesRaw
            : undefined;
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
            issues,
            modulesCount,
            modulesHealthy:
              typeof project?.modulesHealthy === 'boolean' ? project.modulesHealthy : undefined,
            vulnerabilities,
            depsInstalled:
              typeof project?.depsInstalled === 'boolean' ? project.depsInstalled : undefined,
            probes,
            installedModules,
            fixCommands: Array.isArray(project?.fixCommands)
              ? project.fixCommands.filter((cmd: unknown) => typeof cmd === 'string')
              : [],
          };
        })
      )
    ).filter((project: ParsedDoctorProject) => project.name.length > 0);

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

    return {
      contract:
        raw?.contract && typeof raw.contract === 'object'
          ? {
              version: typeof raw.contract.version === 'string' ? raw.contract.version : undefined,
              scoringPolicyVersion:
                typeof raw.contract.scoringPolicyVersion === 'string'
                  ? raw.contract.scoringPolicyVersion
                  : undefined,
              generatedBy:
                typeof raw.contract.generatedBy === 'string' ? raw.contract.generatedBy : undefined,
              deterministicScoreBreakdown:
                typeof raw.contract.deterministicScoreBreakdown === 'boolean'
                  ? raw.contract.deterministicScoreBreakdown
                  : undefined,
              scopeModel:
                typeof raw.contract.scopeModel === 'string' ? raw.contract.scopeModel : undefined,
            }
          : undefined,
      workspaceName: typeof raw?.workspaceName === 'string' ? raw.workspaceName : undefined,
      generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : undefined,
      driftDelta:
        raw?.driftDelta && typeof raw.driftDelta === 'object'
          ? {
              baselineAvailable:
                typeof raw.driftDelta.baselineAvailable === 'boolean'
                  ? raw.driftDelta.baselineAvailable
                  : undefined,
              previousGeneratedAt:
                typeof raw.driftDelta.previousGeneratedAt === 'string'
                  ? raw.driftDelta.previousGeneratedAt
                  : undefined,
              newIssueCount: Number.isFinite(Number(raw.driftDelta.newIssueCount))
                ? Number(raw.driftDelta.newIssueCount)
                : undefined,
              resolvedIssueCount: Number.isFinite(Number(raw.driftDelta.resolvedIssueCount))
                ? Number(raw.driftDelta.resolvedIssueCount)
                : undefined,
              netIssueDelta: Number.isFinite(Number(raw.driftDelta.netIssueDelta))
                ? Number(raw.driftDelta.netIssueDelta)
                : undefined,
              scoreDeltaPercent:
                raw.driftDelta.scoreDeltaPercent === null ||
                Number.isFinite(Number(raw.driftDelta.scoreDeltaPercent))
                  ? raw.driftDelta.scoreDeltaPercent === null
                    ? null
                    : Number(raw.driftDelta.scoreDeltaPercent)
                  : undefined,
              systemStatusChanges: Array.isArray(raw.driftDelta.systemStatusChanges)
                ? raw.driftDelta.systemStatusChanges
                    .filter((entry: unknown) => entry && typeof entry === 'object')
                    .map((entry: Record<string, unknown>) => ({
                      id: typeof entry?.id === 'string' ? entry.id : undefined,
                      from: typeof entry?.from === 'string' ? entry.from : undefined,
                      to: typeof entry?.to === 'string' ? entry.to : undefined,
                    }))
                : undefined,
              regressedProjects: Array.isArray(raw.driftDelta.regressedProjects)
                ? raw.driftDelta.regressedProjects.filter(
                    (entry: unknown) => typeof entry === 'string'
                  )
                : undefined,
              improvedProjects: Array.isArray(raw.driftDelta.improvedProjects)
                ? raw.driftDelta.improvedProjects.filter(
                    (entry: unknown) => typeof entry === 'string'
                  )
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
        raw?.summary?.scopeProvenance && typeof raw.summary.scopeProvenance === 'object'
          ? {
              scopedCount: Number.isFinite(Number(raw.summary.scopeProvenance.scopedCount))
                ? Number(raw.summary.scopeProvenance.scopedCount)
                : undefined,
              aggregatedCount: Number.isFinite(Number(raw.summary.scopeProvenance.aggregatedCount))
                ? Number(raw.summary.scopeProvenance.aggregatedCount)
                : undefined,
              mixedCount: Number.isFinite(Number(raw.summary.scopeProvenance.mixedCount))
                ? Number(raw.summary.scopeProvenance.mixedCount)
                : undefined,
              dominantScope:
                typeof raw.summary.scopeProvenance.dominantScope === 'string'
                  ? raw.summary.scopeProvenance.dominantScope
                  : undefined,
            }
          : undefined,
      scoreBreakdown: Array.isArray(raw?.scoreBreakdown)
        ? raw.scoreBreakdown
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
          issues,
          modulesCount,
          modulesHealthy,
          vulnerabilities,
          depsInstalled,
          probes,
          installedModules,
        }: ParsedDoctorProject) => ({
          name,
          path: projectPath,
          framework,
          kit,
          issues,
          modulesCount,
          modulesHealthy,
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
