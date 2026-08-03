import fs from 'fs-extra';
import path from 'node:path';

export type StudioDependencyPackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'deno'
  | 'pip'
  | 'go'
  | 'cargo'
  | 'composer'
  | 'bundler'
  | 'dotnet'
  | 'maven'
  | 'gradle'
  | 'mix'
  | 'unknown';

export type StudioDependencySecurityTarget = {
  projectName: string;
  projectPath: string;
  vulnerabilities: number;
  packageManager: StudioDependencyPackageManager;
  sourceFiles: string[];
  auditCommand?: string;
  repairCommand?: string;
};

export type StudioDependencyRepairAttempt = {
  blockerSignature?: string;
  evidenceGeneration: string;
  count: number;
};

export type StudioDependencyUpgradeCandidate = {
  packageName: string;
  currentRange?: string;
  currentVersion?: string;
  relationship?: 'direct' | 'transitive' | 'unknown';
  ownerPackages?: string[];
  resolutionStrategies?: Array<
    | 'direct-upgrade'
    | 'owner-upgrade'
    | 'constraint-update'
    | 'transitive-override'
    | 'replacement'
    | 'policy-exception'
    | 'upstream-wait'
  >;
  safeVersionConstraint?: string;
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

function safeVersionConstraint(vulnerableRange: unknown): string | undefined {
  if (typeof vulnerableRange !== 'string') {
    return undefined;
  }
  const range = vulnerableRange.trim();
  const exclusive = /^<\s*(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(range);
  if (exclusive) {
    return `>=${exclusive[1]}`;
  }
  const inclusive = /^<=\s*(\d+)\.(\d+)\.(\d+)$/.exec(range);
  return inclusive ? `>=${inclusive[1]}.${inclusive[2]}.${Number(inclusive[3]) + 1}` : undefined;
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
  const manifest = (await fs
    .readJson(path.join(input.target.projectPath, 'package.json'))
    .catch(() => null)) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  } | null;
  if (!manifest) {
    return [];
  }
  const direct = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
  const vulnerabilities = record(report.vulnerabilities) ?? {};
  return Object.entries(vulnerabilities).flatMap<StudioDependencyUpgradeCandidate>(([key, raw]) => {
    const vulnerability = record(raw);
    const packageName =
      typeof vulnerability?.name === 'string' ? vulnerability.name.trim() : key.trim();
    const currentRange = direct[packageName];
    const fix = record(vulnerability?.fixAvailable);
    if (!vulnerability || !PACKAGE_NAME_PATTERN.test(packageName)) {
      return [];
    }
    const relationship =
      vulnerability.isDirect === true
        ? 'direct'
        : vulnerability.isDirect === false
          ? 'transitive'
          : 'unknown';
    const ownerPackages = Array.isArray(vulnerability.effects)
      ? vulnerability.effects
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
    if (relationship !== 'direct') {
      return [
        {
          packageName,
          relationship,
          ownerPackages: [...new Set(ownerPackages)].sort(),
          resolutionStrategies: [
            ...(ownerPackages.length > 0 ? (['owner-upgrade'] as const) : []),
            'transitive-override' as const,
            'replacement' as const,
            'policy-exception' as const,
            'upstream-wait' as const,
          ],
          ...(typeof vulnerability.range === 'string'
            ? { vulnerableRange: vulnerability.range }
            : {}),
          ...(safeVersionConstraint(vulnerability.range)
            ? { safeVersionConstraint: safeVersionConstraint(vulnerability.range) }
            : {}),
          disposition: 'no-exact-fix' as const,
          autoExecutable: false,
        },
      ];
    }
    if (!currentRange || (!fix && vulnerability.fixAvailable !== true)) {
      return [];
    }
    const auditFixVersion = typeof fix?.version === 'string' ? fix.version : undefined;
    return [
      {
        packageName,
        currentRange,
        relationship,
        ownerPackages: [],
        resolutionStrategies: [
          'direct-upgrade',
          'constraint-update',
          'replacement',
          'policy-exception',
          'upstream-wait',
        ],
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
  if (input.target.packageManager !== 'yarn') {
    throw new Error(
      `${input.target.packageManager} dependency resolution requires a guarded manifest transaction; it is not a Node direct-upgrade candidate.`
    );
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
  dependencyAudit?: unknown;
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const SAFE_AUDIT_EXECUTABLES = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'python',
  'python3',
  'govulncheck',
  'cargo',
  'composer',
  'bundle-audit',
  'dotnet',
  'mix',
  'mvn',
  'gradle',
  'gradlew',
]);
const SAFE_AUDIT_ARGUMENT = /^[A-Za-z0-9_@./:=,+-]+$/;
const SAFE_AUDIT_EXECUTABLE_PATH = /^[A-Za-z0-9_@./:\\-]+$/;

function packageManagerFromAudit(value: unknown): StudioDependencyPackageManager | undefined {
  const dependencyAudit = record(value);
  const invocation = record(dependencyAudit?.invocation);
  const executable = typeof invocation?.executable === 'string' ? invocation.executable : '';
  const executableName = path
    .basename(executable)
    .toLowerCase()
    .replace(/\.exe$/, '');
  const runtime = String(dependencyAudit?.runtime ?? '').toLowerCase();
  const tool = String(dependencyAudit?.tool ?? '').toLowerCase();

  if (executableName === 'npm') {
    return 'npm';
  }
  if (executableName === 'pnpm') {
    return 'pnpm';
  }
  if (executableName === 'yarn') {
    return 'yarn';
  }
  if (executableName === 'bun') {
    return 'bun';
  }
  if (executableName === 'deno') {
    return 'deno';
  }
  if (executableName === 'python' || executableName === 'python3' || tool.includes('pip-audit')) {
    return 'pip';
  }
  if (executableName === 'govulncheck' || runtime === 'go') {
    return 'go';
  }
  if (executableName === 'cargo' || runtime === 'rust') {
    return 'cargo';
  }
  if (executableName === 'composer' || runtime === 'php') {
    return 'composer';
  }
  if (executableName === 'bundle-audit' || runtime === 'ruby') {
    return 'bundler';
  }
  if (executableName === 'dotnet' || runtime === 'dotnet') {
    return 'dotnet';
  }
  if (executableName === 'mix' || runtime === 'elixir') {
    return 'mix';
  }
  if (executableName === 'mvn') {
    return 'maven';
  }
  if (executableName === 'gradle' || executableName === 'gradlew') {
    return 'gradle';
  }
  return undefined;
}

function trustedAuditCommand(value: unknown): string | undefined {
  const dependencyAudit = record(value);
  const invocation = record(dependencyAudit?.invocation);
  const executable = typeof invocation?.executable === 'string' ? invocation.executable : '';
  const executableName = path
    .basename(executable)
    .toLowerCase()
    .replace(/\.exe$/, '');
  const args = Array.isArray(invocation?.args)
    ? invocation.args.filter((entry): entry is string => typeof entry === 'string')
    : [];
  if (
    !SAFE_AUDIT_EXECUTABLES.has(executableName) ||
    !SAFE_AUDIT_EXECUTABLE_PATH.test(executable) ||
    args.length !== (Array.isArray(invocation?.args) ? invocation.args.length : 0) ||
    args.some((entry) => !SAFE_AUDIT_ARGUMENT.test(entry))
  ) {
    return undefined;
  }
  // Preserve a governed virtual-environment or toolchain path. Falling back to
  // the basename here can silently audit a different interpreter than Doctor.
  return [executable, ...args].join(' ');
}

async function packageManagerFor(
  projectPath: string,
  dependencyAudit?: unknown
): Promise<{
  packageManager: StudioDependencyPackageManager;
  sourceFiles: string[];
  auditCommand?: string;
  repairCommand?: string;
}> {
  const preferredPackageManager = packageManagerFromAudit(dependencyAudit);
  const candidates = [
    { file: 'package-lock.json', packageManager: 'npm' as const },
    { file: 'pnpm-lock.yaml', packageManager: 'pnpm' as const },
    { file: 'yarn.lock', packageManager: 'yarn' as const },
  ];
  const sourceFiles = ['package.json'];
  for (const candidate of candidates) {
    if (
      preferredPackageManager &&
      !(['npm', 'pnpm', 'yarn'] as StudioDependencyPackageManager[]).includes(
        preferredPackageManager
      )
    ) {
      break;
    }
    if (
      preferredPackageManager &&
      (['npm', 'pnpm', 'yarn'] as StudioDependencyPackageManager[]).includes(
        preferredPackageManager
      ) &&
      candidate.packageManager !== preferredPackageManager
    ) {
      continue;
    }
    if (await fs.pathExists(path.join(projectPath, candidate.file))) {
      sourceFiles.push(candidate.file);
      const repairCommand =
        candidate.packageManager === 'npm'
          ? 'npm audit fix --audit-level=moderate'
          : candidate.packageManager === 'pnpm'
            ? 'pnpm audit --fix'
            : undefined;
      return {
        packageManager: candidate.packageManager,
        sourceFiles,
        auditCommand:
          trustedAuditCommand(dependencyAudit) ??
          (candidate.packageManager === 'npm'
            ? 'npm audit --json'
            : candidate.packageManager === 'pnpm'
              ? 'pnpm audit --json'
              : 'yarn npm audit --json'),
        ...(repairCommand ? { repairCommand } : {}),
      };
    }
  }
  if (
    (!preferredPackageManager ||
      (['npm', 'pnpm', 'yarn'] as StudioDependencyPackageManager[]).includes(
        preferredPackageManager
      )) &&
    (await fs.pathExists(path.join(projectPath, 'package.json')))
  ) {
    const packageManager =
      preferredPackageManager &&
      (['npm', 'pnpm', 'yarn'] as StudioDependencyPackageManager[]).includes(
        preferredPackageManager
      )
        ? preferredPackageManager
        : 'npm';
    return {
      packageManager,
      sourceFiles,
      auditCommand:
        trustedAuditCommand(dependencyAudit) ??
        (packageManager === 'pnpm'
          ? 'pnpm audit --json'
          : packageManager === 'yarn'
            ? 'yarn npm audit --json'
            : 'npm audit --json'),
      ...(packageManager !== 'yarn'
        ? {
            repairCommand:
              packageManager === 'pnpm'
                ? 'pnpm audit --fix'
                : 'npm audit fix --audit-level=moderate',
          }
        : {}),
    };
  }
  const topLevelFiles = await fs.readdir(projectPath).catch(() => [] as string[]);
  const dotnetProjectFiles = topLevelFiles.filter((file) =>
    /\.(?:cs|fs|vb)proj$|\.sln$/i.test(file)
  );
  const ecosystems: Array<{
    packageManager: StudioDependencyPackageManager;
    files: string[];
    auditCommand?: string;
  }> = [
    {
      packageManager: 'pip',
      files: ['pyproject.toml', 'requirements.txt', 'poetry.lock', 'uv.lock'],
    },
    { packageManager: 'go', files: ['go.mod', 'go.sum'] },
    { packageManager: 'cargo', files: ['Cargo.toml', 'Cargo.lock'] },
    { packageManager: 'composer', files: ['composer.json', 'composer.lock'] },
    { packageManager: 'bundler', files: ['Gemfile', 'Gemfile.lock'] },
    {
      packageManager: 'dotnet',
      files: ['Directory.Packages.props', 'packages.lock.json', ...dotnetProjectFiles],
    },
    { packageManager: 'maven', files: ['pom.xml'] },
    { packageManager: 'gradle', files: ['build.gradle', 'build.gradle.kts', 'gradle.lockfile'] },
    { packageManager: 'mix', files: ['mix.exs', 'mix.lock'] },
    { packageManager: 'deno', files: ['deno.json', 'deno.jsonc', 'deno.lock'] },
    { packageManager: 'bun', files: ['bun.lock', 'bun.lockb'] },
  ];
  const orderedEcosystems = preferredPackageManager
    ? [
        ...ecosystems.filter((ecosystem) => ecosystem.packageManager === preferredPackageManager),
        ...ecosystems.filter((ecosystem) => ecosystem.packageManager !== preferredPackageManager),
      ]
    : ecosystems;
  for (const ecosystem of orderedEcosystems) {
    const existing = [];
    for (const file of ecosystem.files) {
      if (await fs.pathExists(path.join(projectPath, file))) {
        existing.push(file);
      }
    }
    if (existing.length > 0) {
      return {
        packageManager: ecosystem.packageManager,
        sourceFiles: existing,
        ...(trustedAuditCommand(dependencyAudit)
          ? { auditCommand: trustedAuditCommand(dependencyAudit) }
          : {}),
      };
    }
  }
  return {
    packageManager: 'unknown',
    sourceFiles: [],
    ...(trustedAuditCommand(dependencyAudit)
      ? { auditCommand: trustedAuditCommand(dependencyAudit) }
      : {}),
  };
}

export async function resolveStudioDependencySecurityTargetFromProject(input: {
  projectPath: string;
  projectName?: string;
  vulnerabilities?: number;
  dependencyAudit?: unknown;
}): Promise<StudioDependencySecurityTarget> {
  const projectPath = path.resolve(input.projectPath);
  const manager = await packageManagerFor(projectPath, input.dependencyAudit);
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
        dependencyAudit: project.dependencyAudit,
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
  if (action === 'inspect' && target.auditCommand) {
    return target.auditCommand;
  }
  if (action === 'repair' && target.repairCommand) {
    return target.repairCommand;
  }
  if (target.packageManager === 'npm') {
    return action === 'inspect' ? 'npm audit --json' : 'npm audit fix --audit-level=moderate';
  }
  if (target.packageManager === 'pnpm') {
    return action === 'inspect' ? 'pnpm audit --json' : 'pnpm audit --fix';
  }
  if (target.packageManager === 'yarn' && action === 'inspect') {
    return 'yarn npm audit --json';
  }
  throw new Error(
    `${target.packageManager} does not expose a deterministic non-force repair through Studio. Inspect the governed audit evidence and patch the authorized manifest through a guarded source transaction instead.`
  );
}
