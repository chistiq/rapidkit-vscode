import * as fs from 'node:fs';
import crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveStudioScopePath } from './studioScopePath.js';
import { requireStudioWorkspaceDirectory } from './studioWorkspaceAvailability.js';

import {
  buildPackageRunnerInvocationEnv,
  discoverPackageRunnerInvocations,
} from '../utils/platformCapabilities.js';

export type StudioWorkspaceCommandPurpose =
  | 'inspect'
  | 'diagnose'
  | 'test'
  | 'build'
  | 'format'
  | 'dependency';

export type StudioWorkspaceCommandApprovalExecution = 'once' | 'session' | 'project';

export type StudioWorkspaceCommandEffectScope =
  | 'git-repository'
  | 'git-remote'
  | 'terraform-state'
  | 'kubernetes-cluster'
  | 'container-runtime'
  | 'package-registry'
  | `command:${string}`;

export type StudioWorkspaceCommandRequest = {
  executable: string;
  args: string[];
  cwd?: string;
  purpose: StudioWorkspaceCommandPurpose;
  timeoutMs?: number;
  /** Declare source-producing behavior without mislabelling a build/test as formatting. */
  allowSourceChanges?: boolean;
};

export type StudioWorkspaceCommandPlan = {
  executable: string;
  args: string[];
  cwd: string;
  purpose: StudioWorkspaceCommandPurpose;
  timeoutMs: number;
  displayCommand: string;
  mutatesSource: boolean;
  authorizationFingerprint: string;
  requiresExplicitApproval: boolean;
  approvalReasons: string[];
  externalSideEffects: boolean;
  repositoryMetadataEffects: boolean;
  unclassifiedCommand: boolean;
  effectScopes: StudioWorkspaceCommandEffectScope[];
  observationScopes: StudioWorkspaceCommandEffectScope[];
  allowedApprovalExecutions: StudioWorkspaceCommandApprovalExecution[];
};

export type StudioWorkspaceCommandApprovalGrant = {
  fingerprint: string;
  approvedBy: string;
  approvedAt: string;
  execution?: StudioWorkspaceCommandApprovalExecution;
};

export type StudioWorkspaceCommandExecution = StudioWorkspaceCommandPlan & {
  processId?: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  terminationSignal?: string;
  startupError?: { code?: string; message: string };
};

export type StudioWorkspaceProcessEvent =
  | {
      phase: 'started';
      processId?: number;
      startedAt: string;
      displayCommand: string;
      cwd: string;
    }
  | {
      phase: 'running';
      processId?: number;
      elapsedMs: number;
      stdoutBytes: number;
      stderrBytes: number;
    }
  | {
      phase: 'completed';
      processId?: number;
      completedAt: string;
      durationMs: number;
      exitCode: number | null;
      timedOut: boolean;
      terminationSignal?: string;
      stdoutBytes: number;
      stderrBytes: number;
    };

export type StudioWorkspaceCommandRunOptions = {
  signal?: AbortSignal;
  onProcessEvent?(event: StudioWorkspaceProcessEvent): Promise<void> | void;
};

export function describeStudioWorkspaceCommandFailure(
  execution: StudioWorkspaceCommandExecution
): string {
  if (execution.startupError) {
    return `Workspace command could not start${execution.startupError.code ? ` (${execution.startupError.code})` : ''}: ${execution.startupError.message}`;
  }
  if (execution.stderr.trim()) {
    return execution.stderr;
  }
  if (execution.stdout.trim()) {
    return execution.stdout;
  }
  if (execution.timedOut) {
    return `Workspace command timed out after ${execution.timeoutMs}ms.`;
  }
  if (execution.terminationSignal) {
    return `Workspace command was terminated by ${execution.terminationSignal}.`;
  }
  return execution.exitCode === null
    ? 'Workspace command was terminated before it returned an exit code.'
    : `Workspace command exited with code ${execution.exitCode}.`;
}

/**
 * Public discovery catalog used by UI/documentation. It is not an execution
 * allowlist: a trusted Agent may invoke any safe bare PATH executable or
 * project-local wrapper through the same structured, no-shell policy. This
 * keeps new languages and repository-specific toolchains from requiring an
 * extension release.
 */
export const STUDIO_WORKSPACE_EXECUTABLE_FAMILIES = {
  javascript: [
    'node',
    'npm',
    'npx',
    'pnpm',
    'pnpx',
    'yarn',
    'bun',
    'bunx',
    'deno',
    'eslint',
    'prettier',
    'tsc',
    'vitest',
    'jest',
    'playwright',
  ],
  python: [
    'python',
    'python3',
    'py',
    'pip',
    'pip3',
    'pytest',
    'poetry',
    'uv',
    'ruff',
    'mypy',
    'tox',
    'nox',
  ],
  go: ['go', 'gofmt', 'golangci-lint'],
  rust: ['cargo', 'rustc', 'rustfmt'],
  dotnet: ['dotnet'],
  jvm: ['java', 'javac', 'kotlin', 'kotlinc', 'mvn', 'mvnw', 'gradle', 'gradlew', 'sbt'],
  php: ['php', 'composer', 'phpunit'],
  ruby: ['ruby', 'bundle', 'bundler', 'rake', 'rspec'],
  mobile: ['swift', 'swiftc', 'xcodebuild', 'dart', 'flutter'],
  native: ['make', 'cmake', 'ctest', 'ninja', 'meson', 'gcc', 'g++', 'clang', 'clang++'],
  functional: ['mix', 'elixir', 'erl', 'rebar3', 'clojure', 'lein'],
  build: ['bazel', 'bazelisk', 'buck2', 'just', 'task'],
  infrastructure: ['docker', 'docker-compose', 'podman', 'terraform', 'kubectl', 'helm'],
  sourceControl: ['git'],
} as const;

const KNOWN_STUDIO_EXECUTABLES = new Set<string>(
  Object.values(STUDIO_WORKSPACE_EXECUTABLE_FAMILIES).flatMap((entries) => [...entries])
);

const BLOCKED_EXECUTABLES = new Set([
  'bash',
  'sh',
  'zsh',
  'fish',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'rm',
  'rmdir',
  'del',
  'erase',
  'sudo',
  'su',
  'curl',
  'wget',
  'ssh',
  'scp',
]);

const BLOCKED_PACKAGE_MANAGER_ACTIONS = new Set(['login', 'logout', 'token', 'profile']);

const EXTERNAL_PACKAGE_MANAGER_ACTIONS = new Set([
  'publish',
  'unpublish',
  'deprecate',
  'owner',
  'access',
  'org',
  'team',
]);

const READ_ONLY_GIT_ACTIONS = new Set([
  'status',
  'diff',
  'log',
  'show',
  'rev-parse',
  'ls-files',
  'ls-remote',
  'grep',
]);

const GIT_SOURCE_ACTIONS = new Set([
  'checkout',
  'restore',
  'reset',
  'clean',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'stash',
]);

const SOURCE_MUTATING_ACTIONS = new Set([
  'add',
  'audit',
  'create',
  'fix',
  'format',
  'generate',
  'install',
  'init',
  'new',
  'remove',
  'rm',
  'scaffold',
  'tidy',
  'uninstall',
  'update',
  'upgrade',
  'wrapper',
]);

const SOURCE_MUTATING_TASK_PATTERN =
  /(?:^|[:_-])(?:add|create|fix|format|generate|init|migrate|new|remove|scaffold|sync|update|upgrade|wrapper)(?:$|[:_-])/i;

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizedExecutableName(executable: string): string {
  return path
    .basename(executable)
    .toLowerCase()
    .replace(/\.cmd$|\.exe$/i, '');
}

const WORKSPAI_PACKAGE_TOKEN = /^(?:workspai|wspai)(?:@[^\s]+)?$/i;

function invokesWorkspaiCli(executableName: string, args: readonly string[]): boolean {
  if (executableName === 'workspai' || executableName === 'wspai') {
    return true;
  }
  if (!['npx', 'pnpx', 'bunx', 'npm', 'pnpm', 'yarn', 'bun'].includes(executableName)) {
    return false;
  }
  return args.some((arg) => WORKSPAI_PACKAGE_TOKEN.test(arg.trim()));
}

function validateToken(token: string, label: string): void {
  if (!token || token.length > 2_000 || /[\0\r\n]/.test(token)) {
    throw new Error(`Studio workspace command ${label} is invalid.`);
  }
}

function assertArgumentPathsStayInWorkspace(input: {
  workspacePath: string;
  cwd: string;
  args: readonly string[];
}): void {
  for (const arg of input.args) {
    const candidate = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : arg;
    if (/^file:\/\//i.test(candidate)) {
      throw new Error(
        'file:// command arguments are not allowed in autonomous workspace commands.'
      );
    }
    const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(candidate);
    const hasParentSegment = /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(candidate);
    if (!path.isAbsolute(candidate) && !windowsAbsolute && !hasParentSegment) {
      continue;
    }
    const resolved = path.resolve(input.cwd, candidate);
    if (!isInside(input.workspacePath, resolved)) {
      throw new Error(`Studio workspace command argument escapes the workspace: ${arg}`);
    }
  }
}

function assessCommandSemantics(
  executableName: string,
  args: readonly string[]
): {
  externalSideEffects: boolean;
  repositoryMetadataEffects: boolean;
  effectScopes: StudioWorkspaceCommandEffectScope[];
  observationScopes: StudioWorkspaceCommandEffectScope[];
} {
  if (BLOCKED_EXECUTABLES.has(executableName)) {
    throw new Error(`Studio workspace command executable is blocked: ${executableName}`);
  }
  if (
    ['node', 'python', 'python3', 'py', 'ruby', 'php', 'elixir'].includes(executableName) &&
    args.some((arg) => ['-c', '-e', '-r', '--eval', '--print'].includes(arg))
  ) {
    throw new Error('Inline interpreter code is not allowed in autonomous workspace commands.');
  }
  if (
    ['npm', 'pnpm', 'yarn', 'bun'].includes(executableName) &&
    BLOCKED_PACKAGE_MANAGER_ACTIONS.has((args[0] ?? '').toLowerCase())
  ) {
    throw new Error(`Package-manager action is not allowed: ${args[0]}`);
  }
  if (['npx', 'pnpx', 'bunx'].includes(executableName)) {
    const permitsLocalResolution = args.includes('--no-install') || args.includes('--no');
    if (!permitsLocalResolution) {
      throw new Error(
        `${executableName} must use --no-install/--no so autonomous execution cannot fetch an unreviewed package.`
      );
    }
    const workspaiIndex = args.findIndex((arg) => arg === 'workspai');
    if (workspaiIndex >= 0 && args[workspaiIndex + 1] === 'remediation-plan') {
      throw new Error(
        'The canonical command is `workspai workspace remediation-plan`. Use the inspect-remediation-plan tool, or insert `workspace` before `remediation-plan`.'
      );
    }
  }
  let externalSideEffects = false;
  let repositoryMetadataEffects = false;
  const effectScopes = new Set<StudioWorkspaceCommandEffectScope>();
  const observationScopes = new Set<StudioWorkspaceCommandEffectScope>();
  if (executableName === 'git') {
    const action = (args[0] ?? '').toLowerCase();
    observationScopes.add('git-repository');
    if (action === 'ls-remote') {
      observationScopes.add('git-remote');
    }
    if (!READ_ONLY_GIT_ACTIONS.has(action)) {
      repositoryMetadataEffects = true;
      effectScopes.add('git-repository');
      externalSideEffects = ['push', 'fetch', 'pull', 'clone'].includes(action);
      if (externalSideEffects) {
        effectScopes.add('git-remote');
      }
    }
  }
  if (executableName === 'terraform') {
    const action = (args[0] ?? '').toLowerCase();
    observationScopes.add('terraform-state');
    if (!['fmt', 'validate', 'plan', 'show', 'providers', 'version'].includes(action)) {
      externalSideEffects = true;
      effectScopes.add('terraform-state');
    }
  }
  if (executableName === 'kubectl') {
    const action = (args[0] ?? '').toLowerCase();
    observationScopes.add('kubernetes-cluster');
    if (!['get', 'describe', 'logs', 'diff', 'explain', 'version'].includes(action)) {
      externalSideEffects = true;
      effectScopes.add('kubernetes-cluster');
    }
  }
  if (executableName === 'helm') {
    const action = (args[0] ?? '').toLowerCase();
    observationScopes.add('kubernetes-cluster');
    if (!['lint', 'template', 'get', 'list', 'status', 'version'].includes(action)) {
      externalSideEffects = true;
      effectScopes.add('kubernetes-cluster');
    }
  }
  if (['docker', 'docker-compose', 'podman'].includes(executableName)) {
    const action = (args[0] ?? '').toLowerCase();
    observationScopes.add('container-runtime');
    const readOnly =
      executableName === 'docker-compose'
        ? ['config', 'ps', 'logs', 'version'].includes(action)
        : action === 'compose'
          ? ['config', 'ps', 'logs'].includes((args[1] ?? '').toLowerCase())
          : ['inspect', 'logs', 'version', 'info', 'ps'].includes(action);
    if (!readOnly) {
      externalSideEffects = true;
      effectScopes.add('container-runtime');
    }
  }
  if (
    ['npm', 'pnpm', 'yarn', 'bun'].includes(executableName) &&
    EXTERNAL_PACKAGE_MANAGER_ACTIONS.has((args[0] ?? '').toLowerCase())
  ) {
    externalSideEffects = true;
    effectScopes.add('package-registry');
  }
  if (
    ['npm', 'pnpm', 'yarn', 'bun'].includes(executableName) &&
    ['view', 'info'].includes((args[0] ?? '').toLowerCase())
  ) {
    observationScopes.add('package-registry');
  }
  return {
    externalSideEffects,
    repositoryMetadataEffects,
    effectScopes: [...effectScopes],
    observationScopes: [...observationScopes],
  };
}

function commandMutatesSource(
  input: StudioWorkspaceCommandRequest,
  executableName: string
): boolean {
  if (input.allowSourceChanges === true) {
    return true;
  }
  if (input.purpose === 'dependency' || input.purpose === 'format') {
    return true;
  }
  const action = (input.args[0] ?? '').toLowerCase();
  if (executableName === 'git' && GIT_SOURCE_ACTIONS.has(action)) {
    return true;
  }
  if (executableName === 'terraform' && action === 'fmt') {
    return true;
  }
  if (
    ['npm', 'pnpm', 'yarn'].includes(executableName) &&
    action === 'audit' &&
    !input.args.some((arg) => arg === 'fix' || arg === '--fix')
  ) {
    return false;
  }
  if (SOURCE_MUTATING_ACTIONS.has(action)) {
    return true;
  }
  if (input.args.some((arg) => /^(?:--fix|--write|--update|--update-snapshots)$/.test(arg))) {
    return true;
  }
  if (
    ['npm', 'pnpm', 'yarn', 'bun'].includes(executableName) &&
    ['run', 'exec'].includes(action) &&
    SOURCE_MUTATING_TASK_PATTERN.test(input.args[1] ?? '')
  ) {
    return true;
  }
  if (
    [
      'mvn',
      'mvnw',
      'gradle',
      'gradlew',
      'sbt',
      'bazel',
      'bazelisk',
      'buck2',
      'just',
      'task',
    ].includes(executableName) &&
    input.args.some((arg) => SOURCE_MUTATING_TASK_PATTERN.test(arg))
  ) {
    return true;
  }
  if (
    ['npx', 'pnpx', 'bunx'].includes(executableName) &&
    input.args.some((arg) => SOURCE_MUTATING_TASK_PATTERN.test(arg))
  ) {
    return true;
  }
  return false;
}

function shellDisplayToken(token: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(token) ? token : JSON.stringify(token);
}

function commandAuthorizationFingerprint(input: {
  executable: string;
  args: readonly string[];
  cwd: string;
  purpose: StudioWorkspaceCommandPurpose;
  timeoutMs: number;
  allowSourceChanges?: boolean;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: 'workspai.studio-command-approval.v1',
        executable: input.executable,
        args: input.args,
        cwd: path.resolve(input.cwd),
        purpose: input.purpose,
        timeoutMs: input.timeoutMs,
        ...(input.allowSourceChanges === true ? { allowSourceChanges: true } : {}),
      })
    )
    .digest('hex');
}

export function assertStudioWorkspaceCommandApproval(input: {
  plan: StudioWorkspaceCommandPlan;
  approval?: StudioWorkspaceCommandApprovalGrant;
}): void {
  if (!input.plan.requiresExplicitApproval) {
    return;
  }
  if (!input.approval) {
    throw new Error(
      'This workspace command has invasive effects and requires explicit scoped user approval.'
    );
  }
  if (input.approval.fingerprint !== input.plan.authorizationFingerprint) {
    throw new Error(
      'Workspace command approval does not match the exact executable, arguments, scope, purpose, and timeout requested by the model.'
    );
  }
  const execution = input.approval.execution ?? 'once';
  if (!input.plan.allowedApprovalExecutions.includes(execution)) {
    throw new Error(
      `Workspace command approval scope ${execution} is not allowed for this command's effects.`
    );
  }
}

export function resolveStudioWorkspaceCommandPlan(input: {
  workspacePath: string;
  projectPath?: string;
  request: StudioWorkspaceCommandRequest;
}): StudioWorkspaceCommandPlan {
  const { request } = input;
  if (request.allowSourceChanges !== undefined && typeof request.allowSourceChanges !== 'boolean') {
    throw new Error('Studio workspace command allowSourceChanges must be a boolean.');
  }
  validateToken(request.executable, 'executable');
  if (!Array.isArray(request.args) || request.args.length > 100) {
    throw new Error('Studio workspace command args must contain at most 100 entries.');
  }
  request.args.forEach((arg, index) => validateToken(arg, `args[${index}]`));

  const commandRoot = input.projectPath?.trim()
    ? path.resolve(input.projectPath)
    : path.resolve(input.workspacePath);
  const cwd = resolveStudioScopePath(input, request.cwd ?? '.');
  if (!isInside(commandRoot, cwd)) {
    throw new Error('Studio workspace command cwd escapes the selected workspace/project.');
  }

  const executableName = normalizedExecutableName(request.executable);
  if (invokesWorkspaiCli(executableName, request.args)) {
    throw new Error(
      'Workspai commands are not allowed through run-workspace-command. For agent bootstrap use inspect-project-agent-entry with the registered project identity. Use run-governed-command for its enumerated registered producers and verification. For another CLI operation inspect installed help and use a dedicated capability or exact-approved start-terminal when appropriate. Do not treat a missing CLI route as a reason to stop unrelated source work.'
    );
  }
  const projectLocalExecutable = /^\.{1,2}[\\/]/.test(request.executable);
  if (path.isAbsolute(request.executable)) {
    throw new Error('Absolute executable paths are not allowed in autonomous workspace commands.');
  }
  if (!projectLocalExecutable && !/^[A-Za-z0-9_.+-]+$/.test(request.executable)) {
    throw new Error(
      'Studio workspace command executable must be a bare PATH command or a project-local wrapper.'
    );
  }
  if (projectLocalExecutable) {
    const resolvedExecutable = path.resolve(cwd, request.executable);
    if (!isInside(commandRoot, resolvedExecutable)) {
      throw new Error('Project-local executable escapes the selected workspace/project.');
    }
  }
  const assessedEffects = assessCommandSemantics(executableName, request.args);
  const unclassifiedCommand = !KNOWN_STUDIO_EXECUTABLES.has(executableName);
  const unclassifiedScope: StudioWorkspaceCommandEffectScope = `command:${executableName}`;
  const unclassifiedObservation = unclassifiedCommand && request.purpose === 'inspect';
  const unclassifiedExternalEffect = unclassifiedCommand && !unclassifiedObservation;
  const semanticEffects = {
    ...assessedEffects,
    externalSideEffects: assessedEffects.externalSideEffects || unclassifiedExternalEffect,
    effectScopes: [
      ...assessedEffects.effectScopes,
      ...(unclassifiedExternalEffect ? [unclassifiedScope] : []),
    ],
    observationScopes: [
      ...assessedEffects.observationScopes,
      ...(unclassifiedObservation ? [unclassifiedScope] : []),
    ],
  };
  assertArgumentPathsStayInWorkspace({
    workspacePath: commandRoot,
    cwd,
    args: request.args,
  });

  // Project validation can legitimately run for several minutes. Workspai
  // producers never reach this generic executor; the governed registry and
  // bundled runtime own their independent lifecycle budget.
  const longRunningPurpose = ['test', 'build', 'dependency'].includes(request.purpose);
  const defaultTimeoutMs = longRunningPurpose ? 600_000 : 120_000;
  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? defaultTimeoutMs, 1_000), 600_000);
  const mutatesSource = commandMutatesSource(request, executableName);
  const requiresExplicitApproval =
    mutatesSource ||
    semanticEffects.externalSideEffects ||
    semanticEffects.repositoryMetadataEffects ||
    unclassifiedCommand;
  const approvalReasons = [
    ...(mutatesSource
      ? ['The command is expected to modify project-owned files or dependency state.']
      : []),
    ...(semanticEffects.repositoryMetadataEffects
      ? ['The command may modify Git/repository metadata that is outside the source checkpoint.']
      : []),
    ...(semanticEffects.externalSideEffects
      ? [
          'The command may change an external service, registry, cluster, daemon, or remote repository and cannot be rolled back by the local source checkpoint.',
        ]
      : []),
    ...(unclassifiedCommand
      ? [
          request.purpose === 'inspect'
            ? 'This repository-specific executable is not in the discovery catalog. Exact approval is required even for observation.'
            : 'This repository-specific executable has unclassified non-source effects. Run it once, then observe the same command domain with an inspect-purpose invocation.',
        ]
      : []),
    ...(requiresExplicitApproval
      ? ['Execution is limited to this exact argument vector and working directory.']
      : []),
  ];
  const allowedApprovalExecutions: StudioWorkspaceCommandApprovalExecution[] =
    semanticEffects.externalSideEffects ||
    semanticEffects.repositoryMetadataEffects ||
    unclassifiedCommand
      ? ['once']
      : ['once', 'session', 'project'];
  return {
    executable: request.executable,
    args: [...request.args],
    cwd,
    purpose: request.purpose,
    timeoutMs,
    displayCommand: [request.executable, ...request.args].map(shellDisplayToken).join(' '),
    mutatesSource,
    externalSideEffects: semanticEffects.externalSideEffects,
    repositoryMetadataEffects: semanticEffects.repositoryMetadataEffects,
    unclassifiedCommand,
    effectScopes: semanticEffects.effectScopes,
    observationScopes: semanticEffects.observationScopes,
    allowedApprovalExecutions,
    authorizationFingerprint: commandAuthorizationFingerprint({
      executable: request.executable,
      args: request.args,
      cwd,
      purpose: request.purpose,
      timeoutMs,
      allowSourceChanges: request.allowSourceChanges,
    }),
    requiresExplicitApproval,
    approvalReasons,
  };
}

function boundedOutput(value: string, maxChars = 24_000): string {
  if (value.length <= maxChars) {
    return value;
  }
  const head = value.slice(0, Math.floor(maxChars * 0.65));
  const tail = value.slice(-Math.floor(maxChars * 0.35));
  return `${head}\n…[command output truncated]…\n${tail}`;
}

const STUDIO_COMMAND_CAPTURE_LIMIT_BYTES = 2 * 1024 * 1024;

async function readCapturedOutput(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf8').catch(() => '');
}

export async function runStudioWorkspaceCommand(
  plan: StudioWorkspaceCommandPlan,
  options: StudioWorkspaceCommandRunOptions = {}
): Promise<StudioWorkspaceCommandExecution> {
  await requireStudioWorkspaceDirectory(plan.cwd);
  const { execa } = await import('execa');
  let protectedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL|COOKIE|AUTH)/i.test(key)
    )
  );
  for (const invocation of discoverPackageRunnerInvocations('npm')) {
    protectedEnvironment = buildPackageRunnerInvocationEnv(invocation, protectedEnvironment);
  }
  const startedAt = new Date();
  const captureDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'workspai-studio-command-')
  );
  const stdoutPath = path.join(captureDirectory, 'stdout.log');
  const stderrPath = path.join(captureDirectory, 'stderr.log');
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');
  let descriptorsClosed = false;
  const closeDescriptors = () => {
    if (descriptorsClosed) {
      return;
    }
    descriptorsClosed = true;
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  };
  const subprocess = execa(plan.executable, plan.args, {
    cwd: plan.cwd,
    shell: false,
    reject: false,
    timeout: plan.timeoutMs,
    stdin: 'ignore',
    // Execa's public type narrows extra descriptors to 3..9 even though Node
    // accepts any valid descriptor for stdout/stderr at runtime.
    stdout: stdoutFd as 3,
    stderr: stderrFd as 4,
    extendEnv: false,
    env: { ...protectedEnvironment, NO_COLOR: '1', CI: process.env.CI ?? '1' },
  });
  const processId = subprocess.pid;
  const emit = async (event: StudioWorkspaceProcessEvent) => {
    try {
      await options.onProcessEvent?.(event);
    } catch {
      // Telemetry is never allowed to change command execution semantics.
    }
  };
  void emit({
    phase: 'started',
    ...(processId ? { processId } : {}),
    startedAt: startedAt.toISOString(),
    displayCommand: plan.displayCommand,
    cwd: plan.cwd,
  });

  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputLimitExceeded = false;
  const abort = () => subprocess.kill('SIGTERM');
  if (options.signal?.aborted) {
    abort();
  } else {
    options.signal?.addEventListener('abort', abort, { once: true });
  }
  const sampleCapturedBytes = () => {
    try {
      stdoutBytes = fs.fstatSync(stdoutFd).size;
      stderrBytes = fs.fstatSync(stderrFd).size;
      if (!outputLimitExceeded && stdoutBytes + stderrBytes > STUDIO_COMMAND_CAPTURE_LIMIT_BYTES) {
        outputLimitExceeded = true;
        subprocess.kill('SIGTERM');
      }
    } catch {
      // Completion owns the final read and diagnostic.
    }
  };
  const captureMonitor = setInterval(sampleCapturedBytes, 100);
  captureMonitor.unref();
  // Progress is durable. Five-second sampling keeps a ten-minute process well
  // below the session event budget while still giving Live useful telemetry.
  const heartbeat = setInterval(() => {
    sampleCapturedBytes();
    void emit({
      phase: 'running',
      ...(processId ? { processId } : {}),
      elapsedMs: Date.now() - startedAt.getTime(),
      stdoutBytes,
      stderrBytes,
    });
  }, 5_000);
  heartbeat.unref();

  try {
    const result = await subprocess;
    const startupFailure = result as unknown as {
      failed?: boolean;
      code?: string;
      shortMessage?: string;
    };
    const startupError =
      startupFailure.failed && result.exitCode === undefined && !result.signal && !result.timedOut
        ? {
            ...(startupFailure.code ? { code: startupFailure.code } : {}),
            message: startupFailure.shortMessage ?? 'The executable could not be started.',
          }
        : undefined;
    sampleCapturedBytes();
    clearInterval(captureMonitor);
    clearInterval(heartbeat);
    closeDescriptors();
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
    // Report the observed exit before output reading or transaction inspection.
    // Those operations may be slow even though the process has already exited.
    void emit({
      phase: 'completed',
      ...(processId ? { processId } : {}),
      completedAt: completedAt.toISOString(),
      durationMs,
      exitCode: result.exitCode ?? null,
      timedOut: Boolean(result.timedOut),
      ...(startupError ? { startupError } : {}),
      ...(result.signal ? { terminationSignal: String(result.signal) } : {}),
      stdoutBytes,
      stderrBytes,
    });
    const [resultStdout, resultStderr] = await Promise.all([
      readCapturedOutput(stdoutPath),
      readCapturedOutput(stderrPath),
    ]);
    stdoutBytes = Buffer.byteLength(resultStdout);
    stderrBytes = Buffer.byteLength(resultStderr);
    const captureError = outputLimitExceeded
      ? `Studio stopped the command after captured output exceeded ${STUDIO_COMMAND_CAPTURE_LIMIT_BYTES} bytes.`
      : '';
    const execution: StudioWorkspaceCommandExecution = {
      ...plan,
      ...(processId ? { processId } : {}),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      exitCode: result.exitCode ?? null,
      stdout: boundedOutput(resultStdout),
      stderr: boundedOutput([resultStderr, captureError].filter(Boolean).join('\n')),
      timedOut: Boolean(result.timedOut),
      ...(startupError ? { startupError } : {}),
      ...(result.signal ? { terminationSignal: String(result.signal) } : {}),
    };
    return execution;
  } finally {
    clearInterval(captureMonitor);
    clearInterval(heartbeat);
    options.signal?.removeEventListener('abort', abort);
    closeDescriptors();
    await fs.promises.rm(captureDirectory, { recursive: true, force: true });
  }
}
