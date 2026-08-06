import fs from 'fs-extra';
import path from 'node:path';

import {
  parseStudioDependencyUpgradeCandidates,
  resolveStudioDependencySecurityTargetFromProject,
  resolveStudioDependencySecurityTargets,
  type StudioDependencySecurityTarget,
} from './studioDependencySecurity.js';
import {
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
  type StudioWorkspaceCommandExecution,
  type StudioWorkspaceCommandPurpose,
} from './studioWorkspaceCommand.js';

export type StudioDependencyTransactionStage = {
  id: 'reconcile' | 'audit' | 'test' | 'build';
  status: 'passed' | 'failed' | 'blocking' | 'skipped';
  command?: string;
  exitCode?: number | null;
  summary: string;
};

export type StudioDependencyProjectTransaction = {
  projectName: string;
  projectPath: string;
  packageManager: StudioDependencySecurityTarget['packageManager'];
  state: 'closed' | 'blocked' | 'failed';
  closureReady: boolean;
  stages: StudioDependencyTransactionStage[];
  unresolvedCandidates: Awaited<ReturnType<typeof parseStudioDependencyUpgradeCandidates>>;
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function selectedTargets(input: {
  workspacePath: string;
  targets: StudioDependencySecurityTarget[];
  projectNames?: string[];
  changedPaths?: string[];
  projectPath?: string;
}): StudioDependencySecurityTarget[] {
  const names = new Set((input.projectNames ?? []).map((value) => value.trim()).filter(Boolean));
  const changed = (input.changedPaths ?? []).map((value) =>
    path.resolve(input.workspacePath, value)
  );
  const selectedProjectPath = input.projectPath
    ? path.isAbsolute(input.projectPath)
      ? path.resolve(input.projectPath)
      : path.resolve(input.workspacePath, input.projectPath)
    : undefined;
  if (names.size === 0 && changed.length === 0 && !selectedProjectPath) {
    return input.targets;
  }
  return input.targets.filter((target) => {
    if (names.has(target.projectName)) {
      return true;
    }
    if (selectedProjectPath && path.resolve(target.projectPath) === selectedProjectPath) {
      return true;
    }
    return changed.some((candidate) => isInside(target.projectPath, candidate));
  });
}

const NODE_DEPENDENCY_FILE_PATTERN =
  /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb?)$/i;

async function targetsFromChangedPaths(input: {
  workspacePath: string;
  changedPaths?: string[];
}): Promise<StudioDependencySecurityTarget[]> {
  const projectPaths = new Set<string>();
  for (const changedPath of input.changedPaths ?? []) {
    const normalized = changedPath.replace(/\\/g, '/');
    if (!NODE_DEPENDENCY_FILE_PATTERN.test(normalized)) {
      continue;
    }
    const absolute = path.isAbsolute(changedPath)
      ? path.resolve(changedPath)
      : path.resolve(input.workspacePath, changedPath);
    if (!isInside(input.workspacePath, absolute)) {
      continue;
    }
    projectPaths.add(path.dirname(absolute));
  }
  const targets: StudioDependencySecurityTarget[] = [];
  for (const projectPath of projectPaths) {
    try {
      targets.push(
        await resolveStudioDependencySecurityTargetFromProject({
          projectPath,
        })
      );
    } catch {
      // A changed non-Node manifest is owned by its runtime-native Doctor
      // capability and must not be guessed into a Node transaction.
    }
  }
  return targets;
}

function mergeTargets(
  left: StudioDependencySecurityTarget[],
  right: StudioDependencySecurityTarget[]
): StudioDependencySecurityTarget[] {
  const merged = new Map<string, StudioDependencySecurityTarget>();
  for (const target of [...left, ...right]) {
    const key = path.resolve(target.projectPath);
    const prior = merged.get(key);
    merged.set(key, {
      ...(prior ?? target),
      ...target,
      vulnerabilities: Math.max(prior?.vulnerabilities ?? 0, target.vulnerabilities),
      sourceFiles: [...new Set([...(prior?.sourceFiles ?? []), ...target.sourceFiles])],
    });
  }
  return [...merged.values()];
}

function commandFor(
  target: StudioDependencySecurityTarget,
  stage: StudioDependencyTransactionStage['id']
): { executable: string; args: string[]; purpose: StudioWorkspaceCommandPurpose } | undefined {
  // The v1 transaction executor can prove install/audit/test/build closure only
  // for Node package-manager contracts. Discovery intentionally knows about
  // every Doctor ecosystem, but silently routing an unknown manager through
  // yarn would mutate the wrong dependency graph. Non-Node transactions stay
  // blocked until the CLI publishes their exact governed stage invocations.
  if (!['npm', 'pnpm', 'yarn'].includes(target.packageManager)) {
    return undefined;
  }
  if (stage === 'reconcile') {
    return target.packageManager === 'npm'
      ? { executable: 'npm', args: ['install'], purpose: 'dependency' }
      : target.packageManager === 'pnpm'
        ? { executable: 'pnpm', args: ['install'], purpose: 'dependency' }
        : { executable: 'yarn', args: ['install'], purpose: 'dependency' };
  }
  if (stage === 'audit') {
    return target.packageManager === 'npm'
      ? {
          executable: 'npm',
          args: ['audit', '--audit-level=moderate', '--json'],
          purpose: 'diagnose',
        }
      : target.packageManager === 'pnpm'
        ? {
            executable: 'pnpm',
            args: ['audit', '--audit-level=moderate', '--json'],
            purpose: 'diagnose',
          }
        : { executable: 'yarn', args: ['audit', '--json'], purpose: 'diagnose' };
  }
  return undefined;
}

async function execute(input: {
  workspacePath: string;
  projectPath: string;
  executable: string;
  args: string[];
  purpose: StudioWorkspaceCommandPurpose;
}): Promise<StudioWorkspaceCommandExecution> {
  const plan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
    request: {
      executable: input.executable,
      args: input.args,
      cwd: path.relative(input.workspacePath, input.projectPath) || '.',
      purpose: input.purpose,
      timeoutMs: 600_000,
    },
  });
  return runStudioWorkspaceCommand(plan);
}

function stageFromExecution(
  id: StudioDependencyTransactionStage['id'],
  execution: StudioWorkspaceCommandExecution,
  options: { audit?: boolean } = {}
): StudioDependencyTransactionStage {
  const passed = execution.exitCode === 0;
  return {
    id,
    status: passed ? 'passed' : options.audit && execution.exitCode === 1 ? 'blocking' : 'failed',
    command: execution.displayCommand,
    exitCode: execution.exitCode,
    summary: passed
      ? `${id} completed.`
      : options.audit && execution.exitCode === 1
        ? 'The dependency audit completed and still reports blocking advisories.'
        : execution.stderr || execution.stdout || `${id} failed.`,
  };
}

async function runProjectTransaction(input: {
  workspacePath: string;
  target: StudioDependencySecurityTarget;
}): Promise<StudioDependencyProjectTransaction> {
  const stages: StudioDependencyTransactionStage[] = [];
  const reconcile = commandFor(input.target, 'reconcile');
  if (!reconcile) {
    stages.push({
      id: 'reconcile',
      status: 'blocking',
      summary: `${input.target.packageManager} dependency closure requires runtime-native stage invocations from the canonical CLI transaction contract; Studio refused to guess a package-manager command.`,
    });
    return {
      projectName: input.target.projectName,
      projectPath: input.target.projectPath,
      packageManager: input.target.packageManager,
      state: 'blocked',
      closureReady: false,
      stages,
      unresolvedCandidates: [],
    };
  }
  const reconcileExecution = await execute({
    workspacePath: input.workspacePath,
    projectPath: input.target.projectPath,
    ...reconcile,
  });
  stages.push(stageFromExecution('reconcile', reconcileExecution));
  if (reconcileExecution.exitCode !== 0) {
    return {
      projectName: input.target.projectName,
      projectPath: input.target.projectPath,
      packageManager: input.target.packageManager,
      state: 'failed',
      closureReady: false,
      stages,
      unresolvedCandidates: [],
    };
  }

  const auditCommand = commandFor(input.target, 'audit');
  if (!auditCommand) {
    stages.push({
      id: 'audit',
      status: 'blocking',
      summary: `${input.target.packageManager} audit invocation is not available from the executable transaction contract.`,
    });
    return {
      projectName: input.target.projectName,
      projectPath: input.target.projectPath,
      packageManager: input.target.packageManager,
      state: 'blocked',
      closureReady: false,
      stages,
      unresolvedCandidates: [],
    };
  }
  const auditExecution = await execute({
    workspacePath: input.workspacePath,
    projectPath: input.target.projectPath,
    ...auditCommand,
  });
  stages.push(stageFromExecution('audit', auditExecution, { audit: true }));
  const unresolvedCandidates =
    auditExecution.stdout.trim().length > 0
      ? await parseStudioDependencyUpgradeCandidates({
          target: input.target,
          auditJson: auditExecution.stdout,
        }).catch(() => [])
      : [];

  const manifest = (await fs.readJson(path.join(input.target.projectPath, 'package.json'))) as {
    scripts?: Record<string, string>;
  };
  for (const stageId of ['test', 'build'] as const) {
    if (!manifest.scripts?.[stageId]) {
      stages.push({
        id: stageId,
        status: 'skipped',
        summary: `No ${stageId} script is declared.`,
      });
      continue;
    }
    const stageCommand =
      input.target.packageManager === 'npm'
        ? { executable: 'npm', args: ['run', stageId] }
        : input.target.packageManager === 'pnpm'
          ? { executable: 'pnpm', args: ['run', stageId] }
          : { executable: 'yarn', args: [stageId] };
    const stageExecution = await execute({
      workspacePath: input.workspacePath,
      projectPath: input.target.projectPath,
      ...stageCommand,
      purpose: stageId,
    });
    stages.push(stageFromExecution(stageId, stageExecution));
  }

  const auditClean = auditExecution.exitCode === 0;
  const executionFailed = stages.some((stage) => stage.status === 'failed');
  const validationPassed = stages.every(
    (stage) => stage.status === 'passed' || stage.status === 'skipped'
  );
  return {
    projectName: input.target.projectName,
    projectPath: input.target.projectPath,
    packageManager: input.target.packageManager,
    state: auditClean && validationPassed ? 'closed' : executionFailed ? 'failed' : 'blocked',
    closureReady: auditClean && validationPassed,
    stages,
    unresolvedCandidates,
  };
}

export async function completeStudioDependencyTransactions(input: {
  workspacePath: string;
  projectNames?: string[];
  changedPaths?: string[];
  projectPath?: string;
}): Promise<{
  schemaVersion: 'workspai.studio-dependency-transaction.v1';
  state: 'closed' | 'blocked' | 'failed';
  closureReady: boolean;
  projects: StudioDependencyProjectTransaction[];
}> {
  const discoveredTargets = await resolveStudioDependencySecurityTargets({
    workspacePath: input.workspacePath,
  }).catch(() => []);
  const changedTargets = await targetsFromChangedPaths(input);
  const scopedProjectPath = input.projectPath
    ? path.isAbsolute(input.projectPath)
      ? path.resolve(input.projectPath)
      : path.resolve(input.workspacePath, input.projectPath)
    : undefined;
  if (scopedProjectPath && !isInside(input.workspacePath, scopedProjectPath)) {
    throw new Error('Dependency transaction project scope must stay inside the workspace.');
  }
  const scopedTargets = scopedProjectPath
    ? [
        await resolveStudioDependencySecurityTargetFromProject({
          projectPath: scopedProjectPath,
        }),
      ]
    : [];
  const targets = selectedTargets({
    ...input,
    targets: mergeTargets(mergeTargets(discoveredTargets, changedTargets), scopedTargets),
  });
  if (targets.length === 0) {
    return {
      schemaVersion: 'workspai.studio-dependency-transaction.v1',
      state: 'failed',
      closureReady: false,
      projects: [],
    };
  }
  const projects: StudioDependencyProjectTransaction[] = [];
  for (const target of targets) {
    projects.push(await runProjectTransaction({ workspacePath: input.workspacePath, target }));
  }
  const closureReady = projects.length > 0 && projects.every((project) => project.closureReady);
  return {
    schemaVersion: 'workspai.studio-dependency-transaction.v1',
    state: closureReady
      ? 'closed'
      : projects.some((project) => project.state === 'failed')
        ? 'failed'
        : 'blocked',
    closureReady,
    projects,
  };
}
