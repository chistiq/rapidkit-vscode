import fs from 'fs-extra';
import path from 'node:path';

export type StudioDependencyPackageManager = 'npm' | 'pnpm' | 'yarn';

export type StudioDependencySecurityTarget = {
  projectName: string;
  projectPath: string;
  vulnerabilities: number;
  packageManager: StudioDependencyPackageManager;
  sourceFiles: string[];
};

export type StudioDependencyRepairAttempt = {
  blockerSignature?: string;
  evidenceGeneration: string;
  count: number;
};

export type StudioDependencyUpgradeCandidate = {
  packageName: string;
  currentRange: string;
  severity?: string;
  vulnerableRange?: string;
  auditFixVersion?: string;
  auditFixIsSemVerMajor?: boolean;
  targetVersion?: string;
  disposition:
    | 'safe-upgrade'
    | 'compatible-resolution'
    | 'breaking-change'
    | 'downgrade-only'
    | 'no-exact-fix';
  autoExecutable: boolean;
};

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const SAFE_VERSION_SPEC_PATTERN =
  /^(?:v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?|[~^]v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactSemver(value: string | undefined): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value?.trim() ?? '');
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function dependencyFixDisposition(input: {
  currentRange: string;
  fixVersion?: string;
  isSemVerMajor?: boolean;
  packageManagerCanResolve?: boolean;
}): Pick<StudioDependencyUpgradeCandidate, 'targetVersion' | 'disposition' | 'autoExecutable'> {
  if (!input.fixVersion) {
    if (
      input.packageManagerCanResolve === true &&
      /^[~^]v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(input.currentRange.trim())
    ) {
      return {
        targetVersion: input.currentRange.trim(),
        disposition: 'compatible-resolution',
        autoExecutable: true,
      };
    }
    return { disposition: 'no-exact-fix', autoExecutable: false };
  }
  const current = exactSemver(input.currentRange);
  const target = exactSemver(input.fixVersion);
  if (current && target && compareSemver(target, current) < 0) {
    return {
      targetVersion: input.fixVersion,
      disposition: 'downgrade-only',
      autoExecutable: false,
    };
  }
  if (input.isSemVerMajor === true) {
    return {
      targetVersion: input.fixVersion,
      disposition: 'breaking-change',
      autoExecutable: false,
    };
  }
  return {
    targetVersion: input.fixVersion,
    disposition: 'safe-upgrade',
    autoExecutable: current && target ? compareSemver(target, current) !== 0 : true,
  };
}

export async function parseStudioDependencyUpgradeCandidates(input: {
  target: StudioDependencySecurityTarget;
  auditJson: string;
}): Promise<StudioDependencyUpgradeCandidate[]> {
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(input.auditJson) as Record<string, unknown>;
  } catch {
    throw new Error('Dependency audit did not return parseable JSON upgrade evidence.');
  }
  const manifest = (await fs.readJson(path.join(input.target.projectPath, 'package.json'))) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const direct = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
  const vulnerabilities = record(report.vulnerabilities) ?? {};
  return Object.entries(vulnerabilities).flatMap(([key, raw]) => {
    const vulnerability = record(raw);
    const packageName =
      typeof vulnerability?.name === 'string' ? vulnerability.name.trim() : key.trim();
    const currentRange = direct[packageName];
    const fix = record(vulnerability?.fixAvailable);
    if (
      !vulnerability ||
      vulnerability.isDirect !== true ||
      !currentRange ||
      !PACKAGE_NAME_PATTERN.test(packageName) ||
      (!fix && vulnerability.fixAvailable !== true)
    ) {
      return [];
    }
    const auditFixVersion = typeof fix?.version === 'string' ? fix.version : undefined;
    return [
      {
        packageName,
        currentRange,
        ...(typeof vulnerability.severity === 'string' ? { severity: vulnerability.severity } : {}),
        ...(typeof vulnerability.range === 'string'
          ? { vulnerableRange: vulnerability.range }
          : {}),
        ...(auditFixVersion ? { auditFixVersion } : {}),
        ...(typeof fix?.isSemVerMajor === 'boolean'
          ? { auditFixIsSemVerMajor: fix.isSemVerMajor }
          : {}),
        ...dependencyFixDisposition({
          currentRange,
          fixVersion: auditFixVersion,
          isSemVerMajor: typeof fix?.isSemVerMajor === 'boolean' ? fix.isSemVerMajor : undefined,
          packageManagerCanResolve: vulnerability.fixAvailable === true,
        }),
      },
    ];
  });
}

export function buildStudioDependencyUpgradeCommand(input: {
  target: StudioDependencySecurityTarget;
  candidate: StudioDependencyUpgradeCandidate;
}): string {
  if (!PACKAGE_NAME_PATTERN.test(input.candidate.packageName)) {
    throw new Error('Dependency upgrade package name is invalid.');
  }
  if (
    !input.candidate.targetVersion ||
    !SAFE_VERSION_SPEC_PATTERN.test(input.candidate.targetVersion)
  ) {
    throw new Error('Dependency upgrade target version is invalid or unbounded.');
  }
  if (!input.candidate.autoExecutable || !input.candidate.targetVersion) {
    throw new Error(
      `Dependency remediation is not safe for automatic execution: ${input.candidate.disposition}.`
    );
  }
  const spec = `${input.candidate.packageName}@${input.candidate.targetVersion}`;
  if (input.target.packageManager === 'npm') {
    return `npm install ${spec} --save-exact`;
  }
  if (input.target.packageManager === 'pnpm') {
    return `pnpm add ${spec} --save-exact`;
  }
  return `yarn add ${spec} --exact`;
}

export function dependencyRepairAttemptsForGeneration(input: {
  prior?: StudioDependencyRepairAttempt;
  blockerSignature?: string;
  evidenceGeneration: string;
}): number {
  const prior = input.prior;
  return prior &&
    prior.blockerSignature === input.blockerSignature &&
    prior.evidenceGeneration === input.evidenceGeneration
    ? prior.count
    : 0;
}

type DoctorProject = {
  name?: unknown;
  path?: unknown;
  vulnerabilities?: unknown;
  probes?: unknown;
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function packageManagerFor(projectPath: string): Promise<{
  packageManager: StudioDependencyPackageManager;
  sourceFiles: string[];
}> {
  const candidates = [
    { file: 'package-lock.json', packageManager: 'npm' as const },
    { file: 'pnpm-lock.yaml', packageManager: 'pnpm' as const },
    { file: 'yarn.lock', packageManager: 'yarn' as const },
  ];
  const sourceFiles = ['package.json'];
  for (const candidate of candidates) {
    if (await fs.pathExists(path.join(projectPath, candidate.file))) {
      sourceFiles.push(candidate.file);
      return { packageManager: candidate.packageManager, sourceFiles };
    }
  }
  if (await fs.pathExists(path.join(projectPath, 'package.json'))) {
    return { packageManager: 'npm', sourceFiles };
  }
  throw new Error('Dependency security target has no supported Node manifest.');
}

export async function resolveStudioDependencySecurityTargetFromProject(input: {
  projectPath: string;
  projectName?: string;
  vulnerabilities?: number;
}): Promise<StudioDependencySecurityTarget> {
  const projectPath = path.resolve(input.projectPath);
  const manager = await packageManagerFor(projectPath);
  return {
    projectName: input.projectName?.trim() || path.basename(projectPath),
    projectPath,
    vulnerabilities: Math.max(0, input.vulnerabilities ?? 0),
    ...manager,
  };
}

export async function resolveStudioDependencySecurityTargets(input: {
  workspacePath: string;
}): Promise<StudioDependencySecurityTarget[]> {
  const reportPath = path.join(input.workspacePath, '.workspai', 'reports', 'doctor-last-run.json');
  const report = (await fs.readJson(reportPath)) as { projects?: DoctorProject[] };
  const vulnerable = (Array.isArray(report.projects) ? report.projects : []).filter((project) => {
    if (typeof project.name !== 'string' || typeof project.path !== 'string') {
      return false;
    }
    if (!isInside(input.workspacePath, project.path)) {
      return false;
    }
    if (typeof project.vulnerabilities !== 'number' || project.vulnerabilities <= 0) {
      return false;
    }
    const probes = Array.isArray(project.probes) ? project.probes : [];
    return probes.some((probe) => {
      const value = probe as {
        id?: unknown;
        status?: unknown;
        freshness?: { status?: unknown; expiresAt?: unknown };
      };
      const expiresAt =
        typeof value.freshness?.expiresAt === 'string'
          ? Date.parse(value.freshness.expiresAt)
          : Number.NaN;
      return (
        value.id === 'surface-security-hygiene' &&
        value.status === 'fail' &&
        value.freshness?.status === 'fresh' &&
        Number.isFinite(expiresAt) &&
        expiresAt > Date.now()
      );
    });
  });
  return Promise.all(
    vulnerable.map(async (project) => {
      const projectName = project.name as string;
      const projectPath = project.path as string;
      return resolveStudioDependencySecurityTargetFromProject({
        projectName,
        projectPath,
        vulnerabilities: project.vulnerabilities as number,
      });
    })
  );
}

export async function resolveStudioDependencySecurityTarget(input: {
  workspacePath: string;
  projectName?: string;
}): Promise<StudioDependencySecurityTarget> {
  const vulnerable = await resolveStudioDependencySecurityTargets({
    workspacePath: input.workspacePath,
  });
  const selected = input.projectName
    ? vulnerable.find((project) => project.projectName === input.projectName)
    : vulnerable.length === 1
      ? vulnerable[0]
      : undefined;
  if (!selected) {
    throw new Error(
      input.projectName
        ? `No fresh dependency-security blocker exists for project ${input.projectName}. Refresh Doctor evidence first.`
        : vulnerable.length === 0
          ? 'No fresh dependency-security blocker exists. Refresh Doctor evidence first.'
          : 'Project name is required when more than one dependency-security blocker exists.'
    );
  }
  return selected;
}

export function buildStudioDependencySecurityCommand(
  target: StudioDependencySecurityTarget,
  action: 'inspect' | 'repair'
): string {
  if (target.packageManager === 'npm') {
    return action === 'inspect' ? 'npm audit --json' : 'npm audit fix --audit-level=moderate';
  }
  if (target.packageManager === 'pnpm') {
    return action === 'inspect' ? 'pnpm audit --json' : 'pnpm audit --fix';
  }
  if (action === 'inspect') {
    return 'yarn npm audit --json';
  }
  throw new Error(
    'Yarn does not expose a deterministic non-force audit fix. Inspect the advisory and patch the authorized manifest instead.'
  );
}
