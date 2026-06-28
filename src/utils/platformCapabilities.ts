import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

export type PlatformKind = 'windows' | 'linux' | 'macos' | 'other';

export type RapidkitExecutionSpec = {
  command: string;
  args: string[];
  displayCommand: string;
  shell: boolean;
};

export type PackageRunnerInvocation = {
  command: string;
  prefixArgs: string[];
};

/** Cached npm package specifier from global link / env. Undefined = not warmed yet. */
let resolvedPackageSpecifier: string | null | undefined;

const PACKAGE_RUNNER_COMMANDS = new Set(['npx', 'npm', 'yarn', 'pnpm']);

export function detectPlatformKind(platform: NodeJS.Platform = process.platform): PlatformKind {
  if (platform === 'win32') {
    return 'windows';
  }
  if (platform === 'linux') {
    return 'linux';
  }
  if (platform === 'darwin') {
    return 'macos';
  }
  return 'other';
}

export function isWindowsPlatform(platform: NodeJS.Platform = process.platform): boolean {
  return detectPlatformKind(platform) === 'windows';
}

export function quoteShellArg(arg: string, platform: NodeJS.Platform = process.platform): string {
  if (arg.length === 0) {
    return '""';
  }

  if (isWindowsPlatform(platform)) {
    if (!/[\s"^&|<>]/.test(arg)) {
      return arg;
    }
    return `"${arg.replace(/"/g, '""')}"`;
  }

  if (!/[\s'"$`\\]/.test(arg)) {
    return arg;
  }

  return `'${arg.replace(/'/g, `'"'"'`)}'`;
}

export function buildShellCommand(
  command: string,
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  const parts = [
    quoteShellArg(command, platform),
    ...args.map((arg) => quoteShellArg(arg, platform)),
  ];
  return parts.join(' ');
}

function packageRunnerCliBasename(command: string): string {
  return command === 'npx' ? 'npx-cli.js' : 'npm-cli.js';
}

function npmExecPathCandidate(command: string, env: NodeJS.ProcessEnv): string | null {
  const execPath = env.npm_execpath;
  if (!execPath) {
    return null;
  }

  const basename = path.basename(execPath).toLowerCase();
  if (command === 'npx' && basename !== 'npx-cli.js') {
    const sibling = path.join(path.dirname(execPath), 'npx-cli.js');
    return fs.existsSync(sibling) ? sibling : null;
  }
  if (command === 'npm' && basename === 'npx-cli.js') {
    const sibling = path.join(path.dirname(execPath), 'npm-cli.js');
    return fs.existsSync(sibling) ? sibling : null;
  }
  return fs.existsSync(execPath) ? execPath : null;
}

function wellKnownPackageRunnerCliCandidates(command: string): string[] {
  if (command !== 'npm' && command !== 'npx') {
    return [];
  }

  const cli = packageRunnerCliBasename(command);
  const nodeBinDir = path.dirname(process.execPath);
  const prefix = path.dirname(nodeBinDir);

  return [
    path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join(prefix, 'lib64', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'local', 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'share', 'nodejs', 'npm', 'bin', cli),
  ];
}

export function resolvePackageRunnerInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): PackageRunnerInvocation {
  const normalized = command.trim();
  if (!PACKAGE_RUNNER_COMMANDS.has(normalized)) {
    return { command: normalized, prefixArgs: [] };
  }

  const nodeBinDir = path.dirname(process.execPath);
  const extension = isWindowsPlatform(platform) ? '.cmd' : '';
  const candidates = [
    path.join(nodeBinDir, `${normalized}${extension}`),
    path.join(nodeBinDir, normalized),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { command: candidate, prefixArgs: [] };
    }
  }

  const npmExecPath = npmExecPathCandidate(normalized, env);
  if (npmExecPath) {
    return { command: process.execPath, prefixArgs: [npmExecPath] };
  }

  for (const candidate of wellKnownPackageRunnerCliCandidates(normalized)) {
    if (fs.existsSync(candidate)) {
      return { command: process.execPath, prefixArgs: [candidate] };
    }
  }

  if (normalized === 'npm') {
    return { command: 'corepack', prefixArgs: ['npm'] };
  }

  return { command: normalized, prefixArgs: [] };
}

export function setResolvedRapidkitNpmPackageSpecifier(specifier: string | null | undefined): void {
  resolvedPackageSpecifier = specifier;
}

export function resetResolvedRapidkitNpmPackageSpecifier(): void {
  resolvedPackageSpecifier = undefined;
}

export function getResolvedRapidkitNpmPackageSpecifier(): string | null | undefined {
  return resolvedPackageSpecifier;
}

function readEnvRapidkitPackageSpecifier(): string | undefined {
  const envSpec = process.env.RAPIDKIT_NPM_PACKAGE?.trim();
  return envSpec && envSpec.length > 0 ? envSpec : undefined;
}

/**
 * npx args that resolve the npm bridge CLI.
 * Prefer unpinned `npx --yes rapidkit` (global npm link / npm exec) because bare
 * `--package rapidkit` can delegate adopt/create frontend to the Python core.
 * When a globally linked file: package exists, pin to that path for reproducibility.
 */
export function buildNpxRapidkitPrefix(): string[] {
  const envSpec = readEnvRapidkitPackageSpecifier();
  const linkedSpec =
    resolvedPackageSpecifier !== undefined && resolvedPackageSpecifier !== null
      ? resolvedPackageSpecifier
      : undefined;
  const packageSpecifier = envSpec ?? linkedSpec;

  if (packageSpecifier) {
    return ['--yes', '--package', packageSpecifier, 'rapidkit'];
  }

  return ['--yes', 'rapidkit'];
}

export async function warmRapidkitNpmPackageResolution(): Promise<void> {
  if (readEnvRapidkitPackageSpecifier()) {
    resolvedPackageSpecifier = readEnvRapidkitPackageSpecifier();
    return;
  }

  if (resolvedPackageSpecifier !== undefined) {
    return;
  }

  try {
    const { run } = await import('./exec.js');
    const result = await run('npm', ['list', '-g', 'rapidkit', '--depth=0', '--json'], {
      timeout: 8000,
      stdio: 'pipe',
    });
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    if (!stdout.trim()) {
      resolvedPackageSpecifier = null;
      return;
    }

    const parsed = JSON.parse(stdout) as {
      dependencies?: { rapidkit?: { resolved?: string } };
    };
    const resolved = parsed.dependencies?.rapidkit?.resolved?.trim();
    if (resolved?.startsWith('file:')) {
      const filePath = resolved.slice('file:'.length);
      if (path.isAbsolute(filePath)) {
        resolvedPackageSpecifier = `file:${filePath}`;
        return;
      }

      // npm link reports a relative file: path — resolve via the global symlink target.
      const rootResult = await run('npm', ['root', '-g'], { timeout: 8000, stdio: 'pipe' });
      const npmRoot = rootResult.stdout?.trim();
      if (npmRoot) {
        const linkedPackageDir = path.join(npmRoot, 'rapidkit');
        if (await fs.pathExists(linkedPackageDir)) {
          const realPath = await fs.realpath(linkedPackageDir);
          resolvedPackageSpecifier = `file:${realPath}`;
          return;
        }
      }

      resolvedPackageSpecifier = null;
      return;
    }
  } catch {
    // Fall back to unpinned npx resolution.
  }

  resolvedPackageSpecifier = null;
}

export function buildRapidkitCommand(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  return buildShellCommand('npx', buildNpxRapidkitPrefix().concat(args), platform);
}

export function buildRapidkitDisplayCommand(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  return buildShellCommand('npx', ['rapidkit', ...args], platform);
}

export function toDisplayRapidkitCommand(command: string): string {
  return command
    .replace(/\bnpx\s+--yes\s+--package\s+[^\s]+\s+rapidkit\b/g, 'npx rapidkit')
    .replace(/\bnpx\s+--yes\s+rapidkit\b/g, 'npx rapidkit');
}

export function toPinnedRapidkitExecutionCommand(command: string): string {
  const prefix = buildShellCommand('npx', buildNpxRapidkitPrefix());
  return command.replace(/\bnpx\s+rapidkit\b/g, prefix);
}

export function buildNpxRapidkitArgs(args: string[] = []): string[] {
  return [...buildNpxRapidkitPrefix(), ...args];
}

/**
 * Canonical subprocess contract for extension-host RapidKit execution.
 *
 * Callers pass only RapidKit CLI args (`['workspace', 'verify', ...]`); this
 * function supplies the npm wrapper, display-safe command text, and the
 * platform shell mode in one place so enterprise paths do not rebuild npx
 * invocations ad hoc.
 */
export function buildRapidkitExecutionSpec(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): RapidkitExecutionSpec {
  const invocation = resolvePackageRunnerInvocation('npx', platform);
  return {
    command: invocation.command,
    args: [...invocation.prefixArgs, ...buildNpxRapidkitArgs(args)],
    displayCommand: buildRapidkitDisplayCommand(args, platform),
    shell: isWindowsPlatform(platform),
  };
}

/** Ensure subprocesses spawned from the extension host can find npx/npm (nvm, fnm, etc.). */
export function augmentPathWithNodeBin(
  pathEnv?: string,
  platform: NodeJS.Platform = process.platform
): string {
  const delimiter = isWindowsPlatform(platform) ? ';' : ':';
  const nodeBin = path.dirname(process.execPath);
  const parts = (pathEnv ?? process.env.PATH ?? '').split(delimiter).filter(Boolean);
  if (!parts.includes(nodeBin)) {
    parts.unshift(nodeBin);
  }
  return parts.join(delimiter);
}

/** Env for extension-host package runner subprocesses. */
export function buildPackageRunnerSubprocessEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PATH: augmentPathWithNodeBin(baseEnv.PATH, platform),
    COREPACK_HOME: baseEnv.COREPACK_HOME ?? path.join(os.tmpdir(), 'rapidkit-corepack'),
  };

  delete env.npm_config_package;
  delete env.npm_config__package;
  return env;
}

/** Non-pinned npx args for npm CLI version probes (Setup verify / status). */
export function buildNpxRapidkitVersionProbeArgs(): string[] {
  return ['--yes', 'rapidkit', '--version'];
}

/**
 * Setup "Verify CLI" terminal commands — match what developers run manually.
 * Pinned `npx --yes --package rapidkit rapidkit --version` can print the Python
 * core banner (`RapidKit Version v…`) when cwd shadows resolution; that is not
 * the npm bridge version shown on the Setup card.
 */
export function buildNpmCliVersionVerifyCommands(
  platform: NodeJS.Platform = process.platform
): string[] {
  return [
    buildRapidkitDisplayCommand(['--version'], platform),
    buildShellCommand('npm', ['list', '-g', 'rapidkit', '--depth=0'], platform),
  ];
}

export function parseNpmCliVersionOutput(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[\d]+\.[\d]+\.[\d]+(?:-[\w.]+)?$/i.test(trimmed)) {
    return trimmed;
  }

  if (/RapidKit Version/i.test(trimmed)) {
    return null;
  }

  const match = trimmed.match(/\b(\d+\.\d+\.\d+(?:-[\w.]+)?)\b/);
  return match?.[1] ?? null;
}

export function getWorkspaceVenvRapidkitCandidates(workspacePath: string): string[] {
  return [
    path.join(workspacePath, '.venv', 'bin', 'rapidkit'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.exe'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.cmd'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit'),
  ];
}
