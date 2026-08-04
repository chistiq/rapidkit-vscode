import * as path from 'node:path';

export type StudioWorkspaceCommandPurpose =
  | 'inspect'
  | 'diagnose'
  | 'test'
  | 'build'
  | 'format'
  | 'dependency';

export type StudioWorkspaceCommandRequest = {
  executable: string;
  args: string[];
  cwd?: string;
  purpose: StudioWorkspaceCommandPurpose;
  timeoutMs?: number;
};

export type StudioWorkspaceCommandPlan = {
  executable: string;
  args: string[];
  cwd: string;
  purpose: StudioWorkspaceCommandPurpose;
  timeoutMs: number;
  displayCommand: string;
  mutatesSource: boolean;
};

export type StudioWorkspaceCommandExecution = StudioWorkspaceCommandPlan & {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

/**
 * Public capability catalog. Supporting another ecosystem is intentionally a
 * data-only change plus a policy test; the Agent runtime and model protocol do
 * not need a blocker-specific tool.
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

const KNOWN_EXECUTABLES = new Set<string>(
  Object.values(STUDIO_WORKSPACE_EXECUTABLE_FAMILIES).flat()
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

const BLOCKED_PACKAGE_MANAGER_ACTIONS = new Set([
  'publish',
  'unpublish',
  'deprecate',
  'login',
  'logout',
  'owner',
  'access',
  'token',
  'profile',
  'org',
  'team',
]);

const SOURCE_MUTATING_ACTIONS = new Set([
  'add',
  'audit',
  'fix',
  'format',
  'install',
  'remove',
  'rm',
  'tidy',
  'uninstall',
  'update',
  'upgrade',
]);

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

function validateCommandSemantics(executableName: string, args: readonly string[]): void {
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
  if (executableName === 'git') {
    const action = (args[0] ?? '').toLowerCase();
    if (!['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'grep'].includes(action)) {
      throw new Error(`Autonomous git mutation is not allowed through this tool: ${action}`);
    }
  }
  if (executableName === 'terraform') {
    const action = (args[0] ?? '').toLowerCase();
    if (!['fmt', 'validate', 'plan', 'show', 'providers', 'version'].includes(action)) {
      throw new Error(`Autonomous Terraform operation is not workspace-safe: ${action}`);
    }
  }
  if (executableName === 'kubectl') {
    const action = (args[0] ?? '').toLowerCase();
    if (!['get', 'describe', 'logs', 'diff', 'explain', 'version'].includes(action)) {
      throw new Error(`Autonomous Kubernetes mutation is not allowed: ${action}`);
    }
  }
  if (executableName === 'helm') {
    const action = (args[0] ?? '').toLowerCase();
    if (!['lint', 'template', 'get', 'list', 'status', 'version'].includes(action)) {
      throw new Error(`Autonomous Helm mutation is not allowed: ${action}`);
    }
  }
  if (['docker', 'docker-compose', 'podman'].includes(executableName)) {
    const action = (args[0] ?? '').toLowerCase();
    const allowed =
      executableName === 'docker-compose'
        ? ['config', 'build', 'ps', 'logs', 'version'].includes(action)
        : action === 'compose'
          ? ['config', 'build', 'ps', 'logs'].includes((args[1] ?? '').toLowerCase())
          : ['build', 'inspect', 'logs', 'version', 'info', 'ps'].includes(action);
    if (!allowed) {
      throw new Error(`Autonomous container runtime mutation is not allowed: ${action}`);
    }
  }
}

function commandMutatesSource(
  input: StudioWorkspaceCommandRequest,
  executableName: string
): boolean {
  if (input.purpose === 'dependency' || input.purpose === 'format') {
    return true;
  }
  const action = (input.args[0] ?? '').toLowerCase();
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
    /(?:fix|format|generate|migrate|update)/i.test(input.args[1] ?? '')
  ) {
    return true;
  }
  return false;
}

function shellDisplayToken(token: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(token) ? token : JSON.stringify(token);
}

export function resolveStudioWorkspaceCommandPlan(input: {
  workspacePath: string;
  request: StudioWorkspaceCommandRequest;
}): StudioWorkspaceCommandPlan {
  const { request } = input;
  validateToken(request.executable, 'executable');
  if (!Array.isArray(request.args) || request.args.length > 100) {
    throw new Error('Studio workspace command args must contain at most 100 entries.');
  }
  request.args.forEach((arg, index) => validateToken(arg, `args[${index}]`));

  const cwd = path.resolve(input.workspacePath, request.cwd ?? '.');
  if (!isInside(input.workspacePath, cwd)) {
    throw new Error('Studio workspace command cwd escapes the selected workspace.');
  }

  const executableName = normalizedExecutableName(request.executable);
  const projectLocalExecutable = /^\.{1,2}[\\/]/.test(request.executable);
  if (path.isAbsolute(request.executable)) {
    throw new Error('Absolute executable paths are not allowed in autonomous workspace commands.');
  }
  if (!KNOWN_EXECUTABLES.has(executableName) && !projectLocalExecutable) {
    throw new Error(
      `Studio workspace command executable is not registered: ${request.executable}. Use a project-local wrapper or add a capability policy.`
    );
  }
  if (projectLocalExecutable) {
    const resolvedExecutable = path.resolve(cwd, request.executable);
    if (!isInside(input.workspacePath, resolvedExecutable)) {
      throw new Error('Project-local executable escapes the selected workspace.');
    }
  }
  validateCommandSemantics(executableName, request.args);
  assertArgumentPathsStayInWorkspace({
    workspacePath: input.workspacePath,
    cwd,
    args: request.args,
  });

  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? 120_000, 1_000), 600_000);
  return {
    executable: request.executable,
    args: [...request.args],
    cwd,
    purpose: request.purpose,
    timeoutMs,
    displayCommand: [request.executable, ...request.args].map(shellDisplayToken).join(' '),
    mutatesSource: commandMutatesSource(request, executableName),
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

export async function runStudioWorkspaceCommand(
  plan: StudioWorkspaceCommandPlan
): Promise<StudioWorkspaceCommandExecution> {
  const { execa } = await import('execa');
  const protectedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL|COOKIE|AUTH)/i.test(key)
    )
  );
  const result = await execa(plan.executable, plan.args, {
    cwd: plan.cwd,
    shell: false,
    reject: false,
    timeout: plan.timeoutMs,
    stdin: 'ignore',
    extendEnv: false,
    env: { ...protectedEnvironment, NO_COLOR: '1', CI: process.env.CI ?? '1' },
  });
  return {
    ...plan,
    exitCode: result.exitCode ?? null,
    stdout: boundedOutput(result.stdout ?? ''),
    stderr: boundedOutput(result.stderr ?? ''),
    timedOut: Boolean(result.timedOut),
  };
}
